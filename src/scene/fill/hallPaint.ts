// 바깥 바닥 그림(공간 채우기): 기존 밝기 흐름(실습장에서 멀수록 어둡게) 위에 이웃 구역 바닥 칠·노란 구획선과 물건 밑 그늘을 한 장에 굽는다.
// 이웃 구역은 실시간 그림자·구운 그림자 범위 밖이라, 물건이 떠 보이지 않게 그늘을 바닥 그림에 넣는다(두 품질 같음, 그리기 호출 추가 없음).
// 캔버스 번짐·흐림 대신 점마다 계산한다(lookTextures.ts와 같은 까닭). 처음 쓸 때 한 번 만들어 재사용한다.
import * as THREE from 'three'
import { PALETTE, type Bounds } from '../look/lookConfig'
import { hallFalloffAt } from '../look/lookTextures'
import type { HallBounds } from '../Surroundings'
import type { ZonePaint } from './neighborZones'
import type { Footprint } from './partKit'

/** 바깥 바닥 그림 크기(픽셀, 정사각) — 건물 바닥 약 28 × 30 m에 약 35 px/m */
export const HALL_PAINT_SIZE = 1024
/** 그늘이 물건 바닥 밖으로 번지는 폭(m), 바닥 크기 안쪽으로 줄이는 폭(m) */
const SHADE_SPREAD = 0.32, SHADE_INSET = 0.06

const lin = (c: string): [number, number, number] => { const k = new THREE.Color(c); return [k.r, k.g, k.b] }

/** 선형 0~1 → sRGB 0~255 표(4096칸) */
const toLinear = (c: number) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4))
const toSrgb = (c: number) => (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055)
const ENCODE = (() => { const t = new Uint8Array(4096); for (let i = 0; i < 4096; i++) t[i] = Math.round(toSrgb(i / 4095) * 255); return t })()
/** sRGB 회색 0~255 → 선형 0~1 표 */
const DECODE = (() => { const t = new Float32Array(256); for (let i = 0; i < 256; i++) t[i] = toLinear(i / 255); return t })()
const enc = (v: number) => ENCODE[Math.max(0, Math.min(4095, Math.round(v * 4095)))]!

/** 점 (x, z)의 그늘 진하기 0~1 — 바닥 크기(돌린 직사각형) 밖으로 부드럽게 줄어든다 */
export function footShade(f: Footprint, x: number, z: number): number {
  const dx = x - f.x, dz = z - f.z, c = Math.cos(f.rotY), s = Math.sin(f.rotY)
  // 세계 → 지역(세로축 회전의 역)
  const lx = dx * c - dz * s, lz = dx * s + dz * c
  const ox = Math.max(Math.abs(lx) - (f.w / 2 - SHADE_INSET), 0), oz = Math.max(Math.abs(lz) - (f.d / 2 - SHADE_INSET), 0)
  const t = 1 - Math.min(1, Math.hypot(ox, oz) / SHADE_SPREAD)
  return f.dark * t * t * (3 - 2 * t)
}

const cache = new Map<string, THREE.DataTexture>()

/** 바깥 바닥 판(x: 서→동 = u, z: 북→남 = v 1→0)에 맞춘 색 그림. 재질 색은 흰색으로 두고 쓴다 */
export function hallPaintTexture(hall: HallBounds, zones: Bounds[], paint: ZonePaint[], feet: Footprint[], line: { color: string; width: number }): THREE.DataTexture {
  const key = JSON.stringify([hall, zones, paint, feet.length, feet.reduce((a, f) => a + f.x * 3 + f.z * 7 + f.w + f.d, 0).toFixed(3), line])
  const hit = cache.get(key)
  if (hit) return hit
  const W = HALL_PAINT_SIZE, H = HALL_PAINT_SIZE, sx = (hall.xMax - hall.xMin) / W, sz = (hall.zMax - hall.zMin) / H
  const xAt = (i: number) => hall.xMin + (i + 0.5) * sx
  const zAt = (j: number) => hall.zMax - (j + 0.5) * sz // 줄 j = v 아래부터
  // ① 그늘: 물건마다 둘레 칸만 훑는다
  const shade = new Float32Array(W * H)
  for (const f of feet) {
    const r = Math.hypot(f.w, f.d) / 2 + SHADE_SPREAD
    const i0 = Math.max(0, Math.floor((f.x - r - hall.xMin) / sx)), i1 = Math.min(W - 1, Math.ceil((f.x + r - hall.xMin) / sx))
    const j0 = Math.max(0, Math.floor((hall.zMax - (f.z + r)) / sz)), j1 = Math.min(H - 1, Math.ceil((hall.zMax - (f.z - r)) / sz))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = footShade(f, xAt(i), zAt(j))
      if (a > 0) { const o = j * W + i; shade[o] = 1 - (1 - shade[o]!) * (1 - a) }
    }
  }
  // ② 색: 바탕(바깥 바닥 색) → 구역 칠 → 구획선, × 밝기 흐름 × (1 − 그늘)
  const base = lin(PALETTE.hallFloor), lineC = lin(line.color)
  const fills = paint.map((p) => ({ r: p.rect, c: lin(p.color) }))
  const data = new Uint8Array(W * H * 4)
  for (let j = 0; j < H; j++) {
    const z = zAt(j)
    for (let i = 0; i < W; i++) {
      const x = xAt(i)
      let c = base
      for (const f of fills) {
        const r = f.r
        if (x < r.xMin || x > r.xMax || z < r.zMin || z > r.zMax) continue
        const edge = Math.min(x - r.xMin, r.xMax - x, z - r.zMin, r.zMax - z)
        c = edge < line.width ? lineC : f.c
      }
      const g = DECODE[Math.round(hallFalloffAt(x, z, zones))]! * (1 - shade[j * W + i]!)
      const o = (j * W + i) * 4
      data[o] = enc(c[0] * g); data[o + 1] = enc(c[1] * g); data[o + 2] = enc(c[2] * g); data[o + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true
  t.anisotropy = 4
  t.needsUpdate = true
  cache.set(key, t)
  return t
}
