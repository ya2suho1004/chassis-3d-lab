// 바깥 바닥 그림(공간 채우기): 기존 밝기 흐름(실습장에서 멀수록 어둡게) 위에 이웃 구역 바닥 칠·노란 구획선과 물건 밑 그늘을 한 장에 굽는다.
// 이웃 구역은 실시간 그림자·구운 그림자 범위 밖이라, 물건이 떠 보이지 않게 그늘을 바닥 그림에 넣는다(두 품질 같음, 그리기 호출 추가 없음).
// 캔버스 번짐·흐림 대신 계산한다(lookTextures.ts와 같은 까닭). 들어갈 때 한 번 굽기라 가볍게: 밝기 흐름은 예전 그림과 같은 128² 표에서 보간하고,
// 구역 칠·구획선·그늘은 줄마다 그 줄에 걸친 범위만 채운다. 남는 큰 배열은 결과 색 배열 하나뿐이다. 처음 쓸 때 한 번 만들어 재사용한다.
import * as THREE from 'three'
import { PALETTE, type Bounds } from '../look/lookConfig'
import { hallFalloffAt } from '../look/lookTextures'
import type { HallBounds } from '../Surroundings'
import type { ZonePaint } from './neighborZones'
import type { Footprint } from './partKit'

/** 바깥 바닥 그림 크기(픽셀, 정사각) — 건물 바닥 약 28 × 30 m에 약 35 px/m */
export const HALL_PAINT_SIZE = 1024
/** 밝기 흐름 표 크기 — 공간 채우기 전의 바깥 바닥 밝기 그림(hallFalloffTexture, 128²)과 같아 겉모습이 같다 */
const FALLOFF_SIZE = 128
/** 그늘이 물건 바닥 밖으로 번지는 폭(m), 바닥 크기 안쪽으로 줄이는 폭(m) */
const SHADE_SPREAD = 0.32, SHADE_INSET = 0.06

const lin = (c: string): [number, number, number] => { const k = new THREE.Color(c); return [k.r, k.g, k.b] }
const toLinear = (c: number) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4))
const toSrgb = (c: number) => (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055)
/** 선형 0~1 → sRGB 0~255 표(4096칸) */
const ENCODE = (() => { const t = new Uint8Array(4097); for (let i = 0; i <= 4096; i++) t[i] = Math.round(toSrgb(Math.min(1, i / 4095)) * 255); return t })()

/** 점 (x, z)의 그늘 진하기 0~1 — 바닥 크기(돌린 직사각형) 밖으로 부드럽게 줄어든다 */
export function footShade(f: Footprint, x: number, z: number): number {
  return shadeAt(prepFoot(f), x, z)
}
/** 그늘 계산용으로 미리 셈: 회전 cos·sin, 안쪽으로 줄인 반폭, 그늘이 닿는 축 정렬 범위의 반폭(ax·az) */
interface PreppedFoot { f: Footprint; c: number; s: number; hw: number; hd: number; ax: number; az: number }
const prepFoot = (f: Footprint): PreppedFoot => {
  const c = Math.cos(f.rotY), s = Math.sin(f.rotY), ac = Math.abs(c), as = Math.abs(s)
  return { f, c, s, hw: f.w / 2 - SHADE_INSET, hd: f.d / 2 - SHADE_INSET, ax: ac * (f.w / 2) + as * (f.d / 2) + SHADE_SPREAD, az: as * (f.w / 2) + ac * (f.d / 2) + SHADE_SPREAD }
}
function shadeAt(p: PreppedFoot, x: number, z: number): number {
  const dx = x - p.f.x, dz = z - p.f.z
  // 세계 → 지역(세로축 회전의 역)
  const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c
  const ox = Math.max(Math.abs(lx) - p.hw, 0), oz = Math.max(Math.abs(lz) - p.hd, 0)
  const d2 = ox * ox + oz * oz
  if (d2 >= SHADE_SPREAD * SHADE_SPREAD) return 0
  const t = 1 - Math.sqrt(d2) / SHADE_SPREAD
  return p.f.dark * t * t * (3 - 2 * t)
}

/** 밝기 흐름 표(선형 값, 128²): 예전 그림처럼 칸 가운데에서 재고 sRGB 회색으로 반올림한 뒤 선형으로 — 그래픽 장치도 선형으로 바꿔 보간한다 */
function falloffTable(hall: HallBounds, zones: Bounds[]): Float32Array {
  const n = FALLOFF_SIZE, t = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const g = Math.round(hallFalloffAt(hall.xMin + ((i + 0.5) / n) * (hall.xMax - hall.xMin), hall.zMax - ((j + 0.5) / n) * (hall.zMax - hall.zMin), zones))
    t[j * n + i] = toLinear(g / 255)
  }
  return t
}

/** 굽기 본체: RGBA 색 배열(줄 j = 남쪽에서부터, v 아래부터) */
export function hallPaintData(hall: HallBounds, zones: Bounds[], paint: ZonePaint[], feet: Footprint[], line: { color: string; width: number }): Uint8Array {
  const W = HALL_PAINT_SIZE, H = HALL_PAINT_SIZE, sx = (hall.xMax - hall.xMin) / W, sz = (hall.zMax - hall.zMin) / H
  const xAt = (i: number) => hall.xMin + (i + 0.5) * sx
  const zAt = (j: number) => hall.zMax - (j + 0.5) * sz
  const colOf = (x: number) => Math.round((x - hall.xMin) / sx - 0.5)
  // 밝기 흐름: 128² 표를 겹선형 보간(가로 쪽 칸·비율은 미리 셈)
  const n = FALLOFF_SIZE, fall = falloffTable(hall, zones)
  const ci0 = new Int32Array(W), ci1 = new Int32Array(W), cfx = new Float32Array(W)
  for (let i = 0; i < W; i++) { const u = ((i + 0.5) / W) * n - 0.5, k = Math.floor(u); ci0[i] = Math.max(0, Math.min(n - 1, k)); ci1[i] = Math.max(0, Math.min(n - 1, k + 1)); cfx[i] = u - k }
  // 색 표: 0 = 바탕(바깥 바닥 색), 1 = 구획선, 2… = 구역 칠
  const pal = new Float32Array([...lin(PALETTE.hallFloor), ...lin(line.color), ...paint.flatMap((p) => lin(p.color))])
  const feetP = feet.map(prepFoot)
  // 한 줄짜리 임시 배열(색 번호, 그늘)
  const rowI = new Uint8Array(W), rowS = new Float32Array(W)
  const data = new Uint8Array(W * H * 4)
  for (let j = 0; j < H; j++) {
    const z = zAt(j)
    // 색 번호: 바탕 → 구역 칠 → 구획선(이 줄에 걸친 구역만, 그 가로 범위만)
    rowI.fill(0)
    paint.forEach(({ rect: r }, k) => {
      if (z < r.zMin || z > r.zMax) return
      const i0 = Math.max(0, Math.ceil((r.xMin - hall.xMin) / sx - 0.5)), i1 = Math.min(W - 1, Math.floor((r.xMax - hall.xMin) / sx - 0.5))
      if (Math.min(z - r.zMin, r.zMax - z) < line.width) { rowI.fill(1, i0, i1 + 1); return }
      rowI.fill(2 + k, i0, i1 + 1)
      for (let i = i0; i <= i1 && xAt(i) - r.xMin < line.width; i++) rowI[i] = 1
      for (let i = i1; i >= i0 && r.xMax - xAt(i) < line.width; i--) rowI[i] = 1
    })
    // 그늘: 이 줄에 걸친 물건만, 그 둘레 칸만
    rowS.fill(0)
    for (const p of feetP) {
      if (Math.abs(z - p.f.z) > p.az) continue
      for (let i = Math.max(0, colOf(p.f.x - p.ax)), i1 = Math.min(W - 1, colOf(p.f.x + p.ax)); i <= i1; i++) {
        const a = shadeAt(p, xAt(i), z)
        if (a > 0) rowS[i] = 1 - (1 - rowS[i]!) * (1 - a)
      }
    }
    // 밝기 흐름(세로 칸·비율은 줄마다 한 번) × (1 − 그늘) × 색 → sRGB 표. 값은 모두 0~1이라 표 번호가 4095를 넘지 않는다
    const v = ((j + 0.5) / H) * n - 0.5, kv = Math.floor(v), fz = v - kv
    const r0 = Math.max(0, Math.min(n - 1, kv)) * n, r1 = Math.max(0, Math.min(n - 1, kv + 1)) * n
    for (let i = 0, o = j * W * 4; i < W; i++, o += 4) {
      const a0 = fall[r0 + ci0[i]!]!, a1 = fall[r0 + ci1[i]!]!, b0 = fall[r1 + ci0[i]!]!, b1 = fall[r1 + ci1[i]!]!
      const fx = cfx[i]!, top = a0 + (a1 - a0) * fx, bot = b0 + (b1 - b0) * fx
      const g = (top + (bot - top) * fz) * (1 - rowS[i]!) * 4095, c = rowI[i]! * 3
      data[o] = ENCODE[(pal[c]! * g + 0.5) | 0]!
      data[o + 1] = ENCODE[(pal[c + 1]! * g + 0.5) | 0]!
      data[o + 2] = ENCODE[(pal[c + 2]! * g + 0.5) | 0]!
      data[o + 3] = 255
    }
  }
  return data
}

const cache = new Map<string, THREE.DataTexture>()

/** 바깥 바닥 판(x: 서→동 = u, z: 북→남 = v 1→0)에 맞춘 색 그림. 재질 색은 흰색으로 두고 쓴다. 같은 값이면 같은 그림을 돌려준다 */
export function hallPaintTexture(hall: HallBounds, zones: Bounds[], paint: ZonePaint[], feet: Footprint[], line: { color: string; width: number }): THREE.DataTexture {
  const key = JSON.stringify([hall, zones, paint, feet, line])
  const hit = cache.get(key)
  if (hit) return hit
  const t = new THREE.DataTexture(hallPaintData(hall, zones, paint, feet, line), HALL_PAINT_SIZE, HALL_PAINT_SIZE, THREE.RGBAFormat)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true
  t.anisotropy = 4
  t.needsUpdate = true
  cache.set(key, t)
  return t
}
