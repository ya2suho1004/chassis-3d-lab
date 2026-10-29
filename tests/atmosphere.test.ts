// 2단계 화면 손질 점검: 발소리 걸음 세기 · 실습장 둘레(바깥 바닥·천장) 범위
import { describe, expect, it } from 'vitest'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { buildNavGrid } from '../src/scene/pathfind'
import { STEP_STRIDE, stepsCrossed } from '../src/scene/sound'
import { CEILING_H, HALL_MARGIN, LAB_WALL_H, hallBounds, lightPanels } from '../src/scene/Surroundings'
import { WALK_CYCLE_DISTANCE } from '../src/scene/models/CharacterModel'

const layout = loadSceneLayout(raw)

describe('발소리', () => {
  it('한 걸음은 걷기 동작 한 주기의 절반', () => {
    expect(STEP_STRIDE).toBeCloseTo(WALK_CYCLE_DISTANCE / 2, 6)
  })
  it('걸음 경계를 넘을 때만 센다', () => {
    expect(stepsCrossed(0, 0.5)).toBe(0)
    expect(stepsCrossed(0.5, 0.8)).toBe(1)
    expect(stepsCrossed(0.8, 0.8)).toBe(0)
    expect(stepsCrossed(0, STEP_STRIDE * 3 + 0.01)).toBe(3)
    expect(stepsCrossed(1, 0.5)).toBe(0)
  })
})

describe('실습장 둘레', () => {
  const b = hallBounds(layout)
  it('북·동은 실습장 외벽 그대로, 서·남은 트인 쪽 너머로 넓힌다', () => {
    expect(b.zMin).toBe(layout.mainZone.zMin)
    expect(b.xMax).toBe(layout.mainZone.xMax)
    expect(b.xMin).toBe(layout.mainZone.xMin - HALL_MARGIN)
    expect(b.zMax).toBeGreaterThan(layout.absProtrusion!.zMax)
  })
  it('천장은 실습장 벽보다 높고, 리프트로 올린 차(약 3 m)보다 높다', () => {
    expect(CEILING_H).toBeGreaterThan(LAB_WALL_H)
    expect(CEILING_H).toBeGreaterThan(3.2)
  })
  it('둘레 꾸밈은 걸어 들어갈 수 없다(이동 격자 밖)', () => {
    const grid = buildNavGrid(layout, 0.5)
    expect(grid.isBlocked(b.xMin + 2, 5)).toBe(true)
    expect(grid.isBlocked(5, b.zMax - 2)).toBe(true)
  })
  it('조명판은 천장 안에 고르게 놓인다', () => {
    const p = lightPanels(b)
    expect(p.length).toBeGreaterThan(20)
    for (const [x, z] of p) {
      expect(x).toBeGreaterThan(b.xMin)
      expect(x).toBeLessThan(b.xMax)
      expect(z).toBeGreaterThan(b.zMin)
      expect(z).toBeLessThan(b.zMax)
    }
  })
})
