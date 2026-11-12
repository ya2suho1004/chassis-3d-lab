// src/scene/feel/edgeArrow.ts
// 목적지 방향 화살표의 자리 계산(설계 2026-11-12 §4.5). 순수 계산이다 — 화면을 읽지 않는다.
// 목적지가 화면 밖이면 화살표가 화면 가장자리 안쪽 띠를 따라 그쪽에 선다. 상태 막대·의뢰 패널·작업 버튼처럼
// HUD 요소가 차지한 구간에는 서지 않고, 같은 변에서 가장 가까운 빈 자리로 밀려난다.

/** 화면 속 네모(px, 왼쪽 위가 0,0) */
export interface Box { x0: number; y0: number; x1: number; y1: number }
/** 화살표 자리(px)와 가리키는 방향(rad — 오른쪽이 0, 화면 아래쪽으로 돌면 +) */
export interface ArrowPlace { x: number; y: number; angle: number }
/** 변 하나에서 HUD가 차지한 구간들(작은 쪽부터, 겹치는 것은 합쳐 둔다) */
export type Spans = ReadonlyArray<readonly [number, number]>
/** 화살표가 다니는 띠: 화면 크기와, 네 변에서 HUD가 차지한 구간 */
export interface ArrowTrack { w: number; h: number; left: Spans; right: Spans; top: Spans; bottom: Spans }

/** 목적지가 이 영역(화면의 가로 94%, 세로 90%) 안에 보이면 화살표를 내지 않는다 */
const VIEW_X = 0.94
const VIEW_Y = 0.9
/** 띠의 자리: 가장자리에서 가로 5%, 세로 11% 안쪽. 세로를 더 들인 까닭: 아래 안내 막대 위에 여유를 두어, 막대 글자가 바뀔 때마다 화살표가 좌우로 밀리지 않게 */
const TRACK_X = 0.9
const TRACK_Y = 0.78
/** 화살표 반지름 22px에 여유 8px — HUD 요소에서 이만큼 떨어져 선다 */
export const ARROW_PAD = 30

const lo = (size: number, track: number): number => (size * (1 - track)) / 2
const hi = (size: number, track: number): number => (size * (1 + track)) / 2

/** 한 변에 걸친 네모들의 구간을 모아 합친다. line: 변의 자리, side: 변에 수직인 쪽의 범위를 꺼내는 법, along: 변을 따라가는 쪽 */
function spansOn(line: number, blocked: readonly Box[], side: (b: Box) => [number, number], along: (b: Box) => [number, number]): Spans {
  const found: Array<[number, number]> = []
  for (const b of blocked) {
    const [s0, s1] = side(b)
    if (line < s0 - ARROW_PAD || line > s1 + ARROW_PAD) continue
    const [a0, a1] = along(b)
    found.push([a0 - ARROW_PAD, a1 + ARROW_PAD])
  }
  found.sort((p, q) => p[0] - q[0])
  const merged: Array<[number, number]> = []
  for (const s of found) {
    const last = merged[merged.length - 1]
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1])
    else merged.push(s)
  }
  return merged
}

/** 화면 크기와 HUD 네모들로 띠를 만든다. 화면 크기나 HUD가 바뀔 때만 부른다(매 화면마다 부르지 않는다) */
export function buildTrack(view: { w: number; h: number }, blocked: readonly Box[]): ArrowTrack {
  const xs = (b: Box): [number, number] => [b.x0, b.x1]
  const ys = (b: Box): [number, number] => [b.y0, b.y1]
  return {
    w: view.w,
    h: view.h,
    left: spansOn(lo(view.w, TRACK_X), blocked, xs, ys),
    right: spansOn(hi(view.w, TRACK_X), blocked, xs, ys),
    top: spansOn(lo(view.h, TRACK_Y), blocked, ys, xs),
    bottom: spansOn(hi(view.h, TRACK_Y), blocked, ys, xs),
  }
}

/** 변 위의 자리 v가 막힌 구간 안이면 가장 가까운 빈 끝으로 민다. 띠(min~max)를 벗어나는 끝은 쓰지 않고, 둘 다 못 쓰면 제자리 */
function slide(v: number, spans: Spans, min: number, max: number): number {
  for (const [a, b] of spans) {
    if (v <= a || v >= b) continue
    const before = a >= min, after = b <= max
    if (before && after) return v - a <= b - v ? a : b
    if (before) return a
    if (after) return b
    return v
  }
  return v
}

/**
 * 매 화면: 목적지의 화면 좌표(−1~1, three의 project 결과)와 카메라 뒤 여부로 화살표 자리를 정한다.
 * 목적지가 화면 가운데 영역 안에 보이면 null(화살표 없음).
 */
export function placeEdgeArrow(p: { nx: number; ny: number; behind: boolean }, track: ArrowTrack): ArrowPlace | null {
  // 카메라 뒤에 있으면 투영 좌표가 뒤집혀 나온다
  let nx = p.behind ? -p.nx : p.nx
  let ny = p.behind ? -p.ny : p.ny
  if (!p.behind && Math.abs(nx) < VIEW_X && Math.abs(ny) < VIEW_Y) return null
  // 카메라 바로 뒤라 방향을 정할 수 없으면 아래쪽으로 둔다(화살표가 이리저리 튀지 않게)
  if (p.behind && Math.hypot(nx, ny) < 1e-3) { nx = 0; ny = -1 }
  const kx = Math.abs(nx) / TRACK_X, ky = Math.abs(ny) / TRACK_Y
  const m = Math.max(kx, ky)
  let x = ((nx / m) * 0.5 + 0.5) * track.w
  let y = (-(ny / m) * 0.5 + 0.5) * track.h
  if (kx >= ky) y = slide(y, nx < 0 ? track.left : track.right, lo(track.h, TRACK_Y), hi(track.h, TRACK_Y))
  else x = slide(x, ny > 0 ? track.top : track.bottom, lo(track.w, TRACK_X), hi(track.w, TRACK_X))
  return { x, y, angle: Math.atan2(-ny, nx) }
}
