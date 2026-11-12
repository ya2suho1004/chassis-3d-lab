// src/scene/feel/tapPulse.ts
// 누름 고리의 계산(설계 2026-11-12 §4.3): 장비나 교관을 누르면 그 바닥에서 흰 고리가 0.3초 퍼졌다 사라진다. "눌렸다"까지만 알린다.
import { footprintOf } from '../layoutModel'

/** 고리가 퍼지는 시간(초) */
export const TAP_RING_SECONDS = 0.3
/** 교관을 눌렀을 때의 고리 반지름(m) */
export const NPC_TAP_RADIUS = 0.5

/** 고리 자리: 가운데(x, z)와 반지름(m) */
export interface TapSpot { x: number; z: number; r: number }
/** 누름 한 번. seq는 누를 때마다 하나씩 오른다 */
export interface TapPulse extends TapSpot { seq: number }

/** 누른 장비의 고리 자리: 장비 자리가 가운데, 바닥 둘레의 대각선 절반이 반지름 */
export function tapSpotOf(e: { x: number; z: number; w: number; d: number; rotation: number }): TapSpot {
  const f = footprintOf(e)
  return { x: e.x, z: e.z, r: Math.hypot(f.xMax - f.xMin, f.zMax - f.zMin) / 2 }
}

/** 진행 k(0~1)에서의 고리: 반지름은 0.9배에서 1.2배로 퍼지고, 불투명도는 0.8에서 0으로 간다 */
export function ringAt(r: number, k: number): { radius: number; opacity: number } {
  const c = Math.min(1, Math.max(0, k))
  return { radius: r * (0.9 + 0.3 * c), opacity: 0.8 * (1 - c) }
}

/** 새 누름: 앞 번호 + 1(같은 자리를 다시 눌러도 고리가 다시 퍼지게) */
export function nextPulse(prev: TapPulse | null, at: TapSpot): TapPulse {
  return { ...at, seq: (prev?.seq ?? 0) + 1 }
}
