// 도감 창(설계 docs/superpowers/specs/2026-11-16-codex-window-design.md §3-2): 정적 그림(서버 렌더)과 원본 글로 확인한다.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import rawLayout from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { CodexWindow, KIND_ICON, iconForKind } from '../src/screens/CodexWindow'
import { ICON_NAMES } from '../src/screens/Icon'

const layout = loadSceneLayout(rawLayout)
const render = (collected: string[], note = '이 기기에만 남습니다.') =>
  renderToStaticMarkup(createElement(CodexWindow, { equipment: layout.equipment, collected, note, onClose: () => {} }))
const src = readFileSync('src/screens/CodexWindow.tsx', 'utf8')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

describe('읽기 도구용 역할·이름', () => {
  test('모달 대화 상자이고 제목과 이어진다', () => {
    const h = render([])
    expect(h).toContain('role="dialog"')
    expect(h).toContain('aria-modal="true"')
    expect(h).toContain('aria-labelledby="codex-title"')
    expect(h).toMatch(/<h2 id="codex-title" tabindex="-1">도감 0\/23<\/h2>/)
  })
  test('닫기 버튼은 이름이 있고 누름 느낌 표시만 단다', () => {
    expect(render([])).toMatch(/<button class="codex-x" data-feel="press" aria-label="도감 닫기">/)
  })
})

describe('카드', () => {
  const seenIds = [layout.equipment[3]!.id, layout.equipment[0]!.id]
  const h = render(seenIds)
  const cards = h.match(/<li class="codex-card[^"]*"/g) ?? []
  test('머리 숫자는 모은 장비 수', () => {
    expect(h).toContain('>도감 2/23</h2>')
  })
  test('23장, 배치 순서 그대로(모은 것만 앞으로 오지 않는다)', () => {
    expect(cards).toHaveLength(23)
    expect(cards.map((c) => (c.includes(' seen') ? 's' : 'u'))).toEqual(layout.equipment.map((e) => (seenIds.includes(e.id) ? 's' : 'u')))
  })
  test('모은 장비: 종류 그림·이름·설명(장비 카드의 글 그대로)', () => {
    for (const id of seenIds) {
      const e = layout.equipment.find((x) => x.id === id)!
      expect(h).toContain(`<b class="codex-name">${esc(e.label)}</b>`)
      expect(h).toContain(`<p class="codex-info">${esc(e.info)}</p>`)
    }
    expect(h.match(/<span class="codex-ico"[^>]*><svg class="ico"/g)).toHaveLength(2)
  })
  test('못 본 장비: "?"와 "아직 못 본 장비"만. 이름·설명이 화면에 없다', () => {
    expect(h.match(/<span class="codex-ico unseen" aria-hidden="true">\?<\/span><b class="codex-name">아직 못 본 장비<\/b>/g)).toHaveLength(21)
    for (const e of layout.equipment.filter((x) => !seenIds.includes(x.id))) {
      expect(h, e.id).not.toContain(esc(e.label))
      expect(h, e.id).not.toContain(esc(e.info))
      expect(h, e.id).not.toContain(e.id)
    }
  })
  test('아무것도 모으지 않았으면 어떤 장비 이름·설명·번호도 없다', () => {
    const none = render([])
    for (const e of layout.equipment) {
      expect(none).not.toContain(esc(e.label))
      expect(none).not.toContain(esc(e.info))
      expect(none).not.toContain(e.id)
    }
  })
  test('과제 관련 표시가 없다(작동 장비·단계·다음·정오·과제)', () => {
    const all = render(layout.equipment.map((e) => e.id))
    const infoFree = layout.equipment.reduce((s, e) => s.split(esc(e.info)).join('').split(esc(e.label)).join(''), all)
    expect(infoFree).not.toMatch(/작동|단계|다음|정답|오답|맞음|틀림|과제|판정|interactive|data-id/)
  })
  test('창 안의 안내 글(저장 방식)을 보여 준다', () => {
    expect(render([], '기록 없이 하기: 이번에만 모읍니다.')).toContain('기록 없이 하기: 이번에만 모읍니다.')
  })
})

describe('종류 그림', () => {
  test('배치 자료의 모든 종류에 그림이 있고, 모두 아이콘 목록에 있는 이름이다', () => {
    for (const k of new Set(layout.equipment.map((e) => e.kind))) {
      expect(KIND_ICON[k], k).toBeDefined()
      expect(ICON_NAMES).toContain(KIND_ICON[k])
    }
  })
  test('모르는 종류는 공구 그림', () => {
    expect(iconForKind('newKind')).toBe('wrench')
  })
})

describe('닫기·초점·조용함(원본 글)', () => {
  test('Esc(한글 조합 중 제외)와 바깥(어두운 바탕) 누르기로 닫는다', () => {
    expect(src).toContain("if (e.key === 'Escape' && !e.nativeEvent.isComposing) { e.stopPropagation(); onClose(); return }")
    expect(src).toContain('onClick={(e) => { if (e.target === e.currentTarget) onClose() }}')
  })
  test('열 때 초점을 제목에, Tab은 창 안에서 돈다', () => {
    expect(src).toContain('titleRef.current?.focus({ preventScroll: true })')
    expect(src).toContain('wrapTab(')
  })
  test('닫으면 연 버튼으로 초점을 돌린다(연 버튼을 모르면 도감 버튼)', () => {
    expect(src).toContain("document.querySelector<HTMLElement>('.g-codexbtn, .codex-openbtn')")
    // 개발 모드(StrictMode)처럼 닫힌 직후 다시 열렸으면 돌려주지 않는다(제목 초점을 빼앗지 않게)
    expect(src).toContain("if (document.querySelector('.codex-win')) return")
  })
  test('창은 소리·연출·기록 사건을 내지 않는다(누름 느낌 표시만)', () => {
    expect(src).not.toMatch(/fire\(|LabSound|sound\.|reactionsFor|feelEvents|Repository|from '\.\.\/(domain|delivery|records)|appendEvent|logEvent/)
  })
  test('컬러 이모지를 쓰지 않는다', () => {
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })
})
