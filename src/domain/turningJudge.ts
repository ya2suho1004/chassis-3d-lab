// 판정 엔진 — 최소회전반경 차량 판정(설계 docs/superpowers/specs/2026-11-02-min-turning-radius-task-design.md)
// R = L ÷ sin α + r. α는 회전 시 바깥쪽 앞바퀴의 최대 조향각(NCS LM1506030326 p.73·79), sin은 학생에게 제시한 표 값을 쓴다.
// 기재값(승인된 정밀도 정책, 교사 확인: 소수 첫째 자리·둘째에서 절사)으로 기준(12 m 이하, 경계 포함)과 비교한다.
// 기준·표·입력이 없거나 잘못되면 '불량'이 아니라 '판정 불가'다.
import { applyPrecision, type DecisionPrecision } from './judge'

export type TurnDirection = 'left' | 'right'
export type Wheel = 'left' | 'right'

export interface TurningInputs {
  turnDirection: TurnDirection | null
  leftAngleDeg: number | null
  rightAngleDeg: number | null
  wheelbaseM: number | null
  kingpinOffsetM: number | null
  /** 각도(정수 °) → sin 값. 학생에게 제시한 표와 같아야 한다 */
  sinTable: Record<string, number> | null
}

export interface TurningRuleset {
  radiusMaxM: number | null
  decisionPrecision: DecisionPrecision | null
}

export type TurningReason = 'RULESET_INCOMPLETE' | 'INVALID_INPUT' | 'INVALID_DIRECTION' | 'ANGLE_NOT_IN_TABLE'

export interface TurningVerdictResult {
  status: 'evaluable' | 'notEvaluable'
  reasonCode: TurningReason | null
  outerWheel: Wheel | null
  outerAngleDeg: number | null
  /** 기재값(절사 뒤) */
  radiusM: number | null
  radiusMaxM: number | null
  verdict: 'pass' | 'fail' | null
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** 좌회전이면 우측, 우회전이면 좌측 바퀴가 바깥쪽 */
export function outerWheel(dir: TurnDirection): Wheel {
  return dir === 'left' ? 'right' : 'left'
}

const notEvaluable = (reasonCode: TurningReason): TurningVerdictResult => ({ status: 'notEvaluable', reasonCode, outerWheel: null, outerAngleDeg: null, radiusM: null, radiusMaxM: null, verdict: null })

export function calculateTurningVerdict(inputs: TurningInputs, ruleset: TurningRuleset): TurningVerdictResult {
  if (inputs.turnDirection !== 'left' && inputs.turnDirection !== 'right') return notEvaluable('INVALID_DIRECTION')
  const { leftAngleDeg, rightAngleDeg, wheelbaseM, kingpinOffsetM, sinTable } = inputs
  if (!fin(leftAngleDeg) || !fin(rightAngleDeg) || !fin(wheelbaseM) || !fin(kingpinOffsetM) || wheelbaseM <= 0 || kingpinOffsetM < 0) return notEvaluable('INVALID_INPUT')
  const p = ruleset.decisionPrecision
  if (!fin(ruleset.radiusMaxM) || !p || (p.mode === 'rounded' && (p.digits === null || p.rounding === null))) return notEvaluable('RULESET_INCOMPLETE')
  const wheel = outerWheel(inputs.turnDirection)
  const angle = wheel === 'left' ? leftAngleDeg : rightAngleDeg
  const sin = sinTable?.[String(angle)]
  if (!fin(sin) || sin <= 0) return notEvaluable('ANGLE_NOT_IN_TABLE')
  const radiusM = applyPrecision(wheelbaseM / sin + kingpinOffsetM, p)
  return { status: 'evaluable', reasonCode: null, outerWheel: wheel, outerAngleDeg: angle, radiusM, radiusMaxM: ruleset.radiusMaxM, verdict: radiusM <= ruleset.radiusMaxM ? 'pass' : 'fail' }
}
