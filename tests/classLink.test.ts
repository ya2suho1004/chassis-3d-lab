// 수업 주소(설계 docs/superpowers/specs/2026-11-14-student-number-and-class-link-design.md §3-4):
// 교사 설정을 주소의 # 뒤에 담아 학생 기기에 전달한다. 서버 요청에 실리지 않고, 개인 정보는 담지 않는다.
import { describe, expect, test, vi } from 'vitest'
import { CLASS_LINK_FORMAT, CLASS_LINK_MAX, classLinkUrl, readClassLink, takeClassLink } from '../src/app/classLink'
import { caseKey, parsePreset, type TeacherPreset } from '../src/app/teacherPreset'
import { listTasks } from '../src/app/session'
import { SESSIONS, selectableSession } from '../src/app/sessions'
import { qrMatrix } from '../src/teacher/qr'
import { decodeWithCv, hasCv } from './helpers/qrDecode'

const known = listTasks().map(caseKey)
const PROD = 'https://chassis-3d-lab.vercel.app/'
const p0: TeacherPreset = { sessionCode: 'DEMO-ONLY', caseId: known[0]!, usagePhase: 'preview', difficultyMode: 'guided', vehicleEntryDirection: null }

/** 교사 화면에서 저장할 수 있는 설정 전부(세션 규칙으로 고친 뒤) */
function allPresets(): TeacherPreset[] {
  const out: TeacherPreset[] = []
  for (const s of SESSIONS.filter((x) => selectableSession(x.code)))
    for (const caseId of known) for (const usagePhase of ['preview', 'review', 'other'] as const)
      for (const difficultyMode of ['guided', 'unguided'] as const) for (const vehicleEntryDirection of [null, 'north', 'south'] as const) {
        const p = parsePreset(JSON.stringify({ sessionCode: s.code, caseId, usagePhase, difficultyMode, vehicleEntryDirection }), known)!
        if (!out.some((q) => JSON.stringify(q) === JSON.stringify(p))) out.push(p)
      }
  return out
}

describe('주소 만들기', () => {
  test('형식: # 뒤에 판(v)·세션(s)·과제 사례(t)·차시(p)·도움 방식(m)·진입 방향(d)만 짧게 적는다', () => {
    expect(CLASS_LINK_FORMAT).toBe('1')
    expect(classLinkUrl(PROD, p0)).toBe(`${PROD}#v=1&s=DEMO-ONLY&t=${known[0]}&p=p&m=g&d=x`)
    expect(classLinkUrl(PROD, { ...p0, sessionCode: 'REH-L5', caseId: known[3]!, usagePhase: 'review', difficultyMode: 'unguided', vehicleEntryDirection: 'south' }))
      .toBe(`${PROD}#v=1&s=REH-L5&t=${known[3]}&p=r&m=u&d=s`)
  })

  test('바탕 주소의 # 값은 떼고 붙인다', () => {
    expect(classLinkUrl('http://127.0.0.1:4325/#v=1&s=X', p0)).toBe(`http://127.0.0.1:4325/#v=1&s=DEMO-ONLY&t=${known[0]}&p=p&m=g&d=x`)
  })

  test('운영 주소에 붙인 모든 설정 조합이 106자(QR 한도) 안이고, 읽으면 같은 설정이 나온다', () => {
    expect(CLASS_LINK_MAX).toBe(106)
    const all = allPresets()
    expect(all.length).toBeGreaterThan(50)
    let longest = 0
    for (const p of all) {
      const url = classLinkUrl(PROD, p)!
      longest = Math.max(longest, url.length)
      expect(url.length, url).toBeLessThanOrEqual(CLASS_LINK_MAX)
      expect(readClassLink(url, known)).toEqual({ kind: 'ok', preset: p })
    }
    expect(longest).toBeLessThanOrEqual(100) // 운영 주소 기준 여유
  })

  test('바탕 주소가 길어 106자를 넘으면 만들지 않는다(null)', () => {
    expect(classLinkUrl(`https://example.com/${'a'.repeat(60)}/`, p0)).toBeNull()
  })

  test('개인 정보 칸이 없다: 학번·이름은 주소에 들어갈 자리가 없다', () => {
    const url = classLinkUrl(PROD, p0)!
    const keys = [...new URLSearchParams(url.split('#')[1]).keys()]
    expect(keys).toEqual(['v', 's', 't', 'p', 'm', 'd'])
  })
})

describe('주소 읽기', () => {
  const ok = classLinkUrl(PROD, p0)!
  const withParam = (k: string, v: string) => { const [b, h] = ok.split('#'); const q = new URLSearchParams(h); q.set(k, v); return `${b}#${q.toString()}` }

  test('# 값이 없으면 none', () => {
    expect(readClassLink(PROD, known)).toEqual({ kind: 'none' })
    expect(readClassLink(`${PROD}#`, known)).toEqual({ kind: 'none' })
    expect(readClassLink(`${PROD}?q=low`, known)).toEqual({ kind: 'none' })
  })

  test('개발 서버 주소·품질 값이 붙은 주소도 읽는다', () => {
    expect(readClassLink(`http://127.0.0.1:4325/?q=low#${ok.split('#')[1]}`, known)).toEqual({ kind: 'ok', preset: p0 })
  })

  test('판이 다르면 적용하지 않는다', () => {
    expect(readClassLink(withParam('v', '2'), known)).toEqual({ kind: 'bad', reason: 'version' })
    expect(readClassLink(ok.replace('v=1&', ''), known)).toEqual({ kind: 'bad', reason: 'version' })
  })

  test('잠긴 세션(연구, IRB 전)·모르는 세션은 적용하지 않는다', () => {
    expect(readClassLink(withParam('s', 'EXP-L12'), known)).toEqual({ kind: 'bad', reason: 'value' })
    expect(readClassLink(withParam('s', 'USAB'), known)).toEqual({ kind: 'bad', reason: 'value' })
    expect(readClassLink(withParam('s', 'NOPE'), known)).toEqual({ kind: 'bad', reason: 'value' })
  })

  test('알 수 없는 값은 적용하지 않는다', () => {
    for (const [k, v] of [['t', 'case-unknown'], ['p', 'q'], ['p', 'preview'], ['m', 't'], ['d', 'e'], ['d', '']] as const)
      expect(readClassLink(withParam(k, v), known), `${k}=${v}`).toEqual({ kind: 'bad', reason: 'value' })
  })

  test('모르는 칸·겹친 칸·깨진 글자는 적용하지 않는다', () => {
    expect(readClassLink(`${ok}&n=x`, known)).toEqual({ kind: 'bad', reason: 'format' })
    expect(readClassLink(`${ok}&n=${encodeURIComponent('홍길동')}`, known).kind).toBe('bad')
    expect(readClassLink(`${ok}&s=DEMO-ONLY`, known)).toEqual({ kind: 'bad', reason: 'format' })
    expect(readClassLink(`${PROD}#c=A-01`, known)).toEqual({ kind: 'bad', reason: 'format' })
    expect(readClassLink(`${PROD}#%E0%A4%A`, known)).toEqual({ kind: 'bad', reason: 'format' })
    expect(readClassLink(`${PROD}#top`, known)).toEqual({ kind: 'bad', reason: 'format' })
  })

  test('106자를 넘는 주소는 적용하지 않는다', () => {
    expect(readClassLink(`https://example.com/${'a'.repeat(60)}/#${ok.split('#')[1]}`, known)).toEqual({ kind: 'bad', reason: 'length' })
  })

  test('세션이 정한 차시·도움 방식은 주소로 바꿀 수 없다(applySessionRules)', () => {
    const r = readClassLink(`${PROD}#v=1&s=REH-L5&t=${known[0]}&p=p&m=g&d=n`, known)
    expect(r).toEqual({ kind: 'ok', preset: { sessionCode: 'REH-L5', caseId: known[0], usagePhase: 'review', difficultyMode: 'unguided', vehicleEntryDirection: 'north' } })
  })
})

describe('앱이 열릴 때 적용', () => {
  const env = (href: string, saveOk = true) => {
    const save = vi.fn(() => saveOk)
    const replaceState = vi.fn()
    return { env: { href, save, replaceState }, save, replaceState }
  }

  test('읽으면 기기에 저장하고 주소의 # 값을 지운다(품질 값 같은 ? 값은 둔다)', () => {
    const e = env(`http://127.0.0.1:4325/?q=low#${classLinkUrl(PROD, p0)!.split('#')[1]}`)
    expect(takeClassLink(e.env, known)).toEqual({ kind: 'ok', preset: p0, saved: true })
    expect(e.save).toHaveBeenCalledWith(p0)
    expect(e.replaceState).toHaveBeenCalledWith('http://127.0.0.1:4325/?q=low')
  })

  test('읽지 못하면 저장하지 않고(이전 설정 그대로) # 값도 둔다 — 새로고침해도 안내가 남는다', () => {
    const e = env(`${PROD}#v=9&s=DEMO-ONLY`)
    expect(takeClassLink(e.env, known)).toEqual({ kind: 'bad', reason: 'version' })
    expect(e.save).not.toHaveBeenCalled()
    expect(e.replaceState).not.toHaveBeenCalled()
  })

  test('# 값이 없으면 아무것도 하지 않는다', () => {
    const e = env(PROD)
    expect(takeClassLink(e.env, known)).toEqual({ kind: 'none' })
    expect(e.save).not.toHaveBeenCalled()
    expect(e.replaceState).not.toHaveBeenCalled()
  })

  test('저장하지 못하면(브라우저 저장 제한) 이번 화면에서만 쓰고 # 값을 남겨 다시 열 때 또 적용한다', () => {
    const e = env(classLinkUrl(PROD, p0)!, false)
    expect(takeClassLink(e.env, known)).toEqual({ kind: 'ok', preset: p0, saved: false })
    expect(e.replaceState).not.toHaveBeenCalled()
  })
})

describe.skipIf(!hasCv)('운영 주소 + 실제 설정 조합의 QR을 판독기로 읽으면 주소가 그대로 나온다', () => {
  const picks = allPresets().filter((_, i) => i % 11 === 0) // 진입 방향·차시·세션이 고루 섞이게
  const longest = allPresets().map((p) => classLinkUrl(PROD, p)!).sort((a, b) => b.length - a.length)[0]!
  test.each([...picks.map((p) => classLinkUrl(PROD, p)!), longest])('%s', (url) => {
    expect(decodeWithCv(qrMatrix(url))).toBe(url)
  })
})
