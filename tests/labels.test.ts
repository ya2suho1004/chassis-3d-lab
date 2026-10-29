// 게임 화면 이름표 규칙('near'): 가까운 것만 이름표, 먼 작동 장비는 ◆, 나머지 숨김
import { describe, expect, it } from 'vitest'
import { NEAR_LABEL_RADIUS, distanceToFootprint, labelState } from '../src/scene/layoutModel'

const base = { selected: false, highlight: false, interactive: false, aimed: false }

describe('이름표 near 모드', () => {
  it('가까우면 이름표, 멀면 숨김(일반 장비)', () => {
    expect(labelState('near', { ...base, distance: NEAR_LABEL_RADIUS - 0.1 })).toBe('label')
    expect(labelState('near', { ...base, distance: NEAR_LABEL_RADIUS + 0.1 })).toBeNull()
  })
  it('멀리 있는 작동 장비는 ◆ 표시', () => {
    expect(labelState('near', { ...base, interactive: true, distance: 10 })).toBe('marker')
  })
  it('고른·강조·조준한 장비는 거리와 상관없이 이름표', () => {
    for (const k of ['selected', 'highlight', 'aimed'] as const) expect(labelState('near', { ...base, [k]: true, distance: 20 })).toBe('label')
  })
  it('◆ 표시는 다음 단계 여부와 무관(작동 장비면 모두 같음 — 안내 없음 조건)', () => {
    const a = labelState('near', { ...base, interactive: true, distance: 10 })
    const b = labelState('near', { ...base, interactive: true, distance: 12 })
    expect(a).toBe(b)
  })
  it('all·focus는 기존 규칙', () => {
    expect(labelState('all', { ...base, distance: 50 })).toBe('label')
    expect(labelState('focus', { ...base, distance: 1 })).toBeNull()
    expect(labelState('focus', { ...base, interactive: true, distance: 50 })).toBe('label')
  })
  it('바닥 둘레까지 거리: 안이면 0, 회전 90°면 가로세로가 바뀐다', () => {
    const e = { x: 0, z: 0, w: 4, d: 2, rotation: 0 }
    expect(distanceToFootprint({ x: 1, z: 0.5 }, e)).toBe(0)
    expect(distanceToFootprint({ x: 3, z: 0 }, e)).toBeCloseTo(1, 6)
    expect(distanceToFootprint({ x: 3, z: 0 }, { ...e, rotation: 90 })).toBeCloseTo(2, 6)
  })
})
