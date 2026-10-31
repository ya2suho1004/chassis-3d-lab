// 연습 규정값: 기본값(교사 확인 0F), 저장값 검사, 판정(경계 포함)
import { describe, expect, it } from 'vitest'
import { DEFAULT_PRACTICE_SPEC, parsePracticeSpec, verdictFor } from '../src/app/practiceSpec'

describe('연습 규정값', () => {
  it('기본값은 0F 실습장 기준: 둘 다 0.10 mm 이하 양호', () => {
    expect(DEFAULT_PRACTICE_SPEC).toEqual({ runoutMaxMm: 0.1, backlashMaxMm: 0.1 })
  })
  it('저장값이 없거나 틀리면 기본값, 맞으면 그 값', () => {
    expect(parsePracticeSpec(null)).toEqual(DEFAULT_PRACTICE_SPEC)
    expect(parsePracticeSpec('{')).toEqual(DEFAULT_PRACTICE_SPEC)
    expect(parsePracticeSpec('{"runoutMaxMm":0,"backlashMaxMm":0.1}')).toEqual(DEFAULT_PRACTICE_SPEC)
    expect(parsePracticeSpec('{"runoutMaxMm":0.05,"backlashMaxMm":"0.1"}')).toEqual(DEFAULT_PRACTICE_SPEC)
    expect(parsePracticeSpec('{"runoutMaxMm":0.05,"backlashMaxMm":0.16}')).toEqual({ runoutMaxMm: 0.05, backlashMaxMm: 0.16 })
  })
  it('측정값이 한계 이하면 양호(경계 포함), 넘으면 불량', () => {
    expect(verdictFor(0.1, 0.1)).toBe('good')
    expect(verdictFor(0.08, 0.1)).toBe('good')
    expect(verdictFor(0.11, 0.1)).toBe('bad')
    expect(verdictFor(0.07 + 0.03, 0.1)).toBe('good')   // 0.09999999999999999 같은 소수 오차는 경계로
  })
})
