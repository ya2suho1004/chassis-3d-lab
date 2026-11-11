// 빛·재질 그림(설계 2026-11-11 §4.5·§4.6): 점마다 계산해 만든다 — 값 범위, 이음매 없음, 같은 입력이면 같은 값
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { EPOXY_ROUGH_MID, drift, epoxyColorAt, epoxyColorTexture, epoxyRoughAt, epoxyRoughnessTexture, glowAt, glowTexture, hallFalloffAt, hallFalloffTexture, wallShadeAt, wallShadeTexture } from '../src/scene/look/lookTextures'

const grid = (n: number) => Array.from({ length: n }, (_, i) => i / (n - 1))

describe('부드러운 흐름', () => {
  test('-1~1 범위이고 같은 입력이면 같은 값', () => {
    for (const u of grid(9)) for (const v of grid(9)) {
      const d = drift(u, v, 11)
      expect(d).toBeGreaterThanOrEqual(-1); expect(d).toBeLessThanOrEqual(1)
      expect(drift(u, v, 11)).toBe(d)
    }
  })
  test('이어 붙여도 이음매가 없다(0과 1에서 같은 값)', () => {
    for (const t of grid(7)) {
      expect(drift(0, t, 5)).toBeCloseTo(drift(1, t, 5), 9)
      expect(drift(t, 0, 5)).toBeCloseTo(drift(t, 1, 5), 9)
    }
  })
  test('씨앗이 다르면 무늬가 다르다', () => {
    expect(drift(0.3, 0.7, 5)).not.toBeCloseTo(drift(0.3, 0.7, 11), 3)
  })
})

describe('에폭시 바닥', () => {
  test('색은 #22774c에서 아주 조금만 벗어난다(얼룩 없음)', () => {
    for (const u of grid(9)) for (const v of grid(9)) {
      const [r, g, b] = epoxyColorAt(u, v)
      expect(Math.abs(r - 34)).toBeLessThanOrEqual(3); expect(Math.abs(g - 119)).toBeLessThanOrEqual(7); expect(Math.abs(b - 76)).toBeLessThanOrEqual(5)
    }
  })
  test('광택 값은 가운데 값(118) 둘레에서 조금씩 다르고, 평균이 가운데 값 가까이다(바닥 재질이 이 값으로 거칠기를 맞춘다)', () => {
    expect(EPOXY_ROUGH_MID).toBe(118)
    const vals = grid(17).flatMap((u) => grid(17).map((v) => epoxyRoughAt(u, v)))
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(EPOXY_ROUGH_MID - 44); expect(Math.max(...vals)).toBeLessThanOrEqual(EPOXY_ROUGH_MID + 44)
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(10)
    const cells = Array.from({ length: 64 }, (_, i) => (i + 0.5) / 64)
    const mean = cells.reduce((sum, u) => sum + cells.reduce((s, v) => s + epoxyRoughAt(u, v), 0), 0) / (64 * 64)
    expect(Math.abs(mean - EPOXY_ROUGH_MID)).toBeLessThan(4)
  })
})

describe('벽 세로 그늘', () => {
  test('아래 띠는 바닥에 닿는 쪽이 가장 어둡고 위로 갈수록 밝다', () => {
    expect(wallShadeAt('low', 0)).toBe(111); expect(wallShadeAt('low', 1)).toBe(255)
    for (let i = 1; i <= 20; i++) expect(wallShadeAt('low', i / 20)).toBeGreaterThanOrEqual(wallShadeAt('low', (i - 1) / 20))
  })
  test('윗벽은 위쪽 끝만 조금 어둡다', () => {
    expect(wallShadeAt('up', 0)).toBe(255); expect(wallShadeAt('up', 1)).toBe(210)
    expect(wallShadeAt('up', 0.5)).toBeGreaterThan(245)
  })
})

describe('바깥 바닥 밝기', () => {
  const zones = [{ xMin: 0, xMax: 18, zMin: 0, zMax: 14 }, { xMin: 14, xMax: 18, zMin: 14, zMax: 24 }]
  test('실습장 안과 바로 둘레는 가장 밝다', () => {
    expect(hallFalloffAt(9, 7, zones)).toBe(255)
    expect(hallFalloffAt(16, 20, zones)).toBe(255)
    expect(hallFalloffAt(-1, 7, zones)).toBe(255)
  })
  test('멀어질수록 어두워지고 6.8 m 밖은 140에서 멈춘다', () => {
    expect(hallFalloffAt(-4, 7, zones)).toBeLessThan(255); expect(hallFalloffAt(-4, 7, zones)).toBeGreaterThan(140)
    expect(hallFalloffAt(-7, 7, zones)).toBeCloseTo(140, 6)
    expect(hallFalloffAt(-9.5, 7, zones)).toBeCloseTo(140, 6)
    expect(hallFalloffAt(-3, 7, zones)).toBeGreaterThan(hallFalloffAt(-5, 7, zones))
  })
})

describe('둥근 빛', () => {
  test('가운데 1, 가장자리 0, 바깥으로 갈수록 줄어든다', () => {
    expect(glowAt(0.5, 0.5)).toBe(1); expect(glowAt(0, 0.5)).toBe(0); expect(glowAt(0.02, 0.02)).toBe(0)
    let prev = 1
    for (let i = 0; i <= 10; i++) { const g = glowAt(0.5 + i * 0.05, 0.5); expect(g).toBeLessThanOrEqual(prev); prev = g }
  })
})

describe('그림 만들기(캔버스 없이)', () => {
  test('바닥 색 그림: sRGB, 반복, 밉맵, 비스듬히 볼 때 선명도 4', () => {
    const t = epoxyColorTexture([4, 3])
    expect(t).toBeInstanceOf(THREE.DataTexture)
    expect(t.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(t.wrapS).toBe(THREE.RepeatWrapping); expect(t.wrapT).toBe(THREE.RepeatWrapping); expect(t.repeat.x).toBe(4); expect(t.repeat.y).toBe(3)
    expect(t.generateMipmaps).toBe(true); expect(t.minFilter).toBe(THREE.LinearMipmapLinearFilter)
    expect(t.anisotropy).toBe(4)
    expect(epoxyColorTexture([4, 3])).toBe(t)
  })
  test('광택 그림은 색 공간 없이(값 그대로)', () => {
    const t = epoxyRoughnessTexture([2, 2])
    expect(t.colorSpace).toBe(THREE.NoColorSpace); expect(t.anisotropy).toBe(4)
  })
  test('만든 바닥 그림을 이어 붙여도 이음매가 없다(맞닿는 끝 줄의 차이가 안쪽 이웃 점의 차이만큼)', () => {
    for (const [t, ch] of [[epoxyColorTexture([1, 1]), 1], [epoxyRoughnessTexture([1, 1]), 0]] as Array<[THREE.DataTexture, number]>) {
      const d = t.image.data as Uint8Array, n = 256
      const at = (x: number, y: number) => d[(y * n + x) * 4 + ch]!
      let wrap = 0, inside = 0
      for (let i = 0; i < n; i++) {
        wrap = Math.max(wrap, Math.abs(at(0, i) - at(n - 1, i)), Math.abs(at(i, 0) - at(i, n - 1)))
        for (let j = 1; j < n; j++) inside = Math.max(inside, Math.abs(at(j, i) - at(j - 1, i)), Math.abs(at(i, j) - at(i, j - 1)))
      }
      expect(wrap).toBeLessThanOrEqual(inside + 1)
    }
  })
  test('모든 그림은 그래픽 장치로 올라가게 표시돼 있다(안 그러면 빈 그림으로 보인다)', () => {
    const hall = { xMin: -10, xMax: 18, zMin: 0, zMax: 30 }
    for (const t of [epoxyColorTexture([4, 3]), epoxyRoughnessTexture([2, 2]), wallShadeTexture('low'), wallShadeTexture('up'), hallFalloffTexture(hall, [hall]), glowTexture('alpha'), glowTexture('rgb')]) expect(t.version).toBeGreaterThan(0)
  })
  test('이어 붙이지 않는 그림: 가장자리에서 멈추고, 선명도 보정은 쓰지 않는다. 밝기를 곱하는 그림은 sRGB, 투명도 그림은 값 그대로', () => {
    const hall = { xMin: -10, xMax: 18, zMin: 0, zMax: 30 }
    const srgb = [wallShadeTexture('low'), wallShadeTexture('up'), hallFalloffTexture(hall, [hall]), glowTexture('rgb')], plain = [glowTexture('alpha')]
    for (const t of [...srgb, ...plain]) { expect(t.wrapS).toBe(THREE.ClampToEdgeWrapping); expect(t.wrapT).toBe(THREE.ClampToEdgeWrapping); expect(t.anisotropy).toBe(1) }
    for (const t of srgb) expect(t.colorSpace).toBe(THREE.SRGBColorSpace)
    for (const t of plain) expect(t.colorSpace).toBe(THREE.NoColorSpace)
  })
  test('벽 그늘 그림은 아래 줄이 v = 0', () => {
    const d = wallShadeTexture('low').image.data as Uint8Array
    expect(d[0]).toBeLessThan(130)
    expect(d[d.length - 4]).toBeGreaterThan(250)
  })
  test('바깥 바닥 그림: 북쪽(z 최소)이 맨 윗줄(v = 1)', () => {
    const hall = { xMin: -10, xMax: 18, zMin: 0, zMax: 30 }
    const t = hallFalloffTexture(hall, [{ xMin: 0, xMax: 18, zMin: 0, zMax: 14 }])
    const d = t.image.data as Uint8Array, n = 128
    const at = (col: number, row: number) => d[(row * n + col) * 4]!
    expect(at(n - 2, n - 2)).toBe(255)
    expect(at(n - 2, 1)).toBeLessThan(160)
  })
  test('둥근 빛 그림: alpha는 흰색에 투명도로, rgb는 밝기로', () => {
    const a = glowTexture('alpha').image.data as Uint8Array, r = glowTexture('rgb').image.data as Uint8Array
    const mid = (32 * 64 + 32) * 4
    expect(a[0]).toBe(255); expect(a[3]).toBe(0); expect(a[mid + 3]).toBeGreaterThan(230)
    expect(r[0]).toBe(0); expect(r[3]).toBe(255); expect(r[mid]).toBeGreaterThan(230)
  })
})
