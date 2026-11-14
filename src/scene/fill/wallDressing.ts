// 실습장 벽 꾸미기(설계 2026-11-14 §3-2): 북쪽 벽(z = 주 구역 zMin)과 동쪽 벽(x = 주 구역 xMax).
// 높이 2.0 m 아래에 붙이는 것은 벽에서 0.12 m 넘게 튀어나오지 않는다(학생이 벽에 바짝 붙어 걸을 수 있다). 더 두꺼운 것(셔터 감김 상자)은 2.0 m 위에 둔다.
// 자리(벽을 따라 잰 값: 북쪽 벽은 x, 동쪽 벽은 z)는 지금 배치의 벽 앞 장비에 가려지지 않게 고른 값이다 — 배치가 바뀌면 tests/spaceFill.test.ts가 알린다.
// 셔터·출입문 자리는 지어낸 것이다(일반 실습장 기준, 실제 학교 아님). 창은 빛을 더하지 않는다(유리만 조금 밝게 보이는 그림).
import type { SceneLayout } from '../layoutModel'
import type { HallBounds } from '../Surroundings'
import { atlasUv } from './fillAtlas'
import { at, type Kits } from './fillProps'

/** 벽에 붙이는 것의 최대 두께(높이 WALL_CLEAR_H 아래) */
export const WALL_MAX_DEPTH = 0.12
export const WALL_CLEAR_H = 2.0

/** 바닥 가까이(2.0 m 아래까지) 내려오는 벽 꾸밈의 자리: 벽을 따라 가운데 at, 폭 w, 아래 끝 높이 y0 */
const LOW = {
  door: { wall: 'east', at: 5.4, w: 1.14, y0: 0 },
  shutter: { wall: 'east', at: 11.7, w: 3.8, y0: 0 },
  'shutter-switch': { wall: 'east', at: 13.78, w: 0.16, y0: 1.13 },
  'extinguisher-north': { wall: 'north', at: 16.4, w: 0.44, y0: 0.25 },
  'extinguisher-east': { wall: 'east', at: 6.55, w: 0.44, y0: 0.25 },
  bulletin: { wall: 'north', at: 1.2, w: 1.5, y0: 1.15 },
  breaker: { wall: 'east', at: 7.55, w: 0.6, y0: 1.15 },
  'sign-goggles': { wall: 'north', at: 5.05, w: 0.4, y0: 1.6 },
  'sign-tidy': { wall: 'north', at: 9.58, w: 0.4, y0: 1.6 },
  'sign-safety': { wall: 'east', at: 8.4, w: 0.4, y0: 1.6 },
  'outlet-west': { wall: 'north', at: 4.75, w: 0.12, y0: 1.16 },
  'outlet-mid': { wall: 'north', at: 9.95, w: 0.12, y0: 1.16 },
  'air-tap': { wall: 'north', at: 15.8, w: 0.09, y0: 1.18 },
} as const satisfies Record<string, { wall: 'north' | 'east'; at: number; w: number; y0: number }>

export interface WallFixture { name: string; wall: 'north' | 'east'; from: number; to: number; y0: number }

/** 바닥 가까이 내려오는 벽 꾸밈의 벽 위 구간(시험이 벽 앞 장비와 겹치지 않는지 본다) */
export function wallFixtures(): WallFixture[] {
  return Object.entries(LOW).map(([name, s]) => ({ name, wall: s.wall, from: s.at - s.w / 2, to: s.at + s.w / 2, y0: s.y0 }))
}

const C = {
  frame: '#b8bcbb', frameDark: '#8e9393', sill: '#c9cbc7', shutter: '#a9afb2', housing: '#8f9598', rail: '#7d8487',
  door: '#7d8b96', doorFrame: '#6c767d', conduit: '#c8cac6', air: '#7f99a8', box: '#bfc2bf', extRed: '#b8302a', cork: '#b9bcbc', handle: '#4d5357',
} as const

/** 창 띠 하나(벽 면 위, 앞 = 지역 +z): 폭 w, 아래 y0, 높이 h, 칸 수 panes */
function windowUnit({ solid: k, decal: t }: Kits, w: number, y0: number, h: number, panes: number): void {
  const f = 0.05
  t.quad(w - f, h - f, [0, y0 + h / 2, 0.012], atlasUv('glass'))
  k.box(w + 0.06, f, 0.05, [0, y0 + h, 0.025], C.frame)
  k.box(w + 0.12, 0.04, 0.09, [0, y0 - 0.02, 0.045], C.sill)
  for (let i = 0; i <= panes; i++) k.box(i === 0 || i === panes ? f : 0.035, h, 0.05, [-w / 2 + (i * w) / panes, y0 + h / 2, 0.025], C.frame)
  k.box(w, 0.03, 0.04, [0, y0 + h * 0.62, 0.02], C.frameDark)
}

export function buildWallDressing(kits: Kits, b: HallBounds, layout: Pick<SceneLayout, 'mainZone'>): void {
  const mz = layout.mainZone
  // 벽 앞면 기준 좌표계(북쪽 벽은 지역 x = 동쪽, 동쪽 벽은 지역 x = 남쪽. 앞 = 지역 +z = 실습장 쪽)
  const N = (x: number, fn: () => void) => at(kits, x, mz.zMin, 0, fn)
  const E = (z: number, fn: () => void) => at(kits, mz.xMax, z, -Math.PI / 2, fn)
  const on = (s: { wall: 'north' | 'east'; at: number }, fn: () => void) => (s.wall === 'north' ? N : E)(s.at, fn)
  const k = kits.solid, t = kits.decal

  // 창 띠: 북쪽 벽 다섯 칸 + 서쪽으로 이어진 건물 북쪽 벽 두 칸(높이 2.4~3.2)
  const winY = 2.4, winH = 0.8
  for (const cx of [2.0, 5.5, 12.5, 16.0]) N(cx, () => windowUnit(kits, 3.0, winY, winH, 3))
  N(8.75, () => windowUnit(kits, 2.5, winY, winH, 2))
  for (const cx of [b.xMin + 2.0, b.xMin + 5.5]) N(cx, () => windowUnit(kits, 3.0, winY, winH, 3))

  // 셔터(차가 드나드는 말아 올리는 문): 제동력 조작부 남쪽. 살 폭 3.6 m, 높이 3.0 m, 감김 상자는 3.0 m 위
  const shW = 3.6, shH = 3.0
  on(LOW.shutter, () => {
    t.quad(shW, shH, [0, shH / 2, 0.02], atlasUv('shutter'), undefined, C.shutter)
    for (const s of [-1, 1]) k.box(0.1, shH, 0.08, [s * (shW / 2 + 0.05), shH / 2, 0.04], C.rail)
    k.box(shW, 0.07, 0.05, [0, 0.035, 0.035], C.rail)
    k.box(shW + 0.3, 0.38, 0.34, [0, shH + 0.19, 0.17], C.housing)
  })
  on(LOW['shutter-switch'], () => k.box(0.16, 0.24, 0.08, [0, 1.25, 0.04], C.box))
  // 출입문: 부품 작업대와 기록 책상 사이
  const doorW = 1.0, doorH = 2.1
  on(LOW.door, () => {
    t.quad(doorW - 0.04, doorH - 0.02, [0, doorH / 2, 0.022], atlasUv('doorLeaf'), undefined, C.door)
    for (const s of [-1, 1]) k.box(0.07, doorH + 0.07, 0.05, [s * (doorW / 2 + 0.035), (doorH + 0.07) / 2, 0.025], C.doorFrame)
    k.box(doorW + 0.14, 0.07, 0.05, [0, doorH + 0.035, 0.025], C.doorFrame)
    k.box(0.14, 0.025, 0.04, [doorW / 2 - 0.14, 1.0, 0.06], C.handle)
    k.box(0.05, 0.08, 0.02, [doorW / 2 - 0.1, 1.0, 0.03], C.handle)
    // 비상구 유도등(문 위, 2.0 m 위)
    k.box(0.42, 0.17, 0.06, [0, 2.36, 0.03], '#e9ece8')
    t.quad(0.38, 0.14, [0, 2.36, 0.062], atlasUv('exit'))
  })
  // 시계: 창 사이 기둥 벽(바늘은 고정)
  N(7.25, () => { k.cyl(0.18, 0.04, [0, 2.8, 0.02], '#2b2f33', 'z', 20); t.quad(0.36, 0.36, [0, 2.8, 0.042], atlasUv('clock')) })
  // 소화기함 + 표지
  const extinguisher = () => {
    k.box(0.44, 0.74, 0.1, [0, 0.62, 0.05], C.extRed)
    t.quad(0.42, 0.72, [0, 0.62, 0.102], atlasUv('extCab'))
    k.box(0.32, 0.42, 0.01, [0, 1.36, 0.005], '#e9e9e4')
    t.quad(0.3, 0.4, [0, 1.36, 0.012], atlasUv('extSign'))
  }
  on(LOW['extinguisher-north'], extinguisher)
  on(LOW['extinguisher-east'], extinguisher)
  // 게시판(코르크, 읽을 수 없는 종이)
  on(LOW.bulletin, () => { k.box(1.5, 0.94, 0.03, [0, 1.62, 0.015], C.cork); t.quad(1.46, 0.9, [0, 1.62, 0.032], atlasUv('cork')) })
  // 일반 안전 표지
  const sign = (cell: 'goggles' | 'tidy' | 'safety') => () => t.quad(0.4, 0.5, [0, 1.85, 0.012], atlasUv(cell))
  on(LOW['sign-goggles'], sign('goggles'))
  on(LOW['sign-tidy'], sign('tidy'))
  on(LOW['sign-safety'], sign('safety'))
  // 전선관(밝은 회색)과 공기 배관(푸른 회색): 2.0 m 위 벽을 따라. 내려오는 관은 콘센트·공기 꼭지까지
  const top = 3.28
  N((mz.xMin + mz.xMax) / 2, () => {
    const len = mz.xMax - mz.xMin
    k.cyl(0.022, len, [0, top, 0.03], C.conduit, 'x', 8)
    k.cyl(0.03, len, [0, top - 0.11, 0.04], C.air, 'x', 8)
  })
  for (const s of [LOW['outlet-west'], LOW['outlet-mid']]) on(s, () => { k.cyl(0.018, top - 1.35, [0, (top + 1.35) / 2, 0.03], C.conduit, 'y', 6); k.box(0.12, 0.18, 0.06, [0, 1.25, 0.03], C.box) })
  on(LOW['air-tap'], () => {
    k.cyl(0.024, top - 0.11 - 1.45, [0, (top - 0.11 + 1.45) / 2, 0.04], C.air, 'y', 6)
    k.box(0.09, 0.16, 0.09, [0, 1.42, 0.045], '#6c7e8a')
    k.cyl(0.035, 0.14, [0, 1.25, 0.06], '#a9b3b8', 'y', 8)
  })
  const pipeEnd = LOW.shutter.at - LOW.shutter.w / 2 - 0.3
  E((mz.zMin + pipeEnd) / 2, () => {
    const len = pipeEnd - mz.zMin
    k.cyl(0.022, len, [0, top, 0.03], C.conduit, 'x', 8)
    k.cyl(0.03, len, [0, top - 0.11, 0.04], C.air, 'x', 8)
  })
  // 분전반(감전 주의 세모 — 글 없음)
  on(LOW.breaker, () => {
    k.box(0.6, 0.8, 0.1, [0, 1.55, 0.05], '#c2c5c2')
    t.quad(0.56, 0.76, [0, 1.55, 0.102], atlasUv('breaker'))
    t.quad(0.16, 0.14, [0.12, 1.75, 0.104], atlasUv('shock'))
    k.cyl(0.03, top - 1.95, [0, (top + 1.95) / 2, 0.03], C.conduit, 'y', 6)
  })
}
