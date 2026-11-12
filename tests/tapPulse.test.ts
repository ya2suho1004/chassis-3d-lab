// tests/tapPulse.test.ts — 누름 고리(설계 2026-11-12 §4.3): 자리·크기 계산과 0.3초 동안의 퍼짐
import { describe, expect, it } from 'vitest'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { advanceRing, NPC_TAP_RADIUS, nextPulse, ringAt, ringRunFrom, TAP_RING_SECONDS, tapSpotOf, type TapPulse } from '../src/scene/feel/tapPulse'

const layout = loadSceneLayout(raw)

describe('tapSpotOf — 누른 장비의 고리 자리', () => {
  it('가운데는 장비 자리, 반지름은 바닥 네모의 대각선 절반', () => {
    expect(tapSpotOf({ x: 4, z: 7, w: 3, d: 4 })).toEqual({ x: 4, z: 7, r: 2.5 })
  })
  it('장비를 어느 쪽으로 돌려 놓아도 반지름은 같다(대각선은 돌려도 그대로라 회전 값을 쓰지 않는다)', () => {
    for (const rotation of [0, 45, 90, 180, 270]) {
      const turned = { x: 0, z: 0, w: 3, d: 4, rotation }
      expect(tapSpotOf(turned).r, `${rotation}°`).toBe(2.5)
    }
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

describe('고리의 진행 — 부품이 장면에 붙은 뒤의 누름에만 뜬다', () => {
  const at = (seq: number): TapPulse => ({ x: 1, z: 2, r: 3, seq })
  it('붙을 때의 번호는 이미 지난 누름이다: 화면을 바꿨다 돌아와 장면이 다시 붙어도 예전 고리가 다시 뜨지 않는다', () => {
    const run = ringRunFrom(at(3))
    expect(advanceRing(run, at(3), 10)).toBeNull()
    expect(advanceRing(run, at(3), 10.1)).toBeNull()
  })
  it('누름이 아직 없으면 쉰다', () => {
    const run = ringRunFrom(null)
    expect(advanceRing(run, null, 0)).toBeNull()
    expect(advanceRing(run, null, 5)).toBeNull()
  })
  it(`새 번호가 오면 그 화면부터 ${TAP_RING_SECONDS}초 동안 진행이 0에서 1로 가고, 끝나면 쉰다`, () => {
    const run = ringRunFrom(null)
    expect(advanceRing(run, at(1), 5)).toBe(0)
    expect(advanceRing(run, at(1), 5.15)).toBeCloseTo(0.5, 9)
    expect(advanceRing(run, at(1), 5.29)).toBeLessThan(1)
    expect(advanceRing(run, at(1), 5.3 + 1e-9)).toBeNull()
    expect(advanceRing(run, at(1), 9)).toBeNull() // 같은 번호로는 다시 시작하지 않는다
  })
  it('퍼지는 도중에 다시 누르면 처음부터 다시 퍼진다', () => {
    const run = ringRunFrom(null)
    advanceRing(run, at(1), 5)
    expect(advanceRing(run, at(1), 5.2)).toBeGreaterThan(0.6)
    expect(advanceRing(run, at(2), 5.2)).toBe(0)
  })
  it('진행 상태를 고쳐 쓴다(화면마다 새 객체를 만들지 않는다)', () => {
    const run = ringRunFrom(at(7))
    expect(run).toEqual({ seen: 7, startedAt: null })
    advanceRing(run, at(8), 2)
    expect(run).toEqual({ seen: 8, startedAt: 2 })
  })
})
