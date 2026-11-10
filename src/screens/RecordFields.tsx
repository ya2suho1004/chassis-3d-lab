// 기록 칸 한 줄(설계 2026-11-10 §9): 작업 목록(서랍·기본 화면)과 기록 창이 같은 칸 모양·제출 함수를 쓴다.
// 값·제출·표시·열림은 io로 받는다(TaskScreen 한 곳이 가진 상태). id 앞머리와 판정 라디오 이름을 나눠
// 서랍과 창이 함께 붙어 있어도 겹치지 않게 한다. 제출은 '입력' 버튼으로만 한다(form이 없어 Enter로 제출되지 않는다).
import { ITEM_LABEL } from '../app/resultLabels'

export interface FieldIo {
  value: (itemId: string) => string
  change: (itemId: string, v: string) => void
  submit: (itemId: string) => void
  mark: (itemId: string) => { text: string; cls: string }
  open: (itemId: string) => boolean
  idOf: (itemId: string) => string
}

export function NumberField({ itemId, io, decimal = false }: { itemId: string; io: FieldIo; decimal?: boolean }) {
  const label = ITEM_LABEL[itemId] ?? itemId
  const open = io.open(itemId)
  const m = io.mark(itemId)
  return (
    <div className="field">
      <label htmlFor={io.idOf(itemId)}>{label}</label>
      <input id={io.idOf(itemId)} inputMode={decimal ? 'decimal' : 'numeric'} value={io.value(itemId)} onChange={(e) => io.change(itemId, e.target.value)} disabled={!open} aria-label={label} />
      <button onClick={() => io.submit(itemId)} disabled={!open}>입력</button>
      <span className={`mark ${m.cls}`}>{m.text}</span>
    </div>
  )
}

export function VerdictField({ io, radioName }: { io: FieldIo; radioName: string }) {
  const id = 'vehicleCondition'
  const open = io.open(id)
  const m = io.mark(id)
  return (
    <div className="field">
      <span className="flabel">{ITEM_LABEL[id]}</span>
      <span>
        <label className="radio"><input id={io.idOf(id)} type="radio" name={radioName} disabled={!open} checked={io.value(id) === 'pass'} onChange={() => io.change(id, 'pass')} /> 양호</label>
        <label className="radio"><input type="radio" name={radioName} disabled={!open} checked={io.value(id) === 'fail'} onChange={() => io.change(id, 'fail')} /> 불량</label>
      </span>
      <button onClick={() => io.submit(id)} disabled={!open}>입력</button>
      <span className={`mark ${m.cls}`}>{m.text}</span>
    </div>
  )
}
