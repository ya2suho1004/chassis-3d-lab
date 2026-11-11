// 계산기 계산 규칙(계산기 설계 §2) — 일반(누르는 차례대로 바로 계산)·공학용(식, 곱셈·나눗셈 먼저, 괄호·sin 도)
import { describe, expect, test } from 'vitest'
import { basicInit, basicPress, basicView, displayExpr, evaluateExpression, formatCalc, sciInit, sciPress, sciView, type BasicKey, type CalcEvaluation, type SciKey } from '../src/app/calculator'

function run<S, K extends string>(init: () => S, press: (s: S, k: K) => { state: S; evaluated: CalcEvaluation | null }, seq: string) {
  let st = init()
  const ev: CalcEvaluation[] = []
  for (const k of seq.split(' ')) { const r = press(st, k as K); st = r.state; if (r.evaluated) ev.push(r.evaluated) }
  return { st, ev }
}
const runBasic = (seq: string) => { const r = run(basicInit, basicPress, seq); return { ...r, view: basicView(r.st) } }
const runSci = (seq: string) => { const r = run(sciInit, sciPress, seq); return { ...r, view: sciView(r.st) } }

describe('표시', () => {
  test('10자리 유효숫자, 끝의 0 지움, 소수 첫째 자리에서 자르지 않음', () => {
    expect(formatCalc((40 / 600) * 100)).toBe('6.666666667')
    expect(formatCalc(0.49999999999999994)).toBe('0.5')
    expect(formatCalc(5.500000000000001)).toBe('5.5')
    expect(formatCalc(-0)).toBe('0')
    expect(formatCalc(10)).toBe('10')
    expect(formatCalc(1e-7)).toBe('1e-7')
    expect(formatCalc(Infinity)).toBeNull()
    expect(displayExpr('240-200/600*100')).toBe('240−200÷600×100')
  })
})

describe('일반 계산기(제동력): 누르는 차례대로 바로 계산', () => {
  test('240 − 200 ÷ 600 × 100 = 은 왼쪽부터 계산해 6.666666667', () => {
    const { ev, view } = runBasic('2 4 0 - 2 0 0 / 6 0 0 * 1 0 0 =')
    expect(ev).toEqual([{ expression: '240-200/600*100', result: '6.666666667', error: null }])
    expect(view).toEqual({ process: '240−200÷600×100 =', main: '6.666666667' })
  })
  test('연산자를 누르면 그때까지의 결과를 보인다', () => {
    expect(runBasic('2 4 0 - 2 0 0 /').view).toEqual({ process: '240−200÷', main: '40' })
  })
  test('연산자를 잇달아 누르면 마지막 것으로 바꾼다', () => {
    expect(runBasic('5 + - 3 =').ev).toEqual([{ expression: '5-3', result: '2', error: null }])
  })
  test('= 뒤 연산자는 결과에서 이어 계산, 숫자는 새 계산', () => {
    expect(runBasic('2 4 0 - 2 0 0 / 6 0 0 * 1 0 0 = * 2 =').ev[1]).toEqual({ expression: '6.666666667*2', result: '13.33333333', error: null })
    expect(runBasic('1 + 1 = 5').view).toEqual({ process: '5', main: '5' })
  })
  test('0으로 나누면 오류, AC만 받는다', () => {
    const { st, ev, view } = runBasic('5 / 0 =')
    expect(ev).toEqual([{ expression: '5/0', result: null, error: 'divideByZero' }])
    expect(view.main).toBe('오류')
    expect(basicPress(st, '7').state).toBe(st)
    expect(basicPress(st, 'AC').state).toEqual(basicInit())
  })
  test('⌫는 지금 수의 한 글자, 앞 0·소수점 두 번은 무시, 연산자·둘째 수 없이 = 는 남기지 않음', () => {
    expect(runBasic('1 2 BS').view.main).toBe('1')
    expect(runBasic('0 0 5').view.main).toBe('5')
    expect(runBasic('1 . . 5').view.main).toBe('1.5')
    expect(runBasic('. 5').view.main).toBe('0.5')
    expect(runBasic('7 =').ev).toEqual([])
    expect(runBasic('7 + =').ev).toEqual([])
  })
  test('한 수는 10자리까지, 누른 과정은 80자까지', () => {
    expect(runBasic('1 2 3 4 5 6 7 8 9 0 1').view.main).toBe('1234567890')
    let st = basicInit()
    for (let i = 0; i < 50; i++) for (const k of ['1', '2', '3', '+'] as BasicKey[]) st = basicPress(st, k).state
    expect((st.prefix + st.entry).length).toBeLessThanOrEqual(80)
  })
})

describe('공학용 계산기(최소회전반경): 식, 곱셈·나눗셈 먼저, 괄호·sin(도)', () => {
  test('2.7 ÷ sin(32) + 0.1 = 5.19511577, sin 30° = 0.5', () => {
    expect(runSci('2 . 7 / sin 3 2 ) + 0 . 1 =').ev).toEqual([{ expression: '2.7/sin(32)+0.1', result: '5.19511577', error: null }])
    expect(runSci('sin 3 0 ) =').ev[0]!.result).toBe('0.5')
  })
  test('곱셈·나눗셈 먼저와 괄호 — 같은 글자도 일반 계산기와 답이 다르다', () => {
    expect(runSci('2 4 0 - 2 0 0 / 6 0 0 * 1 0 0 =').ev[0]!.result).toBe('206.6666667')
    expect(runSci('( 2 4 0 - 2 0 0 ) / 6 0 0 * 1 0 0 =').ev[0]!.result).toBe('6.666666667')
  })
  test('닫는 괄호를 빠뜨리면 = 때 자동으로 닫는다', () => {
    expect(runSci('2 . 7 / sin 3 0 =').ev[0]).toEqual({ expression: '2.7/sin(30)', result: '5.4', error: null })
  })
  test('앞의 −, 곱셈 뒤 −', () => {
    expect(evaluateExpression('-2*3')).toEqual({ value: -6 })
    expect(evaluateExpression('2*-3')).toEqual({ value: -6 })
  })
  test('식 오류·수학 오류, 식은 남아 고칠 수 있다', () => {
    const { st, ev, view } = runSci('2 sin 3 0 =')
    expect(ev).toEqual([{ expression: '2sin(30)', result: null, error: 'syntax' }])
    expect(view).toEqual({ expression: '2sin(30', result: '식 오류' })
    expect(sciView(sciPress(st, 'BS').state).result).toBe('')
    expect(runSci('1 / ( 1 - 1 ) =').ev[0]).toEqual({ expression: '1/(1-1)', result: null, error: 'divideByZero' })
    expect(runSci('3 + =').ev[0]!.error).toBe('syntax')
    expect(evaluateExpression('()')).toEqual({ error: 'syntax' })
  })
  test('sin 은 한 조각이라 ⌫ 한 번에 지운다', () => {
    expect(runSci('2 / sin BS').view.expression).toBe('2÷')
  })
  test('= 뒤 연산자는 직전 결과에 이어 쓰고, 숫자는 새 식', () => {
    expect(runSci('1 + 1 = * 3 =').ev[1]).toEqual({ expression: '2*3', result: '6', error: null })
    expect(runSci('1 + 1 = 4').view).toEqual({ expression: '4', result: '' })
  })
  test('빈 식의 = 는 남기지 않고, 식은 60자까지', () => {
    expect(runSci('=').ev).toEqual([])
    let st = sciInit()
    for (let i = 0; i < 40; i++) for (const k of ['1', '+'] as SciKey[]) st = sciPress(st, k).state
    expect(st.pieces.join('').length).toBeLessThanOrEqual(60)
  })
})
