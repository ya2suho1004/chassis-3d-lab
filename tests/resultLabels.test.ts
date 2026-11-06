// 결과 화면 표시 이름(Codex 교차 검토 2026-11-06 A2) — 기록 키는 그대로, 화면에만 한글
import { describe, expect, it } from 'vitest'
import { countsText, itemLabel, timeQualityLabel, verdictLabel } from '../src/app/resultLabels'

describe('결과 화면 표시 이름', () => {
  it('항목 키를 한글 이름으로 보인다', () => {
    expect(itemLabel('leftAngle')).toBe('좌측 바퀴 조향각')
    expect(itemLabel('radius')).toBe('최소회전반경(m)')
    expect(itemLabel('vehicleCondition')).toBe('판정')
    expect(itemLabel('deviation')).toBe('편차(%)')
  })
  it('모르는 키는 그대로 보인다(숨기지 않음)', () => {
    expect(itemLabel('newItem')).toBe('newItem')
  })
  it('판정·시간 품질', () => {
    expect(verdictLabel('pass')).toBe('양호')
    expect(verdictLabel('fail')).toBe('불량')
    expect(verdictLabel(null)).toBe('판정 불가')
    expect(timeQualityLabel('continuous')).toBe('끊김 없음')
    expect(timeQualityLabel('resumed')).toBe('중간에 이어서 함')
  })
  it('오류·안전 위반 유형 집계를 한글로', () => {
    expect(countsText({ order: 2, calc: 1 })).toBe('작업 순서 2, 계산 1')
    expect(countsText({ 's-ppe': 1, 's-engine': 1 })).toBe('보호구 1, 시동 OFF 확인 1')
    expect(countsText({})).toBe('없음')
  })
})
