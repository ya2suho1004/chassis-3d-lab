import { describe, expect, test } from 'vitest'
import { calculateVehicleVerdict, type BrakeRuleset } from '../src/domain/judge'

// 교사 승인 규칙(0A, 2026-10-21): 편차 ≤ 8, 뒤축 합 ≥ 20, 앞축 합 ≥ 50, 경계 포함, 기재값 소수 첫째 자리 절사, 판정은 절사값
const approved: BrakeRuleset = {
  deviationMaxPercent: 8,
  sumMinRearPercent: 20,
  sumMinFrontPercent: 50,
  decisionPrecision: { mode: 'rounded', digits: 1, rounding: 'truncate' },
}

describe('calculateVehicleVerdict — 승인 사례', () => {
  test('Lv1 후륜 240/200/600 → 편차 6.6, 합 73.3, 양호', () => {
    const r = calculateVehicleVerdict({ left: 240, right: 200, axleWeight: 600, axlePosition: 'rear' }, approved)
    expect(r.status).toBe('evaluable')
    expect(r.deviationPercent).toBe(6.6)
    expect(r.sumPercent).toBe(73.3)
    expect(r.verdict).toBe('pass')
  })

  test('Lv2 후륜 250/190/600 → 편차 10.0으로 불량, 합은 통과', () => {
    const r = calculateVehicleVerdict({ left: 250, right: 190, axleWeight: 600, axlePosition: 'rear' }, approved)
    expect(r.verdict).toBe('fail')
    expect(r.deviationOk).toBe(false)
    expect(r.sumOk).toBe(true)
  })

  test('앞축은 합 50% 기준을 쓴다', () => {
    const r = calculateVehicleVerdict({ left: 160, right: 150, axleWeight: 700, axlePosition: 'front' }, approved)
    expect(r.sumMinPercent).toBe(50)
    expect(r.sumOk).toBe(false)
    expect(r.verdict).toBe('fail')
  })

  test('경계값(정확히 8%)은 양호로 본다(경계 포함)', () => {
    const r = calculateVehicleVerdict({ left: 108, right: 100, axleWeight: 100, axlePosition: 'rear' }, approved)
    expect(r.deviationPercent).toBe(8)
    expect(r.verdict).toBe('pass')
  })
})

describe('calculateVehicleVerdict — 정밀도 정책', () => {
  test('원값 8.004는 절사 정책에서 8.0이 되어 양호', () => {
    const r = calculateVehicleVerdict({ left: 180.04, right: 100, axleWeight: 1000, axlePosition: 'rear' }, approved)
    expect(r.deviationPercent).toBe(8)
    expect(r.verdict).toBe('pass')
  })

  test('같은 입력이라도 원값 비교(unrounded) 정책이면 불량', () => {
    const unrounded: BrakeRuleset = { ...approved, decisionPrecision: { mode: 'unrounded', digits: null, rounding: null } }
    const r = calculateVehicleVerdict({ left: 180.04, right: 100, axleWeight: 1000, axlePosition: 'rear' }, unrounded)
    expect(r.deviationPercent).toBeCloseTo(8.004, 3)
    expect(r.verdict).toBe('fail')
  })
})

describe('calculateVehicleVerdict — 설정·입력 오류는 차량 판정이 아니다', () => {
  test('기준값이 비어 있으면 8/20/50을 몰래 넣지 않고 판정 불가', () => {
    const incomplete: BrakeRuleset = { ...approved, deviationMaxPercent: null }
    const r = calculateVehicleVerdict({ left: 240, right: 200, axleWeight: 600, axlePosition: 'rear' }, incomplete)
    expect(r.status).toBe('notEvaluable')
    expect(r.reasonCode).toBe('RULESET_INCOMPLETE')
    expect(r.verdict).toBeNull()
  })

  test('정밀도 정책이 없으면 판정 불가', () => {
    const noPrecision: BrakeRuleset = { ...approved, decisionPrecision: null }
    const r = calculateVehicleVerdict({ left: 240, right: 200, axleWeight: 600, axlePosition: 'rear' }, noPrecision)
    expect(r.status).toBe('notEvaluable')
    expect(r.reasonCode).toBe('RULESET_INCOMPLETE')
  })

  test('음수 제동력은 입력 오류', () => {
    const r = calculateVehicleVerdict({ left: -180, right: 170, axleWeight: 500, axlePosition: 'rear' }, approved)
    expect(r.status).toBe('notEvaluable')
    expect(r.reasonCode).toBe('INVALID_INPUT')
  })

  test('축중 0 또는 음수는 입력 오류', () => {
    expect(calculateVehicleVerdict({ left: 1, right: 1, axleWeight: 0, axlePosition: 'rear' }, approved).reasonCode).toBe('INVALID_INPUT')
    expect(calculateVehicleVerdict({ left: 1, right: 1, axleWeight: -500, axlePosition: 'rear' }, approved).reasonCode).toBe('INVALID_INPUT')
  })

  test('Infinity·NaN·null은 입력 오류', () => {
    expect(calculateVehicleVerdict({ left: Infinity, right: 1, axleWeight: 600, axlePosition: 'rear' }, approved).reasonCode).toBe('INVALID_INPUT')
    expect(calculateVehicleVerdict({ left: NaN, right: 1, axleWeight: 600, axlePosition: 'rear' }, approved).reasonCode).toBe('INVALID_INPUT')
    expect(calculateVehicleVerdict({ left: null, right: 1, axleWeight: 600, axlePosition: 'rear' }, approved).reasonCode).toBe('INVALID_INPUT')
  })

  test('앞/뒤가 아닌 축 위치는 뒤축으로 간주하지 않고 판정 불가', () => {
    const r = calculateVehicleVerdict({ left: 240, right: 200, axleWeight: 600, axlePosition: 'unknown' as never }, approved)
    expect(r.status).toBe('notEvaluable')
    expect(r.reasonCode).toBe('INVALID_AXLE_POSITION')
  })
})
