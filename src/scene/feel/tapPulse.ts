// src/scene/feel/tapPulse.ts
// 누름 고리의 계산(설계 2026-11-12 §4.3): 장비나 교관을 누르면 그 바닥에서 흰 고리가 0.3초 퍼졌다 사라진다. "눌렸다"까지만 알린다.
// 이 파일은 아무것도 들여오지 않는다.

/** 고리가 퍼지는 시간(초) */
export const TAP_RING_SECONDS = 0.3
/** 교관을 눌렀을 때의 고리 반지름(m) */
export const NPC_TAP_RADIUS = 0.5

/** 고리 자리: 가운데(x, z)와 반지름(m) */
export interface TapSpot { x: number; z: number; r: number }
/** 누름 한 번. seq는 누를 때마다 하나씩 오른다 */
export interface TapPulse extends TapSpot { seq: number }

/** 누른 장비의 고리 자리: 장비 자리가 가운데, 바닥 네모의 대각선 절반이 반지름. 대각선은 장비를 어느 쪽으로 돌려 놓아도 같아서 회전 값을 쓰지 않는다 */
export function tapSpotOf(e: { x: number; z: number; w: number; d: number }): TapSpot {
  return { x: e.x, z: e.z, r: Math.hypot(e.w, e.d) / 2 }
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

/** 고리 하나의 진행: 마지막으로 본 누름 번호와 시작 시각(쉬는 중이면 null) */
export interface RingRun { seen: number; startedAt: number | null }

/**
 * 고리 부품이 장면에 붙을 때의 진행. 그때의 번호는 이미 지난 누름으로 친다 —
 * 화면을 바꿨다 돌아오거나 품질을 바꿔 장면이 다시 붙어도, 누르지 않은 고리가 다시 뜨지 않는다.
 */
export function ringRunFrom(pulse: TapPulse | null): RingRun {
  return { seen: pulse?.seq ?? 0, startedAt: null }
}

/**
 * 한 화면만큼 나아간다. run을 고쳐 쓴다(화면마다 새 객체를 만들지 않는다).
 * 본 적 없는 번호면 지금부터 퍼지기 시작한다. 돌려주는 값은 진행(0 이상 1 미만)이고, 쉬는 중이면 null이다.
 */
export function advanceRing(run: RingRun, pulse: TapPulse | null, now: number): number | null {
  if (pulse && pulse.seq !== run.seen) { run.seen = pulse.seq; run.startedAt = now }
  if (run.startedAt === null) return null
  const k = (now - run.startedAt) / TAP_RING_SECONDS
  if (k >= 1) { run.startedAt = null; return null }
  return k
}
