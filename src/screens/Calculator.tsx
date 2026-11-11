// 계산·판정 장면 전자계산기(설계 docs/superpowers/specs/2026-11-11-calculator-design.md §2).
// 계산 규칙은 app/calculator.ts(순수 함수). = 를 누르면 onEvaluate로 넘긴다(TaskScreen → logCalculation)
import { useId, useState, type KeyboardEvent } from 'react'
import { basicInit, basicPress, basicView, sciInit, sciPress, sciView, type BasicKey, type CalcEvaluation, type SciKey } from '../app/calculator'
import type { CalculatorKind } from '../domain/taskEngine'

const LABEL: Partial<Record<SciKey, string>> = { '/': '÷', '*': '×', '-': '−', BS: '⌫' }
const NAME: Partial<Record<SciKey, string>> = { '/': '나누기', '*': '곱하기', '-': '빼기', '+': '더하기', BS: '한 글자 지움', AC: '모두 지움', '=': '계산', sin: '사인', '(': '여는 괄호', ')': '닫는 괄호', '.': '소수점' }
/** 버튼 배치: null은 빈자리, [키, 칸 수]는 넓은 버튼 */
type Cell = SciKey | null | [SciKey, number]
const BASIC_ROWS: Cell[][] = [['AC', 'BS', null, '/'], ['7', '8', '9', '*'], ['4', '5', '6', '-'], ['1', '2', '3', '+'], [['0', 2], '.', '=']]
const SCI_ROWS: Cell[][] = [['sin', '(', ')', 'BS', 'AC'], ['7', '8', '9', '/', '*'], ['4', '5', '6', '-', '+'], ['1', '2', '3', '0', '.'], [['=', 5]]]
/** 키보드(계산기 안에 초점이 있을 때). Esc는 다루지 않아 창 닫기로 간다 */
const KEYBOARD: Record<string, SciKey> = { Enter: '=', '=': '=', Backspace: 'BS', '+': '+', '-': '-', '*': '*', '/': '/', '.': '.', '(': '(', ')': ')' }

/** 펼친 계산기 */
export function CalculatorPad({ kind, onEvaluate }: { kind: CalculatorKind; onEvaluate: (e: CalcEvaluation) => void }) {
  const [basic, setBasic] = useState(basicInit)
  const [sci, setSci] = useState(sciInit)
  const press = (k: SciKey) => {
    if (kind === 'basic') {
      if (k === '(' || k === ')' || k === 'sin') return
      const r = basicPress(basic, k as BasicKey)
      setBasic(r.state)
      if (r.evaluated) onEvaluate(r.evaluated)
    } else {
      const r = sciPress(sci, k)
      setSci(r.state)
      if (r.evaluated) onEvaluate(r.evaluated)
    }
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = /^[0-9]$/.test(e.key) ? (e.key as SciKey) : KEYBOARD[e.key]
    if (!k) return
    e.preventDefault() // Enter가 초점 버튼을 한 번 더 누르지 않게
    press(k)
  }
  const top = kind === 'basic' ? basicView(basic).process : sciView(sci).expression
  const main = kind === 'basic' ? basicView(basic).main : sciView(sci).result
  const rows = kind === 'basic' ? BASIC_ROWS : SCI_ROWS
  return (
    <div className={`calc ${kind}`} onKeyDown={onKeyDown}>
      <div className="calc-disp">
        <div className="calc-proc">{kind === 'scientific' && <span className="calc-deg">DEG</span>}{top}</div>
        <output className="calc-main" aria-live="polite">{main}</output>
      </div>
      <div className="calc-keys">
        {rows.flatMap((row, r) => row.map((cell, c) => {
          if (cell === null) return <span key={`gap-${r}-${c}`} aria-hidden="true" />
          const [k, span] = Array.isArray(cell) ? cell : [cell, 1]
          return <button type="button" key={k} className={span > 1 ? `span${span}` : undefined} aria-label={NAME[k]} onClick={() => press(k)}>{LABEL[k] ?? k}</button>
        }))}
      </div>
    </div>
  )
}

/** '계산기' 버튼으로 펼치고 닫는다(처음엔 닫힘). 닫으면 내용이 지워진다(계산 기록은 남는다) */
export function CalculatorPanel({ kind, onEvaluate }: { kind: CalculatorKind; onEvaluate: (e: CalcEvaluation) => void }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="calc-panel">
      <button type="button" className="calc-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? '계산기 닫기' : '계산기'}</button>
      {open && <div id={id}><CalculatorPad kind={kind} onEvaluate={onEvaluate} /></div>}
    </div>
  )
}
