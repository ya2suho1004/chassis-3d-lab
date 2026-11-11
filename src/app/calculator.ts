// 계산·판정 장면 전자계산기의 계산 규칙(설계 docs/superpowers/specs/2026-11-11-calculator-design.md §2). 화면·저장소와 무관한 순수 함수.
// 제동력: 일반 계산기 — 누르는 차례대로 바로 계산(탁상 계산기). 최소회전반경: 공학용 — 식 입력, 곱셈·나눗셈 먼저, 괄호·sin(도 단위).
// 식은 + - * / 와 sin( ) 로 적어 기록하고, 화면에는 × ÷ − 로 보인다(displayExpr).
import type { CalculatorError } from '../domain/taskEngine'

/** = 를 누를 때 기록으로 넘기는 값(logCalculation의 입력). result와 error 중 하나만 null이 아니다 */
export interface CalcEvaluation { expression: string; result: string | null; error: CalculatorError | null }
export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
export type CalcOp = '+' | '-' | '*' | '/'
export type BasicKey = Digit | '.' | CalcOp | '=' | 'AC' | 'BS'
export type SciKey = BasicKey | '(' | ')' | 'sin'

/** 한 수의 자릿수 상한(소수점 제외) */
export const MAX_DIGITS = 10
/** 일반 계산기: 한 번의 계산에 누른 과정 상한 */
export const BASIC_MAX_CHARS = 80
/** 공학용: 식 상한(자동으로 닫는 괄호 전) */
export const SCI_MAX_CHARS = 60

const isDigit = (k: string): k is Digit => k.length === 1 && k >= '0' && k <= '9'
const isOp = (k: string): k is CalcOp => k === '+' || k === '-' || k === '*' || k === '/'

/** 10자리 유효숫자로 반올림해 보이고 끝의 0은 지운다. 소수 첫째 자리에서 자르지 않는다(자르기는 학생 몫). 수가 아니면 null */
export function formatCalc(x: number): string | null {
  if (!Number.isFinite(x)) return null
  if (x === 0) return '0'
  return String(Number(x.toPrecision(10)))
}

/** 화면 표시: * / - 를 × ÷ − 로 */
export function displayExpr(s: string): string {
  return s.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−')
}

// ---------- 일반 계산기(제동력): 누르는 차례대로 바로 계산 ----------

export interface BasicState {
  /** 이번 계산에서 확정한 앞부분(예: '240-200/') */
  prefix: string
  /** 지금 적는 수(없으면 '') */
  entry: string
  /** 앞부분을 왼쪽부터 계산한 값 */
  acc: number | null
  op: CalcOp | null
  /** 직전 = 의 값과 식(= 뒤 화면, 이어 계산) */
  last: { value: number; expression: string } | null
  done: boolean
  error: boolean
}

export const basicInit = (): BasicState => ({ prefix: '', entry: '', acc: null, op: null, last: null, done: false, error: false })

function apply(a: number, op: CalcOp, b: number): number | null {
  if (op === '/' && b === 0) return null
  const v = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b
  return Number.isFinite(v) ? v : null
}

export function basicPress(s: BasicState, k: BasicKey): { state: BasicState; evaluated: CalcEvaluation | null } {
  const same = { state: s, evaluated: null }
  if (k === 'AC') return { state: basicInit(), evaluated: null }
  if (s.error) return same
  if (isDigit(k) || k === '.') {
    const base: BasicState = s.done ? { ...basicInit(), last: s.last } : s
    if (k === '.' && base.entry.includes('.')) return same
    const entry = k === '.' ? (base.entry === '' ? '0.' : base.entry + '.') : base.entry === '0' ? k : base.entry + k
    if (entry.replace(/\D/g, '').length > MAX_DIGITS || (base.prefix + entry).length > BASIC_MAX_CHARS) return same
    return { state: { ...base, entry }, evaluated: null }
  }
  if (k === 'BS') return s.done || s.entry === '' ? same : { state: { ...s, entry: s.entry.slice(0, -1) }, evaluated: null }
  if (k === '=') {
    if (s.op === null || s.acc === null || s.entry === '') return same
    const expression = s.prefix + s.entry
    const v = apply(s.acc, s.op, Number(s.entry))
    if (v === null) return { state: { ...s, error: true }, evaluated: { expression, result: null, error: 'divideByZero' } }
    return { state: { ...basicInit(), last: { value: v, expression }, done: true }, evaluated: { expression, result: formatCalc(v), error: null } }
  }
  // 연산자
  if (s.done) {
    if (!s.last) return same
    return { state: { ...basicInit(), last: s.last, prefix: (formatCalc(s.last.value) ?? '0') + k, acc: s.last.value, op: k }, evaluated: null }
  }
  if (s.entry !== '') {
    const prefix = s.prefix + s.entry + k
    if (prefix.length > BASIC_MAX_CHARS) return same
    const value = Number(s.entry)
    const acc = s.acc === null || s.op === null ? value : apply(s.acc, s.op, value)
    if (acc === null) return { state: { ...s, prefix, entry: '', error: true }, evaluated: null }
    return { state: { ...s, prefix, entry: '', acc, op: k }, evaluated: null }
  }
  if (s.op !== null) return { state: { ...s, prefix: s.prefix.slice(0, -1) + k, op: k }, evaluated: null }
  return same
}

export function basicView(s: BasicState): { process: string; main: string } {
  if (s.error) return { process: displayExpr(s.prefix + s.entry), main: '오류' }
  if (s.done && s.last) return { process: `${displayExpr(s.last.expression)} =`, main: formatCalc(s.last.value) ?? '오류' }
  const main = s.entry !== '' ? s.entry : s.acc !== null ? formatCalc(s.acc) ?? '오류' : '0'
  return { process: displayExpr(s.prefix + s.entry), main }
}

// ---------- 공학용 계산기(최소회전반경): 식 입력, 곱셈·나눗셈 먼저, 괄호·sin(도) ----------

export interface SciState {
  /** 적은 조각(sin( 는 한 조각이라 ⌫ 한 번에 지운다). 이어 붙이면 식 */
  pieces: string[]
  last: { value: number; expression: string } | null
  done: boolean
  error: CalculatorError | null
}

export const sciInit = (): SciState => ({ pieces: [], last: null, done: false, error: null })

export function sciPress(s: SciState, k: SciKey): { state: SciState; evaluated: CalcEvaluation | null } {
  if (k === 'AC') return { state: sciInit(), evaluated: null }
  if (k === 'BS') return { state: s.done ? s : { ...s, pieces: s.pieces.slice(0, -1), error: null }, evaluated: null }
  if (k === '=') {
    if (s.done || s.pieces.length === 0) return { state: s, evaluated: null }
    const open = s.pieces.filter((p) => p.endsWith('(')).length - s.pieces.filter((p) => p === ')').length
    const expression = s.pieces.join('') + ')'.repeat(Math.max(0, open))
    const r = evaluateExpression(expression)
    if ('error' in r) return { state: { ...s, error: r.error }, evaluated: { expression, result: null, error: r.error } }
    return { state: { pieces: [], last: { value: r.value, expression }, done: true, error: null }, evaluated: { expression, result: formatCalc(r.value), error: null } }
  }
  const start = s.done ? (isOp(k) && s.last ? [formatCalc(s.last.value) ?? '0'] : []) : s.pieces
  const pieces = [...start, k === 'sin' ? 'sin(' : k]
  if (pieces.join('').length > SCI_MAX_CHARS) return { state: s, evaluated: null }
  return { state: { pieces, last: s.last, done: false, error: null }, evaluated: null }
}

export function sciView(s: SciState): { expression: string; result: string } {
  if (s.done && s.last) return { expression: `${displayExpr(s.last.expression)} =`, result: formatCalc(s.last.value) ?? '수학 오류' }
  return { expression: displayExpr(s.pieces.join('')), result: s.error === 'syntax' ? '식 오류' : s.error === 'divideByZero' ? '수학 오류' : '' }
}

type Tok = { t: 'num'; v: number } | { t: 'op'; v: CalcOp } | { t: '(' } | { t: ')' } | { t: 'sin' }

function tokenize(expr: string): Tok[] | null {
  const out: Tok[] = []
  let i = 0
  while (i < expr.length) {
    if (expr.startsWith('sin(', i)) { out.push({ t: 'sin' }); i += 4; continue }
    const c = expr[i]!
    if (c === '(' || c === ')') { out.push({ t: c }); i++; continue }
    if (isOp(c)) { out.push({ t: 'op', v: c }); i++; continue }
    const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(expr.slice(i))
    if (!m) return null
    out.push({ t: 'num', v: Number(m[0]) })
    i += m[0].length
  }
  return out
}

class CalcFail {
  error: CalculatorError
  constructor(error: CalculatorError) { this.error = error }
}

/** 공학용 식 계산: 곱셈·나눗셈 먼저, 괄호, 앞의 ±, sin(도). 곱셈 생략(2sin(30))은 식 오류. 0으로 나누거나 값이 수가 아니면 divideByZero */
export function evaluateExpression(expr: string): { value: number } | { error: CalculatorError } {
  const toks = tokenize(expr)
  if (!toks || toks.length === 0) return { error: 'syntax' }
  let i = 0
  const fail = (e: CalculatorError): never => { throw new CalcFail(e) }
  const primary = (): number => {
    const t = toks[i++]
    if (!t) return fail('syntax')
    if (t.t === 'num') return t.v
    if (t.t === '(' || t.t === 'sin') {
      const v = sum()
      if (toks[i]?.t !== ')') return fail('syntax')
      i++
      return t.t === 'sin' ? Math.sin((v * Math.PI) / 180) : v
    }
    return fail('syntax')
  }
  const unary = (): number => {
    const t = toks[i]
    if (t && t.t === 'op' && (t.v === '-' || t.v === '+')) { i++; const v = unary(); return t.v === '-' ? -v : v }
    return primary()
  }
  const product = (): number => {
    let v = unary()
    for (;;) {
      const t = toks[i]
      if (!t || t.t !== 'op' || (t.v !== '*' && t.v !== '/')) return v
      i++
      const r = unary()
      if (t.v === '/' && r === 0) return fail('divideByZero')
      v = t.v === '*' ? v * r : v / r
    }
  }
  const sum = (): number => {
    let v = product()
    for (;;) {
      const t = toks[i]
      if (!t || t.t !== 'op' || (t.v !== '+' && t.v !== '-')) return v
      i++
      const r = product()
      v = t.v === '+' ? v + r : v - r
    }
  }
  try {
    const v = sum()
    if (i !== toks.length) return { error: 'syntax' }
    return Number.isFinite(v) ? { value: v } : { error: 'divideByZero' }
  } catch (e) {
    if (e instanceof CalcFail) return { error: e.error }
    throw e
  }
}
