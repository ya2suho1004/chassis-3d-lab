// tests/tapPulse.test.ts — 누름 고리(설계 2026-11-12 §4.3): 자리·크기 계산과 0.3초 동안의 퍼짐
import { describe, expect, it } from 'vitest'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { NPC_TAP_RADIUS, nextPulse, ringAt, TAP_RING_SECONDS, tapSpotOf } from '../src/scene/feel/tapPulse'

const layout = loadSceneLayout(raw)

describe('tapSpotOf — 누른 장비의 고리 자리', () => {
  it('가운데는 장비 자리, 반지름은 바닥 둘레의 대각선 절반', () => {
    expect(tapSpotOf({ x: 4, z: 7, w: 3, d: 4, rotation: 0 })).toEqual({ x: 4, z: 7, r: 2.5 })
  })
  it('장비를 90° 돌려 놓아도 반지름은 같다', () => {
    expect(tapSpotOf({ x: 0, z: 0, w: 3, d: 4, rotation: 90 }).r).toBeCloseTo(2.5, 9)
  })
  it('실제 배치의 모든 장비에서 고리는 장비 자리에서, 짧은 변의 절반보다 크게 시작한다', () => {
    expect(layout.equipment.length).toBeGreaterThan(10)
    for (const e of layout.equipment) {
      const s = tapSpotOf(e)
      expect([s.x, s.z], e.id).toEqual([e.x, e.z])
      expect(ringAt(s.r, 0).radius, e.id).toBeGreaterThan(Math.min(e.w, e.d) / 2)
    }
  })
})

describe('ringAt — 0.3초 동안 퍼지며 사라진다', () => {
  it('길이는 0.3초, 교관 고리 반지름은 0.5 m', () => {
    expect(TAP_RING_SECONDS).toBe(0.3)
    expect(NPC_TAP_RADIUS).toBe(0.5)
  })
  it('처음: 반지름의 0.9배, 불투명도 0.8', () => {
    expect(ringAt(2, 0)).toEqual({ radius: 1.8, opacity: 0.8 })
  })
  it('끝: 반지름의 1.2배, 불투명도 0', () => {
    const a = ringAt(2, 1)
    expect(a.radius).toBeCloseTo(2.4, 9)
    expect(a.opacity).toBe(0)
  })
  it('가운데: 고르게 퍼지고 고르게 옅어진다', () => {
    const a = ringAt(2, 0.5)
    expect(a.radius).toBeCloseTo(2.1, 9)
    expect(a.opacity).toBeCloseTo(0.4, 9)
  })
  it('범위를 벗어난 진행은 처음·끝 값으로 막는다', () => {
    expect(ringAt(1, -1)).toEqual(ringAt(1, 0))
    expect(ringAt(1, 5)).toEqual(ringAt(1, 1))
  })
})

describe('nextPulse — 누를 때마다 번호가 하나 오른다(같은 자리를 다시 눌러도 고리가 다시 퍼진다)', () => {
  it('처음은 1번', () => {
    expect(nextPulse(null, { x: 1, z: 2, r: 3 })).toEqual({ x: 1, z: 2, r: 3, seq: 1 })
  })
  it('다음은 앞 번호 + 1, 자리는 새 것', () => {
    expect(nextPulse({ x: 1, z: 2, r: 3, seq: 4 }, { x: 5, z: 6, r: 7 })).toEqual({ x: 5, z: 6, r: 7, seq: 5 })
  })
})
