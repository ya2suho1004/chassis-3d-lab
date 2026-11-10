// 기록 창 틀(설계 2026-11-10 §3·§8): 대화 상자 역할, 제목에 초점, Tab 돌리기, 닫은 뒤 초점, 창 안 스크롤만
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { focusRecordField, RecordWindow, restoreFocus, wrapTab } from '../src/screens/RecordWindow'

type WinProps = Parameters<typeof RecordWindow>[0]
const html = (over: Partial<WinProps> = {}) => renderToStaticMarkup(createElement(RecordWindow, { title: '축중 기록', onClose: () => {}, footer: createElement('button', null, '단계 완료'), children: createElement('p', null, '내용'), ...over }))

describe('기록 창 틀', () => {
  test('대화 상자 역할·제목·닫기·내용·아래 줄', () => {
    const h = html()
    expect(h).toMatch(/role="dialog" aria-modal="true" aria-labelledby="rec-title"/)
    expect(h).toContain('<h2 id="rec-title" tabindex="-1">축중 기록</h2>')
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
})
