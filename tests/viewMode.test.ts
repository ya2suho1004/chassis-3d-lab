// 시점 3단계(내려다보기·따라가기·1인칭) 계산 점검
import { describe, expect, it } from 'vitest'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { buildNavGrid } from '../src/scene/pathfind'
import { AIM_RANGE, DEFAULT_VIEW, EYE_HEIGHT, NPC_AIM, ORBIT_PRESET, PITCH_LIMIT, VIEW_MODES, aimedTarget, firstPersonLabel, lookStep, orbitPlacement, yawFromForward } from '../src/scene/viewMode'

const layout = loadSceneLayout(raw)
const tester = layout.equipment.find((e) => e.id === 'brake-tester-01')!
const vehicle = layout.equipment.find((e) => e.id === 'brake-vehicle-01')!

describe('시점 3단계', () => {
  it('세 시점이 있고 처음은 따라가기(잠정)', () => {
    expect(VIEW_MODES).toEqual(['overview', 'follow', 'first'])
    expect(DEFAULT_VIEW).toBe('follow')
  })
  it('눈높이는 캐릭터 키(1.72)보다 낮고 1.5 이상', () => {
    expect(EYE_HEIGHT).toBeGreaterThanOrEqual(1.5)
    expect(EYE_HEIGHT).toBeLessThan(1.72)
  })
  it('1인칭 yaw: 앞이 -z면 0, -x(서쪽)를 보면 +π/2', () => {
    expect(yawFromForward(0, -1)).toBeCloseTo(0, 6)
    expect(yawFromForward(-1, 0)).toBeCloseTo(Math.PI / 2, 6)
  })
  it('오른쪽으로 끌면 오른쪽(yaw 감소)을 보고, 위아래는 제한된다', () => {
    const r = lookStep(0, 0, 100, 0)
    expect(r.yaw).toBeLessThan(0)
    expect(lookStep(0, 0, 0, -100000).pitch).toBeCloseTo(PITCH_LIMIT, 6)
    expect(lookStep(0, 0, 0, 100000).pitch).toBeCloseTo(-PITCH_LIMIT, 6)
  })
  it('궤도 시점 자리: 보던 방향 뒤쪽·위에 두고 거리는 프리셋 값', () => {
    for (const m of ['overview', 'follow'] as const) {
      const { target, position } = orbitPlacement(m, { x: 5, z: 5 }, 0, -1)
      expect(target).toEqual([5, ORBIT_PRESET[m].targetY, 5])
      expect(position[2]).toBeGreaterThan(5) // -z를 보므로 카메라는 +z 쪽(뒤)
      expect(position[1]).toBeGreaterThan(target[1])
      const d = Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2])
      expect(d).toBeCloseTo(ORBIT_PRESET[m].distance, 6)
      expect(d).toBeGreaterThanOrEqual(ORBIT_PRESET[m].minDistance)
      expect(d).toBeLessThanOrEqual(ORBIT_PRESET[m].maxDistance)
    }
  })
  it('따라가기 카메라는 내려다보기보다 가깝고 낮다', () => {
    expect(ORBIT_PRESET.follow.distance).toBeLessThan(ORBIT_PRESET.overview.distance)
  })
})

describe('1인칭 조준점', () => {
  it('시험기 판(낮은 높이)을 보면 시험기, 위에 올라간 차체를 보면 시험 차량', () => {
    expect(aimedTarget(layout.equipment, layout.npc, { x: tester.x - 1.2, y: 0.03, z: tester.z }, 2)).toBe('brake-tester-01')
    expect(aimedTarget(layout.equipment, layout.npc, { x: vehicle.x, y: 0.9, z: vehicle.z }, 2)).toBe('brake-vehicle-01')
  })
  it('멀면(조준 거리 밖) 고르지 않는다', () => {
    expect(aimedTarget(layout.equipment, layout.npc, { x: tester.x, y: 0.03, z: tester.z }, AIM_RANGE + 0.1)).toBeNull()
  })
  it('교관 몸을 보면 대화 대상', () => {
    expect(aimedTarget(layout.equipment, layout.npc, { x: layout.npc.x, y: 1.2, z: layout.npc.z }, 2)).toBe(NPC_AIM)
  })
  it('빈 바닥은 아무것도 아님', () => {
    const grid = buildNavGrid(layout, 0.5)
    const s = layout.studentStart
    expect(grid.isBlocked(s.x, s.z)).toBe(false)
    expect(aimedTarget(layout.equipment, { x: -99, z: -99 }, { x: s.x, y: 0, z: s.z }, 1)).toBeNull()
  })
  it('1인칭 이름표는 가까운 것만, 고른 장비는 늘', () => {
    const far = { x: tester.x - 12, z: tester.z }
    expect(firstPersonLabel(far, tester, false)).toBe(false)
    expect(firstPersonLabel(far, tester, true)).toBe(true)
    expect(firstPersonLabel({ x: tester.x - 2, z: tester.z }, tester, false)).toBe(true)
  })
})
