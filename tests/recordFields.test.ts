// 기록 칸(설계 2026-11-10 §9): 서랍과 창이 같은 칸을 쓰되 id·판정 라디오 이름을 나눈다. Enter 제출용 form은 없다
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { recordInputId, responseInputId } from '../src/app/focusResponse'
import { NumberField, VerdictField, type FieldIo } from '../src/screens/RecordFields'

const io = (over: Partial<FieldIo> = {}): FieldIo => ({
  value: (id) => (id === 'axleWeight' ? '600' : id === 'vehicleCondition' ? 'fail' : ''),
  change: () => {}, submit: () => {}, mark: () => ({ text: '저장', cls: '' }), open: () => true, idOf: recordInputId, ...over,
})

describe('창 칸 id', () => {
  test('작업 목록은 resp-, 기록 창은 rec-', () => {
    expect(responseInputId('axleWeight')).toBe('resp-axleWeight')
    expect(recordInputId('axleWeight')).toBe('rec-axleWeight')
  })
})

describe('기록 칸', () => {
  test('숫자 칸: 이름·값·입력 버튼·표시', () => {
    const h = renderToStaticMarkup(createElement(NumberField, { itemId: 'axleWeight', io: io() }))
    expect(h).toContain('<label for="rec-axleWeight">축중</label>')
    expect(h).toMatch(/id="rec-axleWeight" inputMode="numeric"[^>]*value="600"/)
    expect(h).toMatch(/>입력<\/button>/)
    expect(h).toContain('<span class="mark ">저장</span>')
    expect(h).not.toMatch(/<form/)
  })
  test('닫힌 칸은 칸과 버튼이 모두 막힌다', () => {
    const h = renderToStaticMarkup(createElement(NumberField, { itemId: 'left', io: io({ open: () => false, idOf: (id) => responseInputId(id) }) }))
    expect(h).toContain('id="resp-left"')
    expect(h.match(/disabled=""/g)?.length).toBe(2)
  })
  test('소수 칸은 decimal 자판', () => {
    expect(renderToStaticMarkup(createElement(NumberField, { itemId: 'radius', io: io(), decimal: true }))).toContain('inputMode="decimal"')
  })
  test('판정: 받은 라디오 이름을 쓰고, 고른 값에 표시가 된다', () => {
    const h = renderToStaticMarkup(createElement(VerdictField, { io: io(), radioName: 'rec-verdict' }))
    expect(h.match(/name="rec-verdict"/g)?.length).toBe(2)
    expect(h).toContain('id="rec-vehicleCondition"')
    expect(h).toMatch(/checked=""[^>]*\/> 불량/)
  })
})
