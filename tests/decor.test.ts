// tests/decor.test.ts — 둘레 생활 흔적은 실습장(걸을 수 있는 곳) 밖, 건물 안에만
import { describe, expect, it } from 'vitest'
import rawLayout from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { decorSpots, hallBounds } from '../src/scene/Surroundings'

const layout = loadSceneLayout(rawLayout)
const zones = [layout.mainZone, ...(layout.absProtrusion ? [layout.absProtrusion] : [])]
const inside = (x: number, z: number, r: { xMin: number; xMax: number; zMin: number; zMax: number }, pad = 0) => x > r.xMin - pad && x < r.xMax + pad && z > r.zMin - pad && z < r.zMax + pad

describe('decorSpots', () => {
  it('세 가지(공구 정리판·부품함·휴식 코너)', () => {
    expect(decorSpots(hallBounds(layout), layout).map((d) => d.kind)).toEqual(['pegboard', 'cabinet', 'rest'])
  })
  it('실습장 구역과 0.5 m 이상 떨어지고 건물 안', () => {
    const b = hallBounds(layout)
    for (const d of decorSpots(b, layout)) {
      for (const zn of zones) expect(inside(d.x, d.z, zn, 0.5)).toBe(false)
      expect(inside(d.x, d.z, b)).toBe(true)
    }
  })
})
