// tests/goalSpot.test.ts — 목적지 표식이 설 자리(설계 2026-11-12 §4.5): 장비의 바닥 둘레와, 그 자리에 겹친 것 가운데 가장 높은 것
import { describe, expect, it } from 'vitest'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { goalSpotOf } from '../src/scene/feel/goalSpot'

const layout = loadSceneLayout(raw)
const eq = (id: string) => layout.equipment.find((e) => e.id === id)!
const box = (id: string, x: number, z: number, w: number, d: number, h: number, rotation = 0) => ({ id, x, z, w, d, h, rotation })

describe('goalSpotOf', () => {
  it('목적지가 없거나 배치에 없는 장비면 자리도 없다', () => {
    expect(goalSpotOf(layout.equipment, null)).toBeNull()
    expect(goalSpotOf(layout.equipment, 'no-such-equipment')).toBeNull()
  })
  it('자리와 크기는 그 장비의 바닥 둘레다(돌려 놓은 장비는 돌린 크기)', () => {
    const p = eq('brake-control-panel-01')
    expect(p.rotation).toBe(90)
    const s = goalSpotOf(layout.equipment, p.id)!
    expect([s.x, s.z, s.h]).toEqual([p.x, p.z, p.h])
    expect(s.w).toBeCloseTo(p.d, 9)
    expect(s.d).toBeCloseTo(p.w, 9)
  })
  it('위에 겹친 것이 없으면 높이는 그 장비의 높이', () => {
    const c = eq('min-turning-radius-01')
    const s = goalSpotOf(layout.equipment, c.id)!
    expect([s.x, s.z, s.h]).toEqual([c.x, c.z, c.h])
    expect(s.w).toBeCloseTo(c.w, 9)
    expect(s.d).toBeCloseTo(c.d, 9)
  })
  it('제동력 시험기는 그 자리에 차량이 겹쳐 있어 차량 높이를 쓴다(표식이 차 안에 묻히지 않게)', () => {
    const t = eq('brake-tester-01'), v = eq('brake-vehicle-01')
    const s = goalSpotOf(layout.equipment, t.id)!
    expect(v.h).toBeGreaterThan(t.h)
    expect(s.h).toBe(v.h)
    expect([s.x, s.z]).toEqual([t.x, t.z])
    expect(s.w).toBeCloseTo(t.w, 9)
    expect(s.d).toBeCloseTo(t.d, 9)
  })
  it('겹친 것이 여럿이면 가장 높은 것', () => {
    const list = [box('a', 0, 0, 2, 2, 0.3), box('low', 0.5, 0, 2, 2, 0.8), box('high', -0.5, 0, 2, 2, 1.9), box('far', 10, 10, 1, 1, 5)]
    expect(goalSpotOf(list, 'a')!.h).toBe(1.9)
  })
  it('맞닿기만 한 것은 겹친 것으로 치지 않는다', () => {
    const list = [box('a', 0, 0, 2, 2, 0.3), box('next', 2, 0, 2, 2, 1.9)]
    expect(goalSpotOf(list, 'a')!.h).toBe(0.3)
  })
  it('돌려 놓은 이웃은 돌린 바닥 둘레로 겹침을 본다', () => {
    // 이웃은 가로 0.4 × 세로 4인데 90° 돌려 가로 4 × 세로 0.4가 된다 — 돌려야 a에 닿는다
    expect(goalSpotOf([box('a', 0, 0, 2, 2, 0.3), box('bar', 2.5, 0, 0.4, 4, 1.2, 0)], 'a')!.h).toBe(0.3)
    expect(goalSpotOf([box('a', 0, 0, 2, 2, 0.3), box('bar', 2.5, 0, 0.4, 4, 1.2, 90)], 'a')!.h).toBe(1.2)
  })
  it('과제의 목적지 장비 세 가지 모두 자리가 나온다', () => {
    for (const id of ['brake-tester-01', 'brake-control-panel-01', 'min-turning-radius-01']) {
      const s = goalSpotOf(layout.equipment, id)
      expect(s, id).not.toBeNull()
      expect(s!.h, id).toBeGreaterThan(0)
    }
  })
})
