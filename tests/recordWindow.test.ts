// 기록 창 틀(설계 2026-11-10 §3·§8): 대화 상자 역할, 제목에 초점, Tab 돌리기, 닫은 뒤 초점, 창 안 스크롤만
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { focusRecordField, RecordWindow, restoreFocus, wrapTab } from '../src/screens/RecordWindow'

type WinProps = Parameters<typeof RecordWindow>[0]
const html = (over: Partial<WinProps> = {}) => renderToStaticMarkup(createElement(RecordWindow, { title: '축중 기록', onClose: () => {}, footer: createElement('button', null, '단계 완료'), children: createElement('p', null, '내용'), ...over }))

describe('기록 창 틀', () => {
  test('대화 상자 역할·제목·닫기·내용·아래 줄', () => {
    const h = html()
    expect(h).toMatch(/role="dialog" aria-modal="true" aria-labelledby="rec-title"/)
    expect(h).toContain('<h2 id="rec-title" tabindex="-1">축중 기록</h2>')
    expect(h).toContain('<div class="g-recordwrap" tabindex="-1">')
    expect(h).toContain('aria-label="기록 창 닫기"')
    expect(h).toContain('<p>내용</p>')
    expect(h).toContain('<div class="rec-foot"><button>단계 완료</button></div>')
    expect(h).not.toContain('AI 교관에게 질문')
  })
  test('AI 질문은 넘겨받았을 때만 창 머리에', () => {
    expect(html({ onAskAi: () => {} })).toContain('>AI 교관에게 질문</button>')
  })
})

describe('Tab 돌리기', () => {
  const a = {} as HTMLElement, b = {} as HTMLElement, c = {} as HTMLElement
  test('끝에서 앞으로, 처음에서 뒤로 돌고, 사이에서는 브라우저에 맡긴다', () => {
    expect(wrapTab([a, b, c], c, false)).toBe(a)
    expect(wrapTab([a, b, c], a, true)).toBe(c)
    expect(wrapTab([a, b, c], b, false)).toBeNull()
    expect(wrapTab([a, b, c], null, false)).toBe(a)
    expect(wrapTab([], a, false)).toBeNull()
    expect(wrapTab([a, b, c], b, true)).toBeNull()
    expect(wrapTab([a, b, c], null, true)).toBe(c)
  })
})

describe('닫은 뒤 초점', () => {
  const el = (over: { isConnected?: boolean; rects?: number } = {}) => {
    const calls: string[] = []
    const node = { isConnected: over.isConnected ?? true, disabled: false, tagName: 'BUTTON', getClientRects: () => ({ length: over.rects ?? 1 }), focus: () => calls.push('focus') } as unknown as HTMLElement
    return { node, calls }
  }
  const doc = (map: Record<string, HTMLElement>) => ({ querySelector: (s: string) => map[s] ?? null }) as unknown as Pick<Document, 'querySelector'>
  test('연 버튼이 보이면 그것', () => {
    const o = el()
    expect(restoreFocus(o.node, doc({}))).toBe(o.node)
    expect(o.calls).toEqual(['focus'])
  })
  test('연 버튼이 사라졌으면 다시 열린 목록의 닫기, 없으면 행동 버튼, 없으면 작업 목록 버튼', () => {
    const gone = el({ isConnected: false }).node, x = el().node, act = el().node, list = el().node
    expect(restoreFocus(gone, doc({ '.g-drawer.open > .g-x': x, '.g-actions > .g-act': act, '.g-quest-btns > button': list }))).toBe(x)
    expect(restoreFocus(gone, doc({ '.g-actions > .g-act': act, '.g-quest-btns > button': list }))).toBe(act)
    expect(restoreFocus(el({ rects: 0 }).node, doc({ '.g-quest-btns > button': list }))).toBe(list)
    expect(restoreFocus(null, doc({}))).toBeNull()
  })
  test('고른 버튼에 실제로 초점이 간다', () => {
    const gone = el({ isConnected: false }).node, x = el()
    restoreFocus(gone, doc({ '.g-drawer.open > .g-x': x.node }))
    expect(x.calls).toEqual(['focus'])
  })
  test('숨겨진(visibility:hidden) 버튼은 건너뛴다', () => {
    const hidden = el(), list = el()
    vi.stubGlobal('getComputedStyle', (n: unknown) => ({ visibility: n === hidden.node ? 'hidden' : 'visible' }))
    try { expect(restoreFocus(hidden.node, doc({ '.g-quest-btns > button': list.node }))).toBe(list.node) } finally { vi.unstubAllGlobals() }
  })
  test('all=false면 연 버튼·목록 닫기만 본다', () => {
    const gone = el({ isConnected: false }).node, act = el().node, list = el().node
    expect(restoreFocus(gone, doc({ '.g-actions > .g-act': act, '.g-quest-btns > button': list }), false)).toBeNull()
  })
})

describe('창 안 칸으로', () => {
  test('칸의 줄이 창 안에 보이게 scrollTop만 바꾸고 초점을 준다', () => {
    const body = { scrollTop: 100, getBoundingClientRect: () => ({ top: 100, bottom: 400 }) }
    const row = { getBoundingClientRect: () => ({ top: 450, bottom: 520 }), closest: (s: string) => (s === '.rec-body' ? body : null) }
    const calls: string[] = []
    const input = { closest: (s: string) => (s === '.rec-row' ? row : null), focus: (o: unknown) => calls.push(JSON.stringify(o)), scrollIntoView: () => calls.push('scrollIntoView') }
    const d = { getElementById: (id: string) => (id === 'rec-axleWeight' ? input : null) } as unknown as Pick<Document, 'getElementById'>
    expect(focusRecordField(d, 'axleWeight')).toBe(true)
    expect(body.scrollTop).toBe(228)
    expect(calls).toEqual(['{"preventScroll":true}'])
    expect(focusRecordField(d, 'left')).toBe(false)
  })
  test('줄(.rec-row)이 없으면 칸 한 줄(.field), 비채점 칸이면 이름까지(.rec-note)를 보인다', () => {
    for (const hit of ['.field', '.rec-note']) {
      const body = { scrollTop: 0, getBoundingClientRect: () => ({ top: 100, bottom: 400 }) }
      const box = { getBoundingClientRect: () => ({ top: 380, bottom: 430 }), closest: (s: string) => (s === '.rec-body' ? body : null) }
      const input = { closest: (s: string) => (s === hit ? box : null), focus: () => {} }
      const d = { getElementById: () => input } as unknown as Pick<Document, 'getElementById'>
      expect(focusRecordField(d, 'deviation')).toBe(true)
      expect(body.scrollTop).toBe(38)
    }
  })
})

describe('배선', () => {
  test('연 버튼은 처음 한 번만 기억하고, 돌려줄 때 먼저 연 버튼·목록 닫기만 본다', () => {
    const src = fs.readFileSync('src/screens/RecordWindow.tsx', 'utf8')
    expect(src).toContain('if (openerRef.current === undefined)')
    expect(src).toContain('restoreFocus(opener, document, false)')
  })
})
