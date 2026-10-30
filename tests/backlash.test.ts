// 차동기어 백래시 연습: 연습 기어 값, 밀기(피니언 잡음·안 잡음), 답 확인, 모델 접점 맞춤(glb 노드와 앱 상수 대조)
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { FREE_LIMIT, backlashTravel, checkBacklash, initialBacklashState, randomBacklashCase, stepBacklash } from '../src/scene/backlash'
import { BL_GLB_POINTS, backlashFaceInRig, gaugeRootInRig } from '../src/scene/BacklashRig'
import { DIAL } from '../src/scene/dialGauge'

type Node = { name?: string; translation?: number[]; rotation?: number[]; children?: number[] }
const glb = (f: string) => {
  const b = readFileSync(new URL(`../public/assets/models/${f}`, import.meta.url))
  const len = b.readUInt32LE(12)
  return { size: b.length, j: JSON.parse(b.toString('utf8', 20, 20 + len)) as { nodes: Node[]; extensionsUsed?: string[]; images?: unknown[] } }
}
function worldOf(nodes: Node[], name: string): THREE.Vector3 {
  const idx = nodes.findIndex((n) => n.name === name)
  const parentOf = (i: number) => nodes.findIndex((n) => n.children?.includes(i))
  const v = new THREE.Vector3()
  for (let i = idx; i >= 0; i = parentOf(i)) {
    const n = nodes[i]!
    if (n.rotation) v.applyQuaternion(new THREE.Quaternion(...(n.rotation as [number, number, number, number])))
    if (n.translation) v.add(new THREE.Vector3(...(n.translation as [number, number, number])))
  }
  return v
}
/** 오래 밀기(1/60초씩) */
const push = (st: ReturnType<typeof initialBacklashState>, c: ReturnType<typeof randomBacklashCase>, dir: number, sec: number) => {
  st.push = dir
  for (let t = 0; t < sec; t += 1 / 60) stepBacklash(st, c, 1 / 60)
  st.push = 0
}

describe('백래시 연습 값', () => {
  it('연습 기어 백래시는 0.08~0.20 mm(0.01 단위), 미리 눌림 1 mm', () => {
    for (const r of [0, 0.3, 0.5, 0.999]) {
      const c = randomBacklashCase(() => r)
      expect(c.bl).toBeGreaterThanOrEqual(0.08)
      expect(c.bl).toBeLessThanOrEqual(0.2)
      expect(Math.round(c.bl * 100)).toBeCloseTo(c.bl * 100, 9)
      expect(c.preload).toBe(1)
    }
  })
  it('처음엔 틈 가운데, 게이지는 미리 눌림만큼', () => {
    const c = { bl: 0.12, preload: 1 }
    expect(backlashTravel(initialBacklashState(c), c)).toBeCloseTo(1, 9)
  })
  it('피니언을 잡으면 양 끝까지 밀었을 때 바늘이 오간 폭 = 백래시', () => {
    const c = { bl: 0.14, preload: 1 }, st = initialBacklashState(c)
    st.held = true
    push(st, c, 1, 3); const hi = backlashTravel(st, c)
    push(st, c, -1, 3); const lo = backlashTravel(st, c)
    expect(hi - lo).toBeCloseTo(0.14, 9)
    push(st, c, 1, 10)
    expect(backlashTravel(st, c)).toBeCloseTo(hi, 9)   // 더 밀어도 그대로(피니언에 걸림)
    expect(st.p).toBe(0)
  })
  it('피니언을 안 잡으면 기어가 같이 돌아 바늘이 멈추지 않는다(정해진 범위 안에서)', () => {
    const c = { bl: 0.1, preload: 1 }, st = initialBacklashState(c)
    push(st, c, 1, 2); const a = backlashTravel(st, c)
    push(st, c, 1, 2); const b = backlashTravel(st, c)
    expect(b - a).toBeGreaterThan(0.3)
    push(st, c, 1, 30)
    expect(st.p).toBeCloseTo(FREE_LIMIT, 9)
    push(st, c, -1, 60)
    expect(st.p).toBeCloseTo(-FREE_LIMIT, 9)
    // 게이지 측정 범위(0~10 mm) 안에 머문다
    expect(backlashTravel(st, c)).toBeGreaterThan(0)
    expect(backlashTravel(st, c)).toBeLessThan(DIAL.range)
  })
  it('답은 눈금 반 칸(0.005 mm) 안이면 맞음', () => {
    const c = { bl: 0.12, preload: 1 }
    expect(checkBacklash(0.12, c)).toBe(true)
    expect(checkBacklash(0.124, c)).toBe(true)
    expect(checkBacklash(0.13, c)).toBe(false)
    expect(checkBacklash(Number.NaN, c)).toBe(false)
  })
})

describe('백래시 연습 장면 모델', () => {
  const car = glb('diff-carrier.glb'), gb = glb('dial-gauge-b.glb')
  it('캐리어: 링기어·피니언·측정점·플랜지 자리, meshopt, 그림 없음, 200 KB 이하', () => {
    const names = car.j.nodes.map((n) => n.name)
    for (const n of ['DiffCarrier', 'Stand', 'Housing', 'RingGear', 'Pinion', 'MeasurePoint', 'FlangePoint']) expect(names).toContain(n)
    expect(car.j.extensionsUsed ?? []).toContain('EXT_meshopt_compression')
    expect(car.j.images ?? []).toHaveLength(0)
    expect(car.size).toBeLessThan(200_000)
  })
  it('긴 접촉자 게이지: 노드 이름은 다른 게이지와 같다', () => {
    const names = gb.j.nodes.map((n) => n.name)
    for (const n of ['DialGauge', 'Stand', 'Indicator', 'Needle', 'CounterNeedle', 'Spindle', 'Bezel', 'ContactPoint']) expect(names).toContain(n)
    expect(gb.size).toBeLessThan(150_000)
  })
  it('앱 상수(BL_GLB_POINTS)가 glb 노드 자리와 같다', () => {
    const pts: Array<[keyof typeof BL_GLB_POINTS, Node[], string]> = [
      ['measure', car.j.nodes, 'MeasurePoint'], ['flange', car.j.nodes, 'FlangePoint'], ['contact', gb.j.nodes, 'ContactPoint'], ['indicator', gb.j.nodes, 'Indicator'],
    ]
    for (const [k, nodes, name] of pts) worldOf(nodes, name).toArray().forEach((v, i) => expect(v).toBeCloseTo(BL_GLB_POINTS[k][i]!, 4))
  })
  it('게이지 받침이 작업대 위(높이 0)에 놓이고, 눈금판은 링기어 측정점에서 남쪽으로 떨어져 있다', () => {
    const root = gaugeRootInRig(1)
    expect(root.y).toBeCloseTo(0, 4)
    const face = backlashFaceInRig(1)
    expect(face.z - BL_GLB_POINTS.measure[2]).toBeGreaterThan(0.09)   // 링기어 둘레 밖
    expect(face.y).toBeCloseTo(0.43, 3)
  })
})

describe('연습 가까이 보기 구도(화면 크기 맞춤)', () => {
  it('판이 아래에 있으면 판 위 빈 곳 가운데, 세로 화면은 가로 가운데', async () => {
    const { practiceFraming, freeRectAround } = await import('../src/scene/DiscRunout')
    const phone = practiceFraming(390, 844, freeRectAround(390, 844, { left: 12, top: 520 }))
    expect(phone.offX).toBe(0)
    expect(844 / 2 - phone.offY).toBeCloseTo(64 + (520 - 64) / 2, 6)   // 눈금판 중심 화면 높이
    expect(phone.dialPx).toBeLessThanOrEqual(0.6 * 390)
    // 태블릿: 가로라 눈금판을 오른쪽(xFrac)에, 거리는 이전 구도와 비슷(약 0.2 m)
    const tab = practiceFraming(1024, 768, freeRectAround(1024, 768, { left: 232, top: 545 }))
    expect(1024 / 2 - tab.offX).toBeCloseTo(1024 * 0.6, 6)
    expect(tab.dist).toBeGreaterThan(0.15)
    expect(tab.dist).toBeLessThan(0.3)
  })
  it('폰 가로: 판이 오른쪽에 붙으면 왼쪽 빈 곳 가운데에 크게', async () => {
    const { practiceFraming, freeRectAround } = await import('../src/scene/DiscRunout')
    const free = freeRectAround(844, 390, { left: 496, top: 170 })
    expect(free).toEqual({ x0: 0, x1: 496, y0: 64, y1: 390 })
    const f = practiceFraming(844, 390, free)
    expect(844 / 2 - f.offX).toBeCloseTo(248, 6)
    expect(f.dialPx).toBeGreaterThan(200)
  })
  it('빈 곳이 아주 좁아도 거리는 유한하고 양수', async () => {
    const { practiceFraming } = await import('../src/scene/DiscRunout')
    const f = practiceFraming(320, 300, { x0: 0, x1: 320, y0: 64, y1: 80 })
    expect(Number.isFinite(f.dist)).toBe(true)
    expect(f.dist).toBeGreaterThan(0)
  })
})
