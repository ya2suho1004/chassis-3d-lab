// 판정 엔진 — 제동력 차량 판정(vehicleVerdict)
// 원칙(docs/design/CLAUDE.md §5): 기준값이 없으면 기본값(8/20/50)을 넣지 않는다. 음수·0 축중·비유한수·미지정 축은
// '차량 불량'이 아니라 '판정 불가'다. 판정 비교값은 승인된 정밀도 정책(절사/원값)을 따른다.

export type AxlePosition = 'front' | 'rear'

export interface DecisionPrecision {
  mode: 'unrounded' | 'rounded'
  digits: number | null
  rounding: 'halfUp' | 'halfEven' | 'truncate' | null
}

export interface BrakeRuleset {
  deviationMaxPercent: number | null
  sumMinRearPercent: number | null
  sumMinFrontPercent: number | null
  decisionPrecision: DecisionPrecision | null
  /** 판정 비교값 출처. 기본 written(기재값). raw면 원값으로 비교하고 기재값은 따로 보고 */
  judgmentValueSource?: 'written' | 'raw'
}

export interface BrakeInputs {
  left: number | null
  right: number | null
  axleWeight: number | null
  axlePosition: AxlePosition
}

export type VerdictReason = 'RULESET_INCOMPLETE' | 'INVALID_INPUT' | 'INVALID_AXLE_POSITION'

export interface VehicleVerdictResult {
  status: 'evaluable' | 'notEvaluable'
  reasonCode: VerdictReason | null
  deviationPercent: number | null
  sumPercent: number | null
  deviationMaxPercent: number | null
  sumMinPercent: number | null
  deviationOk: boolean | null
  sumOk: boolean | null
  verdict: 'pass' | 'fail' | null
}

const notEvaluable = (reasonCode: VerdictReason): VehicleVerdictResult => ({
  status: 'notEvaluable',
  reasonCode,
  deviationPercent: null,
  sumPercent: null,
  deviationMaxPercent: null,
  sumMinPercent: null,
  deviationOk: null,
  sumOk: null,
  verdict: null,
})

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function precisionIsComplete(p: DecisionPrecision | null): p is DecisionPrecision {
  if (!p) return false
  if (p.mode === 'unrounded') return true
  return Number.isInteger(p.digits) && (p.digits as number) >= 0 && p.rounding !== null
}

/** 승인된 정밀도 정책으로 비교값·기재값을 만든다. */
export function applyPrecision(value: number, p: DecisionPrecision): number {
  if (p.mode === 'unrounded') return value
  const f = 10 ** (p.digits as number)
  const scaled = value * f
  // 부동소수 오차(예: 6.66…×10 = 66.6…)를 줄이기 위해 소수 9자리에서 먼저 정리
  const fixed = Number(scaled.toFixed(9))
  let r: number
  switch (p.rounding) {
    case 'truncate':
      r = Math.trunc(fixed)
      break
    case 'halfUp':
      r = Math.round(fixed)
      break
    case 'halfEven': {
      const fl = Math.floor(fixed)
      const diff = fixed - fl
      r = diff > 0.5 ? fl + 1 : diff < 0.5 ? fl : fl % 2 === 0 ? fl : fl + 1
      break
    }
    default:
      r = fixed
  }
  return r / f
}

export function calculateVehicleVerdict(inputs: BrakeInputs, ruleset: BrakeRuleset): VehicleVerdictResult {
  if (inputs.axlePosition !== 'front' && inputs.axlePosition !== 'rear') return notEvaluable('INVALID_AXLE_POSITION')

  const { left, right, axleWeight } = inputs
  if (!isFiniteNumber(left) || !isFiniteNumber(right) || !isFiniteNumber(axleWeight)) return notEvaluable('INVALID_INPUT')
  if (left < 0 || right < 0 || axleWeight <= 0) return notEvaluable('INVALID_INPUT')

  const sumMin = inputs.axlePosition === 'front' ? ruleset.sumMinFrontPercent : ruleset.sumMinRearPercent
  if (!isFiniteNumber(ruleset.deviationMaxPercent) || !isFiniteNumber(sumMin)) return notEvaluable('RULESET_INCOMPLETE')
  if (!precisionIsComplete(ruleset.decisionPrecision)) return notEvaluable('RULESET_INCOMPLETE')

  const deviationRaw = ((Math.max(left, right) - Math.min(left, right)) / axleWeight) * 100
  const sumRaw = ((left + right) / axleWeight) * 100
  const deviation = applyPrecision(deviationRaw, ruleset.decisionPrecision)
  const sum = applyPrecision(sumRaw, ruleset.decisionPrecision)

  const useRaw = ruleset.judgmentValueSource === 'raw'
  const deviationOk = (useRaw ? deviationRaw : deviation) <= ruleset.deviationMaxPercent // 경계 포함(교사 확정)
  const sumOk = (useRaw ? sumRaw : sum) >= sumMin

  return {
    status: 'evaluable',
    reasonCode: null,
    deviationPercent: deviation,
    sumPercent: sum,
    deviationMaxPercent: ruleset.deviationMaxPercent,
    sumMinPercent: sumMin,
    deviationOk,
    sumOk,
    verdict: deviationOk && sumOk ? 'pass' : 'fail',
  }
}
