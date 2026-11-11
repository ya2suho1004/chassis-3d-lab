// 실습장 빛·재질 값(설계 2026-11-11 §4): 값 표, 품질별 구성, 주된 빛 방향, 그림자 범위 맞춤
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { BAKE, LOOK, LOOK_DEFAULTS, fitShadowFrustum, keyDirection, labBounds, labZones, lookFor, withOverrides } from '../src/scene/look/lookConfig'

const layout = loadSceneLayout(raw)

describe('품질별 구성', () => {
  test('낮음: 실시간 그림자·화면 효과 없이 주된 빛 그림자를 구워서 깐다', () => {
    const t = lookFor(true, LOOK_DEFAULTS)
    expect(t.realtimeShadows).toBe(false); expect(t.postEffects).toBe(false)
    expect(t.sunShadow).toBe(LOOK_DEFAULTS.sunShadow); expect(t.contactShadow).toBe(LOOK_DEFAULTS.contactShadow)
    expect(t.envResolution).toBe(128)
  })
  test('높음: 실시간 그림자·화면 효과, 구운 것은 닿는 그늘만(약하게)', () => {
    const t = lookFor(false, LOOK_DEFAULTS)
    expect(t.realtimeShadows).toBe(true); expect(t.postEffects).toBe(true)
    expect(t.sunShadow).toBe(0); expect(t.contactShadow).toBe(LOOK_DEFAULTS.contactShadowHigh)
    expect(t.contactShadow).toBeLessThan(lookFor(true, LOOK_DEFAULTS).contactShadow)
    expect(t.envResolution).toBe(256)
  })
  test('낮음은 구석 그늘이 없는 만큼 주변광이 조금 세고, 빛 판이 조금 진하다', () => {
    expect(lookFor(true, LOOK_DEFAULTS).hemi).toBeGreaterThan(lookFor(false, LOOK_DEFAULTS).hemi)
    expect(lookFor(true, LOOK_DEFAULTS).halo).toBeGreaterThan(lookFor(false, LOOK_DEFAULTS).halo)
  })
  test('빛 번짐은 밝기 1을 넘는 것에만 걸린다(계측부 색은 1 이하)', () => {
    expect(LOOK_DEFAULTS.bloomThreshold).toBeGreaterThan(1)
  })
  test('시험 환경에서는 덮어쓰지 않은 기본값을 쓴다', () => {
    expect(LOOK).toEqual(LOOK_DEFAULTS)
  })
})

describe('개발용 조정 인자', () => {
  test('아는 이름의 숫자 값만 덮어쓴 새 값 표를 돌려준다(원본은 바뀌지 않는다)', () => {
    const before = { ...LOOK_DEFAULTS }
    const v = withOverrides(LOOK_DEFAULTS, 'key:2.5,env:0.4')
    expect(v.key).toBe(2.5); expect(v.env).toBe(0.4); expect(v.hemi).toBe(LOOK_DEFAULTS.hemi)
    expect(v).not.toBe(LOOK_DEFAULTS); expect(LOOK_DEFAULTS).toEqual(before)
  })
  test('모르는 이름·물려받은 이름(toString 등)·숫자가 아닌 값·빈 값은 버린다', () => {
    expect(withOverrides(LOOK_DEFAULTS, 'nope:1,key:abc,env:,hemi')).toEqual(LOOK_DEFAULTS)
    expect(Object.keys(withOverrides(LOOK_DEFAULTS, 'toString:1,constructor:2,valueOf:3'))).toEqual(Object.keys(LOOK_DEFAULTS))
    expect(withOverrides(LOOK_DEFAULTS, null)).toBe(LOOK_DEFAULTS)
    expect(withOverrides(LOOK_DEFAULTS, '')).toBe(LOOK_DEFAULTS)
  })
})

describe('주된 빛', () => {
  test('방향은 단위 벡터이고 남서쪽 위를 가리킨다(x = 동, y = 위, z = 남)', () => {
    const d = keyDirection(LOOK_DEFAULTS)
    expect(d.length()).toBeCloseTo(1, 6)
    expect(d.y).toBeCloseTo(Math.sin((LOOK_DEFAULTS.keyElevationDeg * Math.PI) / 180), 6)
    expect(d.z).toBeGreaterThan(0)
    expect(d.x).toBeLessThan(0)
    expect((Math.atan2(d.x, d.z) * 180) / Math.PI).toBeCloseTo(LOOK_DEFAULTS.keyAzimuthDeg, 6)
  })
  test('그림자 범위가 실습장(주 구역 + ABS 구역, 바닥~4.4 m)의 여덟 꼭짓점을 딱 맞게 담는다(옆 여유 0.5 m, 앞뒤 여유 1 m)', () => {
    const b = labBounds(layout), dir = keyDirection(LOOK_DEFAULTS)
    const f = fitShadowFrustum(b, BAKE.casterHeight, dir)
    expect(f.near).toBeGreaterThan(0); expect(f.far).toBeGreaterThan(f.near)
    const cam = new THREE.OrthographicCamera(f.left, f.right, f.top, f.bottom, f.near, f.far)
    cam.position.set(...f.position); cam.lookAt(...f.target); cam.updateMatrixWorld(true); cam.updateProjectionMatrix()
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    for (const x of [b.xMin, b.xMax]) for (const z of [b.zMin, b.zMax]) for (const y of [0, BAKE.casterHeight]) {
      const p = new THREE.Vector3(x, y, z).project(cam)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1); expect(Math.abs(p.y)).toBeLessThanOrEqual(1); expect(Math.abs(p.z)).toBeLessThanOrEqual(1)
      lo.min(p); hi.max(p)
    }
    // 헐겁지도 않다: 옆이 넓으면 그림자 점이 굵어지고, 앞뒤가 길면 그림자 치우침(shadowBias)이 커져 그림자가 물체에서 떨어진다
    const w = f.right - f.left, h = f.top - f.bottom, depth = f.far - f.near
    for (const side of [((lo.x + 1) * w) / 2, ((1 - hi.x) * w) / 2, ((lo.y + 1) * h) / 2, ((1 - hi.y) * h) / 2]) expect(side).toBeCloseTo(0.5, 6)
    for (const end of [((lo.z + 1) * depth) / 2, ((1 - hi.z) * depth) / 2]) expect(end).toBeCloseTo(1, 6)
  })
  test('예전 범위가 놓치던 공용 조작부·ABS 구역 남쪽 끝도 범위 안이다', () => {
    const f = fitShadowFrustum(labBounds(layout), BAKE.casterHeight, keyDirection(LOOK_DEFAULTS))
    const cam = new THREE.OrthographicCamera(f.left, f.right, f.top, f.bottom, f.near, f.far)
    cam.position.set(...f.position); cam.lookAt(...f.target); cam.updateMatrixWorld(true); cam.updateProjectionMatrix()
    const panel = layout.equipment.find((e) => e.kind === 'panel')!
    for (const [x, z] of [[panel.x, panel.z], [layout.absProtrusion!.xMax, layout.absProtrusion!.zMax]] as Array<[number, number]>) {
      const p = new THREE.Vector3(x, 0, z).project(cam)
      expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1)
    }
  })
})

describe('실습장 범위', () => {
  test('주 구역과 ABS 구역을 함께 담는다', () => {
    const b = labBounds(layout)
    expect(b.xMin).toBe(layout.mainZone.xMin); expect(b.xMax).toBe(layout.mainZone.xMax)
    expect(b.zMin).toBe(layout.mainZone.zMin); expect(b.zMax).toBe(layout.absProtrusion!.zMax)
    expect(labZones(layout)).toHaveLength(2)
  })
  test('ABS 구역이 없으면 주 구역만', () => {
    const only = { mainZone: layout.mainZone, absProtrusion: null }
    expect(labZones(only)).toHaveLength(1)
    expect(labBounds(only).zMax).toBe(layout.mainZone.zMax)
  })
})
