// src/scene/feel/edgeArrow.ts
// 목적지 방향 화살표의 자리 계산(설계 2026-11-12 §4.5). 순수 계산이다 — 화면을 읽지 않는다.
// 목적지가 화면 밖이면 화살표가 화면 가장자리 안쪽 띠를 따라 그쪽에 선다. 상태 막대·의뢰 패널·작업 버튼처럼
// HUD 요소가 차지한 구간에는 서지 않고, 같은 변에서 가장 가까운 빈 자리로 밀려난다.

/** 화면 속 네모(px, 왼쪽 위가 0,0) */
export interface Box { x0: number; y0: number; x1: number; y1: number }
/** 화살표 자리(px)와 가리키는 방향(rad — 오른쪽이 0, 화면 아래쪽으로 돌면 +). 방향은 화면에서 본 방향이다(화면 비율이 들어간다) */
export interface ArrowPlace { x: number; y: number; angle: number }
/** 변 하나에서 HUD가 차지한 구간들(작은 쪽부터, 겹치는 것은 합쳐 둔다) */
export type Spans = ReadonlyArray<readonly [number, number]>
/** 화살표가 다니는 띠: 화면 크기와, 네 변에서 HUD가 차지한 구간 */
export interface ArrowTrack { w: number; h: number; left: Spans; right: Spans; top: Spans; bottom: Spans }

/** 목적지가 이 영역(화면의 가로 94%, 세로 90%) 안에 보이면 화살표를 내지 않는다 */
const VIEW_X = 0.94
const VIEW_Y = 0.9
/** 떠 있던 화살표는 목적지가 이만큼 더 안쪽으로 들어와야 거둔다 — 경계에 걸린 목적지에서 켜졌다 꺼졌다 하지 않게 */
const VIEW_KEEP = 0.03
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

/**
 * 변 위의 자리 v가 막힌 구간 안이면 가장 가까운 빈 끝으로 민다. 띠(min~max)를 벗어나는 끝은 쓰지 않고, 둘 다 못 쓰면 제자리.
 * was는 앞 화면에서 화살표가 섰던 자리다. 그 구간의 한쪽 끝에 서 있었으면 그쪽에 머물고, 반대쪽 끝이 ARROW_PAD보다 더 가까워져야 옮긴다 —
 * 화면 가운데에 놓인 요소(장비 정보 카드 등)를 피할 때, 목적지가 한가운데를 지나는 순간 양 끝 사이를 오가며 튀지 않게.
 */
function slide(v: number, spans: Spans, min: number, max: number, was?: number): number {
  for (const [a, b] of spans) {
    if (v <= a || v >= b) continue
    const before = a >= min, after = b <= max
    if (before && after) {
      const da = v - a, db = b - v
      if (was !== undefined && Math.abs(was - a) < 0.5) return db + ARROW_PAD < da ? b : a
      if (was !== undefined && Math.abs(was - b) < 0.5) return da + ARROW_PAD < db ? a : b
      return da <= db ? a : b
    }
    if (before) return a
    if (after) return b
    return v
  }
  return v
}

/**
 * 매 화면: 목적지의 화면 좌표(−1~1, three의 project 결과)와 카메라 뒤 여부로 화살표 자리를 정한다.
 * 목적지가 화면 가운데 영역 안에 보이면 null(화살표 없음).
 * prev는 앞 화면의 결과다(화살표가 없었으면 null). 이어받아서 경계에서 깜빡이거나 가운데 구간의 양 끝을 오가지 않게 한다.
 * 화살표가 서는 변이 바뀌는 대각선 방향(모서리 쪽)에서는 자리가 한 번 건너뛸 수 있다 — 두 변이 모두 막힌 모서리에서 그렇다.
 */
export function placeEdgeArrow(p: { nx: number; ny: number; behind: boolean }, track: ArrowTrack, prev: ArrowPlace | null = null): ArrowPlace | null {
  // 목적지가 카메라 평면에 걸리면 투영 좌표가 숫자가 아니거나 끝없이 커진다
  if (!Number.isFinite(p.nx) || !Number.isFinite(p.ny)) return null
  // 카메라 뒤에 있으면 투영 좌표가 뒤집혀 나온다
  let nx = p.behind ? -p.nx : p.nx
  let ny = p.behind ? -p.ny : p.ny
  const keep = prev ? VIEW_KEEP : 0
  if (!p.behind && Math.abs(nx) < VIEW_X - keep && Math.abs(ny) < VIEW_Y - keep) return null
  // 카메라 바로 뒤라 방향을 정할 수 없으면 아래쪽으로 둔다(화살표가 이리저리 튀지 않게)
  if (p.behind && Math.hypot(nx, ny) < 1e-3) { nx = 0; ny = -1 }
  const kx = Math.abs(nx) / TRACK_X, ky = Math.abs(ny) / TRACK_Y
  const m = Math.max(kx, ky)
  let x = ((nx / m) * 0.5 + 0.5) * track.w
  let y = (-(ny / m) * 0.5 + 0.5) * track.h
  if (kx >= ky) y = slide(y, nx < 0 ? track.left : track.right, lo(track.h, TRACK_Y), hi(track.h, TRACK_Y), prev?.y)
  else x = slide(x, ny > 0 ? track.top : track.bottom, lo(track.w, TRACK_X), hi(track.w, TRACK_X), prev?.x)
  // 방향은 화면(px)에서 본 방향: 좌표를 화면 크기만큼 늘려서 잰다. 그러지 않으면 가로로 긴 화면에서 화살표가 선 쪽과 가리키는 쪽이 어긋난다
  return { x, y, angle: Math.atan2(-ny * track.h, nx * track.w) }
}
