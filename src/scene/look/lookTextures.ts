// 빛·재질 다듬기에 쓰는 그림(설계 2026-11-11 §4.5·§4.6). 그림 파일 없이, 점마다 계산해서 만든다.
// 캔버스의 번짐(gradient)·흐림(filter)은 쓰지 않는다: 크롬은 번짐에 미세한 점을 섞어 바닥에 잔 그물 무늬가 보였고, 흐림은 일부 사파리에서 안 된다.
// 만든 그림은 한 번만 만들어 여러 곳이 함께 쓴다. 받은 쪽에서 설정(반복 수 등)을 바꾸지 않는다.
import * as THREE from 'three'
import { PALETTE, type Bounds } from './lookConfig'

/** 결정적 의사 난수(매번 같은 무늬) */
function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }

const waves = new Map<number, Array<{ fx: number; fy: number; ph: number; amp: number }>>()
/** 이음매 없는 부드러운 흐름(-1~1): 온전한 주기의 코사인 물결 7개. u·v가 0과 1에서 같은 값이다 */
export function drift(u: number, v: number, seed: number): number {
  let w = waves.get(seed)
  if (!w) {
    const r = rng(seed)
    w = Array.from({ length: 7 }, () => {
      const fx = Math.round(r() * 3) * (r() < 0.5 ? -1 : 1), fy = Math.round(r() * 3) * (r() < 0.5 ? -1 : 1)
      return { fx, fy, ph: r() * Math.PI * 2, amp: 1 / (1 + Math.hypot(fx, fy)) }
    })
    waves.set(seed, w)
  }
  let sum = 0, norm = 0
  for (const k of w) { sum += k.amp * Math.cos(2 * Math.PI * (k.fx * u + k.fy * v) + k.ph); norm += k.amp }
  return sum / norm
}

/** 값 표의 바닥 색(#rrggbb)을 sRGB 0~255로 */
const FLOOR_RGB = [1, 3, 5].map((i) => parseInt(PALETTE.floor.slice(i, i + 2), 16)) as [number, number, number]

/** 에폭시 바닥 색(sRGB 0~255): 값 표의 바닥 색(#22774c)에 아주 옅고 넓은 색 흐름만 */
export function epoxyColorAt(u: number, v: number): [number, number, number] {
  const d = drift(u, v, 11)
  return [FLOOR_RGB[0] + d * 3, FLOOR_RGB[1] + d * 7, FLOOR_RGB[2] + d * 5]
}

/** 에폭시 바닥 광택(0~255, 재질 거칠기에 곱해짐): 넓은 얼룩으로 조금씩 다르게 */
export function epoxyRoughAt(u: number, v: number): number {
  return 118 + drift(u, v, 5) * 34 + drift(u * 2, v * 2, 23) * 10
}

/** 벽 세로 그늘(sRGB 회색 0~255, v = 0 아래 → 1 위). low: 바닥에 닿는 쪽이 어둡다. up: 위쪽 끝이 조금 어둡다 */
export function wallShadeAt(kind: 'low' | 'up', v: number): number {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))
  if (kind === 'low') return v < 0.22 ? lerp(111, 210, v / 0.22) : lerp(210, 255, (v - 0.22) / 0.78)
  return v < 0.7 ? lerp(255, 246, v / 0.7) : lerp(246, 210, (v - 0.7) / 0.3)
}

/** 바깥 바닥 밝기(sRGB 회색 0~255): 실습장 구역 안과 둘레 1.3 m는 255, 6.8 m 밖은 140 */
export function hallFalloffAt(x: number, z: number, zones: Bounds[]): number {
  let dist = Infinity
  for (const r of zones) dist = Math.min(dist, Math.hypot(Math.max(r.xMin - x, 0, x - r.xMax), Math.max(r.zMin - z, 0, z - r.zMax)))
  const t = Math.min(1, Math.max(0, (dist - 1.3) / 5.5))
  return 255 - (255 - 140) * (t * t * (3 - 2 * t))
}

/** 둥근 빛(0~1): 가운데 1, 반지름의 45%에서 0.42, 가장자리 0 */
export function glowAt(u: number, v: number): number {
  const r = Math.hypot(u - 0.5, v - 0.5) * 2
  if (r >= 1) return 0
  return r < 0.45 ? 1 - (r / 0.45) * 0.58 : 0.42 * (1 - (r - 0.45) / 0.55)
}

const cache = new Map<string, THREE.DataTexture>()
/** anisotropy: 비스듬히 볼 때의 선명도 보정(넓게 깔리는 바닥 그림에만 쓴다 — 태블릿 부담을 줄이려고 나머지는 1) */
function build(key: string, w: number, h: number, at: (u: number, v: number) => [number, number, number, number], opts: { srgb: boolean; repeat?: [number, number]; anisotropy?: number }): THREE.DataTexture {
  const hit = cache.get(key)
  if (hit) return hit
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = at((x + 0.5) / w, (y + 0.5) / h), o = (y * w + x) * 4
    for (let k = 0; k < 4; k++) data[o + k] = Math.round(Math.min(255, Math.max(0, c[k]!)))
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
  if (opts.srgb) t.colorSpace = THREE.SRGBColorSpace
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]) }
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true
  t.anisotropy = opts.anisotropy ?? 1
  t.needsUpdate = true
  cache.set(key, t)
  return t
}

export function epoxyColorTexture(repeat: [number, number]): THREE.DataTexture {
  return build(`epoxy-color-${repeat.join('x')}`, 256, 256, (u, v) => [...epoxyColorAt(u, v), 255], { srgb: true, repeat, anisotropy: 4 })
}
export function epoxyRoughnessTexture(repeat: [number, number]): THREE.DataTexture {
  return build(`epoxy-rough-${repeat.join('x')}`, 256, 256, (u, v) => { const r = epoxyRoughAt(u, v); return [r, r, r, 255] }, { srgb: false, repeat, anisotropy: 4 })
}
export function wallShadeTexture(kind: 'low' | 'up'): THREE.DataTexture {
  return build(`wall-shade-${kind}`, 4, 64, (_u, v) => { const g = wallShadeAt(kind, v); return [g, g, g, 255] }, { srgb: true })
}
/** 바깥 바닥 판(x: 서→동 = u, z: 북→남 = v 1→0)에 맞춘 밝기 그림 */
export function hallFalloffTexture(hall: Bounds, zones: Bounds[]): THREE.DataTexture {
  const key = `hall-${[hall, ...zones].map((r) => [r.xMin, r.xMax, r.zMin, r.zMax].join(',')).join('|')}`
  return build(key, 128, 128, (u, v) => { const g = hallFalloffAt(hall.xMin + u * (hall.xMax - hall.xMin), hall.zMax - v * (hall.zMax - hall.zMin), zones); return [g, g, g, 255] }, { srgb: true })
}
/** 둥근 빛 그림. alpha: 흰색에 투명도로(더하기 섞기 빛 판용), rgb: 밝기로(반사광 속 조명판용).
 *  rgb는 색 그림(sRGB)으로 읽혀서 빛 값으로는 alpha보다 빨리 어두워진다(가운데가 또렷한 반사 — 시안에서 이 모양으로 맞췄다) */
export function glowTexture(mode: 'alpha' | 'rgb'): THREE.DataTexture {
  return build(`glow-${mode}`, 64, 64, (u, v) => { const g = glowAt(u, v) * 255; return mode === 'alpha' ? [255, 255, 255, g] : [g, g, g, 255] }, { srgb: mode === 'rgb' })
}
