// 디스크 런아웃 연습: 연습 디스크 값, 답 확인, 모델 접점 맞춤(glb 노드와 앱 상수 대조)
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { GLB_POINTS, checkRunout, randomDiscCase } from '../src/scene/DiscRunout'

type Node = { name?: string; translation?: number[]; rotation?: number[]; children?: number[] }
const glb = (f: string) => {
  const b = readFileSync(new URL(`../public/assets/models/${f}`, import.meta.url))
  const len = b.readUInt32LE(12)
  return { size: b.length, j: JSON.parse(b.toString('utf8', 20, 20 + len)) as { nodes: Node[]; extensionsUsed?: string[]; images?: unknown[] } }
}
/** 뿌리 기준 노드 위치(부모 위치·회전을 따라 올라가며 계산) */
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

describe('디스크 런아웃 연습 값', () => {
  it('연습 디스크 흔들림은 0.02~0.09 mm(0.01 단위), 미리 눌림 0.5 mm', () => {
    for (const r of [0, 0.1, 0.5, 0.99]) {
      const c = randomDiscCase(() => r)
      expect(c.tir).toBeGreaterThanOrEqual(0.02)
      expect(c.tir).toBeLessThanOrEqual(0.09)
      expect(Math.round(c.tir * 100)).toBeCloseTo(c.tir * 100, 9)
      expect(c.preload).toBe(0.5)
    }
  })
  it('답은 눈금 반 칸(0.005 mm) 안이면 맞음', () => {
    const c = { tir: 0.04, phase: 0, preload: 0.5 }
    expect(checkRunout(0.04, c)).toBe(true)
    expect(checkRunout(0.044, c)).toBe(true)
    expect(checkRunout(0.05, c)).toBe(false)
    expect(checkRunout(Number.NaN, c)).toBe(false)
  })
})

describe('연습 장면 모델', () => {
  const fix = glb('disc-fixture.glb'), gh = glb('dial-gauge-h.glb')
  it('고정대: 도는 부분(Rotor)·측정점, meshopt, 그림 없음, 150 KB 이하', () => {
    const names = fix.j.nodes.map((n) => n.name)
    for (const n of ['DiscFixture', 'Vise', 'Knuckle', 'Rotor', 'MeasurePoint']) expect(names).toContain(n)
    expect(fix.j.extensionsUsed ?? []).toContain('EXT_meshopt_compression')
    expect(fix.j.images ?? []).toHaveLength(0)
    expect(fix.size).toBeLessThan(150_000)
  })
  it('앱 상수(GLB_POINTS)가 glb 노드 자리와 같다', () => {
    const m = worldOf(fix.j.nodes, 'MeasurePoint'), c = worldOf(gh.j.nodes, 'ContactPoint'), i = worldOf(gh.j.nodes, 'Indicator')
    m.toArray().forEach((v, k) => expect(v).toBeCloseTo(GLB_POINTS.measure[k]!, 4))
    c.toArray().forEach((v, k) => expect(v).toBeCloseTo(GLB_POINTS.contact[k]!, 4))
    i.toArray().forEach((v, k) => expect(v).toBeCloseTo(GLB_POINTS.indicator[k]!, 4))
  })
  it('게이지 측정축 높이 = 디스크 측정 위치 높이(마그네틱 베이스가 작업대에 놓인다)', () => {
    expect(GLB_POINTS.contact[1]).toBeCloseTo(GLB_POINTS.measure[1], 4)
  })
})
