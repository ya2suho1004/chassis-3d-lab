// 응답 채점 — 판독(measurement)·계산(calculation)·판정(judgment)의 최초/최종 답 보존
// 원칙(docs/design/docs/04 §5~6): 제출된 응답만 기록한다. 미입력은 null이며 0이나 오답으로 바꾸지 않는다.
// 최초 답은 이후 정정으로 덮어쓰지 않는다. judgmentCorrect는 판정 항목의 최초 답이 모두 정답일 때만 true.
import { calculateVehicleVerdict, type DecisionPrecision, type VehicleVerdictResult } from './judge'
import { calculateTurningVerdict, type TurningVerdictResult } from './turningJudge'
import type { ApprovedTask, RequiredResponseItem, ResponseKind } from './types'

export const TURNING_TASK_ID = 'min-turning-radius'

export type Verdict = 'pass' | 'fail'

export interface ResponseItemState {
  itemId: string
  kind: ResponseKind
  unit: string | null
  gradingRuleId: string | null
  precisionPolicyRef: string | null
  /** 판독 항목의 제시값 / 계산 항목의 기준값(승인 정밀도 적용) / 판정 항목은 null */
  referenceValue: number | null
  firstInput: string | null
  firstCorrect: boolean | null
  finalInput: string | null
  finalCorrect: boolean | null
  firstAnswer: Verdict | null
  finalAnswer: Verdict | null
}

export interface ResponseSheet {
  taskId: string
  /** 승인 정밀도 정책(기록·안내용). 채점은 학생 값을 다시 절사하지 않는다(마무리 §2) — 절사는 기준값 계산에만 쓴다 */
  precision: DecisionPrecision | null
  /** 과제별 차량 판정 계산 결과(제동력: 편차·합, 최소회전반경: 바깥쪽 바퀴·R) */
  vehicle: VehicleVerdictResult | TurningVerdictResult
  vehicleVerdict: Verdict | null
  items: ResponseItemState[]
}

export type SubmitReason = 'EMPTY_INPUT' | 'FORMAT_INTEGER_REQUIRED' | 'FORMAT_NUMBER_REQUIRED' | 'FORMAT_VERDICT_REQUIRED' | 'UNKNOWN_ITEM' | 'NOT_EVALUABLE'

export interface SubmitResult {
  itemId: string
  isFirst: boolean
  /** true/false = 채점됨, null = 미응답 또는 형식 오류(채점 안 함) */
  correct: boolean | null
  reasonCode: SubmitReason | null
}

function referenceFor(item: RequiredResponseItem, task: ApprovedTask, vehicle: VehicleVerdictResult | TurningVerdictResult): number | null {
  const m = task.measurement
  if ('radiusM' in vehicle) {
    if (item.itemId === 'leftAngle') return m.leftAngleDeg ?? null
    if (item.itemId === 'rightAngle') return m.rightAngleDeg ?? null
    if (item.itemId === 'radius') return vehicle.radiusM
    return null
  }
  if (item.kind === 'measurement') {
    if (item.itemId === 'left') return m.left
    if (item.itemId === 'right') return m.right
    if (item.itemId === 'axleWeight') return m.axleWeight
    return null
  }
  if (item.kind === 'calculation') {
    if (item.itemId === 'deviation') return vehicle.deviationPercent
    if (item.itemId === 'sum') return vehicle.sumPercent
    return null
  }
  return null
}

export function createResponseSheet(task: ApprovedTask): ResponseSheet {
  const m = task.measurement
  const vehicle = task.taskId === TURNING_TASK_ID
    ? calculateTurningVerdict(
      { turnDirection: m.turnDirection ?? null, leftAngleDeg: m.leftAngleDeg ?? null, rightAngleDeg: m.rightAngleDeg ?? null, wheelbaseM: m.wheelbaseM ?? null, kingpinOffsetM: m.kingpinOffsetM ?? null, sinTable: m.sinTable ?? null },
      { radiusMaxM: task.ruleset.radiusMaxM ?? null, decisionPrecision: task.ruleset.decisionPrecision },
    )
    : calculateVehicleVerdict(
      { left: m.left, right: m.right, axleWeight: m.axleWeight, axlePosition: m.axlePosition as 'front' | 'rear' },
      task.ruleset,
    )
  return {
    taskId: task.taskId,
    precision: task.ruleset.decisionPrecision,
    vehicle,
    vehicleVerdict: vehicle.verdict,
    items: task.requiredResponseItems.map((it) => ({
      itemId: it.itemId,
      kind: it.kind,
      unit: it.unit,
      gradingRuleId: it.gradingRuleId,
      precisionPolicyRef: it.precisionPolicyRef,
      referenceValue: referenceFor(it, task, vehicle),
      firstInput: null,
      firstCorrect: null,
      finalInput: null,
      finalCorrect: null,
      firstAnswer: null,
      finalAnswer: null,
    })),
  }
}

const INTEGER_RE = /^-?\d+$/
const NUMBER_RE = /^-?\d+(\.\d+)?$/

/** 입력 문자열을 정책에 맞게 해석. 실패하면 reasonCode. */
function parseNumeric(raw: string, policy: string | null): { value: number } | { reasonCode: SubmitReason } {
  if (policy === 'integer') {
    if (!INTEGER_RE.test(raw)) return { reasonCode: 'FORMAT_INTEGER_REQUIRED' }
    return { value: Number(raw) }
  }
  if (!NUMBER_RE.test(raw)) return { reasonCode: 'FORMAT_NUMBER_REQUIRED' }
  return { value: Number(raw) }
}

function gradeNumeric(item: ResponseItemState, value: number): boolean | null {
  if (item.referenceValue === null) return null
  // 계산 항목도 학생 값을 다시 절사하지 않고 그대로 비교한다(설계 계약 task-vocabulary 1.2.0 296–302, 13번 문서 104줄, MOON 결정 가 2026-11-10).
  // 기준값은 이미 기재 정책(절사 1자리)으로 정리돼 있어 6.6·6.60은 정답, 6.69·6.6999는 오답이다
  if (item.gradingRuleId === 'decimalExact') return value === item.referenceValue
  return null
}

export function submitAnswer(sheet: ResponseSheet, itemId: string, rawInput: string): { sheet: ResponseSheet; result: SubmitResult } {
  const idx = sheet.items.findIndex((i) => i.itemId === itemId)
  if (idx < 0) return { sheet, result: { itemId, isFirst: false, correct: null, reasonCode: 'UNKNOWN_ITEM' } }
  const item = sheet.items[idx]!
  const isFirst = item.firstInput === null && item.firstAnswer === null
  const trimmed = rawInput.trim()
  if (trimmed === '') return { sheet, result: { itemId, isFirst, correct: null, reasonCode: 'EMPTY_INPUT' } }

  let correct: boolean | null = null
  let next: ResponseItemState

  if (item.kind === 'judgment') {
    if (trimmed !== 'pass' && trimmed !== 'fail') return { sheet, result: { itemId, isFirst, correct: null, reasonCode: 'FORMAT_VERDICT_REQUIRED' } }
    if (sheet.vehicleVerdict === null) return { sheet, result: { itemId, isFirst, correct: null, reasonCode: 'NOT_EVALUABLE' } }
    correct = trimmed === sheet.vehicleVerdict
    next = isFirst
      ? { ...item, firstAnswer: trimmed, firstCorrect: correct, finalAnswer: trimmed, finalCorrect: correct }
      : { ...item, finalAnswer: trimmed, finalCorrect: correct }
  } else {
    const parsed = parseNumeric(trimmed, item.precisionPolicyRef)
    if ('reasonCode' in parsed) return { sheet, result: { itemId, isFirst, correct: null, reasonCode: parsed.reasonCode } }
    // 기준값이 없으면(판정 불가 설정) 채점하지 않는다
    correct = gradeNumeric(item, parsed.value)
    if (correct === null) return { sheet, result: { itemId, isFirst, correct: null, reasonCode: 'NOT_EVALUABLE' } }
    next = isFirst
      ? { ...item, firstInput: trimmed, firstCorrect: correct, finalInput: trimmed, finalCorrect: correct }
      : { ...item, finalInput: trimmed, finalCorrect: correct }
  }

  const items = sheet.items.slice()
  items[idx] = next
  return { sheet: { ...sheet, items }, result: { itemId, isFirst, correct, reasonCode: null } }
}

export interface ResponseSummary {
  measurementInputs: Array<{ itemId: string; unit: string | null; presentedValue: number | null; firstInput: string | null; firstCorrect: boolean | null; finalInput: string | null; finalCorrect: boolean | null }>
  calculationAnswers: Array<{ itemId: string; unit: '%' | 'm'; computedReferenceValue: number | null; firstInput: string | null; firstCorrect: boolean | null; finalInput: string | null; finalCorrect: boolean | null }>
  judgmentAnswers: Array<{ itemId: string; firstAnswer: Verdict | null; firstCorrect: boolean | null; finalAnswer: Verdict | null; finalCorrect: boolean | null }>
  vehicleVerdict: Verdict | null
  judgmentCorrect: boolean | null
  finalJudgmentCorrect: boolean | null
  requiredCount: number
  firstCorrectCount: number
  finalCorrectCount: number
  unansweredFirstCount: number
}

function allOrNull(flags: Array<boolean | null>): boolean | null {
  if (flags.length === 0) return null
  if (flags.some((f) => f === null)) return null
  return flags.every((f) => f === true)
}

export function summarizeResponses(sheet: ResponseSheet): ResponseSummary {
  const by = (k: ResponseKind) => sheet.items.filter((i) => i.kind === k)
  const judgments = by('judgment')
  return {
    measurementInputs: by('measurement').map((i) => ({ itemId: i.itemId, unit: i.unit, presentedValue: i.referenceValue, firstInput: i.firstInput, firstCorrect: i.firstCorrect, finalInput: i.finalInput, finalCorrect: i.finalCorrect })),
    calculationAnswers: by('calculation').map((i) => ({ itemId: i.itemId, unit: (i.unit === 'm' ? 'm' : '%') as '%' | 'm', computedReferenceValue: i.referenceValue, firstInput: i.firstInput, firstCorrect: i.firstCorrect, finalInput: i.finalInput, finalCorrect: i.finalCorrect })),
    judgmentAnswers: judgments.map((i) => ({ itemId: i.itemId, firstAnswer: i.firstAnswer, firstCorrect: i.firstCorrect, finalAnswer: i.finalAnswer, finalCorrect: i.finalCorrect })),
    vehicleVerdict: sheet.vehicleVerdict,
    judgmentCorrect: allOrNull(judgments.map((i) => i.firstCorrect)),
    finalJudgmentCorrect: allOrNull(judgments.map((i) => i.finalCorrect)),
    requiredCount: sheet.items.length,
    firstCorrectCount: sheet.items.filter((i) => i.firstCorrect === true).length,
    finalCorrectCount: sheet.items.filter((i) => i.finalCorrect === true).length,
    unansweredFirstCount: sheet.items.filter((i) => i.firstCorrect === null).length,
  }
}
