// 시작 화면 — 학번 입장과 오늘 과제 한 줄(설계 docs/superpowers/specs/2026-11-14-student-number-and-class-link-design.md §3-2·§3-3).
// 서버 없이 그려 본다(저장소는 효과에서만 읽으므로 그리기에는 쓰이지 않는다).
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { StartScreen } from '../src/screens/StartScreen'
import { caseKey, PRESET_KEY, type TeacherPreset } from '../src/app/teacherPreset'
import { listTasks } from '../src/app/session'
import type { ClassLinkTaken } from '../src/app/classLink'
import type { Repository } from '../src/records/repository'

const tasks = listTasks()
const repo = {} as Repository
const render = (classLink?: ClassLinkTaken) => renderToStaticMarkup(createElement(StartScreen, { repo, onStart: async () => null, classLink }))
const withPreset = (p: Partial<TeacherPreset> | null) => {
  const store = new Map<string, string>()
  if (p) store.set(PRESET_KEY, JSON.stringify({ sessionCode: 'DEMO-ONLY', caseId: caseKey(tasks[0]!), usagePhase: 'preview', difficultyMode: 'guided', vehicleEntryDirection: null, ...p }))
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) })
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

afterEach(() => { vi.unstubAllGlobals() })

describe('학번 입장', () => {
  test('교사 설정이 없으면 기본값(시연 세션)으로 학번 네 자리를 받는다 — 숫자 자판', () => {
    withPreset(null)
    const html = render()
    expect(html).toMatch(/<input[^>]*aria-label="학번"/)
    expect(html).toMatch(/inputMode="numeric"|inputmode="numeric"/)
    expect(html).toMatch(/maxLength="4"|maxlength="4"/)
    expect(html).toMatch(/placeholder="2211"/)
    const t = text(html)
    expect(t).toMatch(/학번 네 자리/)
    expect(t).toMatch(/2학년 2반 11번 → 2211/)
    expect(t).toMatch(/이름·연락처는 넣지 않아요\./)
    expect(t).not.toMatch(/이름·학번·연락처/)
    expect(t).not.toMatch(/익명 코드|가명 코드/)
  })

  test('리허설 세션이면 가상 코드 안내를 보인다', () => {
    withPreset({ sessionCode: 'REH-L12' })
    const html = render()
    expect(html).toMatch(/<input[^>]*aria-label="가상 코드"/)
    expect(html).toMatch(/placeholder="D-01"/)
    expect(text(html)).toMatch(/가상 코드/)
    expect(text(html)).not.toMatch(/학번/)
  })
})

describe('오늘 과제 한 줄 — 학생은 고르지 않는다', () => {
  test('고르기 입력(라디오)이 없고, 교사 설정이 없으면 기본값을 한 줄로 보인다', () => {
    withPreset(null)
    const html = render()
    expect(html).not.toMatch(/type="radio"/)
    expect(text(html)).toContain(`오늘 과제 ${tasks[0]!.title} · 1~2차시 연습 · 안내 있음(견습)`)
  })

  test('교사 설정이 있으면 그 값으로(5차시는 안내 없음)', () => {
    withPreset({ caseId: caseKey(tasks[2]!), usagePhase: 'review', difficultyMode: 'guided' })
    expect(text(render())).toContain(`오늘 과제 ${tasks[2]!.title} · 5차시 정리 · 안내 없음(정비사)`)
  })

  test('예전 저장값(locked: false)이어도 고르기를 보이지 않는다', () => {
    withPreset({ locked: false } as Partial<TeacherPreset>)
    expect(render()).not.toMatch(/type="radio"/)
  })

  test('기록 없이 하기와 교사 화면 링크는 그대로 둔다', () => {
    withPreset(null)
    const t = text(render())
    expect(t).toMatch(/기록 없이 하기/)
    expect(t).toMatch(/학번 없이 같은 과제를 해요/)
    expect(t).toMatch(/교사 화면\(수업 설정·기록 관리\)/)
  })
})

describe('수업 주소 안내', () => {
  test('읽지 못한 주소면 안내를 보이고 이전 설정은 그대로', () => {
    withPreset({ caseId: caseKey(tasks[1]!) })
    const t = text(render({ kind: 'bad', reason: 'version' }))
    expect(t).toMatch(/수업 주소를 읽지 못했어요\. 선생님께 알려 주세요\./)
    expect(t).toContain(`오늘 과제 ${tasks[1]!.title}`)
  })

  test('읽은 주소·주소 없음이면 안내가 없다', () => {
    withPreset(null)
    expect(render({ kind: 'none' })).not.toMatch(/수업 주소/)
    expect(render({ kind: 'ok', saved: true, preset: { sessionCode: 'DEMO-ONLY', caseId: caseKey(tasks[0]!), usagePhase: 'preview', difficultyMode: 'guided', vehicleEntryDirection: null } })).not.toMatch(/수업 주소/)
  })

  test('기기에 저장하지 못한 주소 설정도 이번 화면에서는 쓴다', () => {
    withPreset(null)
    const preset: TeacherPreset = { sessionCode: 'REH-L5', caseId: caseKey(tasks[3]!), usagePhase: 'review', difficultyMode: 'unguided', vehicleEntryDirection: 'south' }
    const t = text(render({ kind: 'ok', saved: false, preset }))
    expect(t).toContain(`오늘 과제 ${tasks[3]!.title} · 5차시 정리`)
    expect(t).toMatch(/가상 코드/)
  })

  test('앱이 열릴 때 한 번 주소를 읽어 시작 화면까지 넘긴다', () => {
    const main = fs.readFileSync('src/main.tsx', 'utf8')
    expect(main).toMatch(/takeClassLink\(\{ href: window\.location\.href, save: savePreset,/)
    expect(main.indexOf('takeClassLink(')).toBeLessThan(main.indexOf('.render('))
    expect(main).toMatch(/<App classLink=\{classLink\} \/>/)
    expect(fs.readFileSync('src/App.tsx', 'utf8')).toMatch(/<StartScreen repo=\{repo!\} classLink=\{classLink\}/)
  })
})

describe('글', () => {
  test('시작 화면 원본에 고르기 상태와 예전 잠금이 남아 있지 않다', () => {
    const src = fs.readFileSync('src/screens/StartScreen.tsx', 'utf8')
    expect(src).not.toMatch(/start-pick|setTaskIdx|setMode|setPhase|locked/)
    expect(src).not.toMatch(/익명 코드|가명 코드/)
    expect(src).toMatch(/validateStudentCode\(code, sessionCode\)/)
  })
})

describe('촬영 도구(scripts/lookdev/lookdev.mjs)', () => {
  const src = fs.readFileSync('scripts/lookdev/lookdev.mjs', 'utf8')
  test('새 규칙에 맞는 가상 학번 3999로 들어간다', async () => {
    const { validateStudentCode } = await import('../src/app/session')
    expect(src).toMatch(/input\[aria-label="학번"\]/)
    expect(src).toMatch(/insertText', \{ text: '3999' \}/)
    expect(validateStudentCode('3999', 'DEMO-ONLY')).toEqual({ ok: true, code: '3999' })
    expect(src).not.toMatch(/A-01|start-pick/)
  })
  test('과제·도움 방식은 수업 주소로 정하고, 그 사례가 실제 과제 목록에 있다', async () => {
    const { readClassLink } = await import('../src/app/classLink')
    const cases = [...src.matchAll(/(brake|turning): '([^']+)'/g)].map((m) => m[2]!)
    expect(cases).toHaveLength(2)
    for (const c of cases) for (const m of ['g', 'u'])
      expect(readClassLink(`http://127.0.0.1:4325/?q=high#v=1&s=DEMO-ONLY&t=${c}&p=p&m=${m}&d=x`, tasks.map(caseKey)).kind).toBe('ok')
    expect(src).toMatch(/#v=1&s=DEMO-ONLY&t=\$\{LOOKDEV_CASE\[/)
  })
})
