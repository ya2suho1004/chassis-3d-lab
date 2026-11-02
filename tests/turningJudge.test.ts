// 최소회전반경 판정: 바깥쪽 바퀴, 표 sin, 소수 첫째 자리 절사, 12 m 경계(포함), 판정 불가
import { describe, expect, it } from 'vitest'
import { calculateTurningVerdict, outerWheel } from '../src/domain/turningJudge'

const P = { mode: 'rounded', digits: 1, rounding: 'truncate' } as const
const SIN = { '30': 0.5, '31': 0.515, '32': 0.5299, '33': 0.5446, '34': 0.5592, '35': 0.5736 }
const base = { wheelbaseM: 2.7, kingpinOffsetM: 0.1, sinTable: SIN }
const RS = { radiusMaxM: 12, decisionPrecision: P }

describe('최소회전반경 판정', () => {
  it('좌회전은 우측, 우회전은 좌측 바퀴가 바깥쪽', () => {
    expect(outerWheel('left')).toBe('right')
    expect(outerWheel('right')).toBe('left')
  })
  it('사례 1: 좌회전 좌35·우30 → 2.7 ÷ 0.5 + 0.1 = 5.5 m 양호', () => {
    const r = calculateTurningVerdict({ ...base, turnDirection: 'left', leftAngleDeg: 35, rightAngleDeg: 30 }, RS)
    expect(r).toMatchObject({ status: 'evaluable', reasonCode: null, outerWheel: 'right', outerAngleDeg: 30, radiusM: 5.5, radiusMaxM: 12, verdict: 'pass' })
  })
  it('사례 2: 우회전 좌32·우36 → 5.195… → 5.1 m(절사) 양호', () => {
    const r = calculateTurningVerdict({ ...base, turnDirection: 'right', leftAngleDeg: 32, rightAngleDeg: 36 }, RS)
    expect(r.outerAngleDeg).toBe(32)
    expect(r.radiusM).toBe(5.1)
    expect(r.verdict).toBe('pass')
  })
  it('기재값 12.0 m는 양호(경계 포함), 넘으면 불량', () => {
    const ok = calculateTurningVerdict({ ...base, wheelbaseM: 5.95, turnDirection: 'left', leftAngleDeg: 35, rightAngleDeg: 30 }, RS)
    expect(ok.radiusM).toBe(12)
    expect(ok.verdict).toBe('pass')
    const bad = calculateTurningVerdict({ ...base, wheelbaseM: 6, turnDirection: 'left', leftAngleDeg: 35, rightAngleDeg: 30 }, RS)
    expect(bad.radiusM).toBe(12.1)
    expect(bad.verdict).toBe('fail')
  })
  it('표에 없는 각도·잘못된 값·기준 없음은 판정 불가', () => {
    expect(calculateTurningVerdict({ ...base, turnDirection: 'left', leftAngleDeg: 35, rightAngleDeg: 40 }, RS)).toMatchObject({ status: 'notEvaluable', reasonCode: 'ANGLE_NOT_IN_TABLE', verdict: null })
    expect(calculateTurningVerdict({ ...base, wheelbaseM: 0, turnDirection: 'left', leftAngleDeg: 35, rightAngleDeg: 30 }, RS).reasonCode).toBe('INVALID_INPUT')
    expect(calculateTurningVerdict({ ...base, turnDirection: 'left', leftAngleDeg: 35, rightAngleDeg: 30 }, { radiusMaxM: null, decisionPrecision: P }).reasonCode).toBe('RULESET_INCOMPLETE')
    expect(calculateTurningVerdict({ ...base, turnDirection: null, leftAngleDeg: 35, rightAngleDeg: 30 }, RS).reasonCode).toBe('INVALID_DIRECTION')
  })
})
