// 걷기 속도 계산 — 출발·멈춤의 가속·감속, 경로 끝의 도착 감속, 걷기·서기 판정, 걷기 동작 재생 속도(설계 2026-11-13 캐릭터와 움직임 §6).
// 순수 함수만 둔다. 장면(LabScene Walker·Avatar)은 현재 속도를 ref로 들고 매 프레임 이 함수들을 부른다.
import type { Pt } from './layoutModel'

/** 최고 걷기 속도(m/s). 달리기·빠른 걸음은 없다(실습장 안전 수칙, 소요 시간 자료 — 설계 §2) */
export const WALK_SPEED = 1.6
/** 정지 → 최고 속도에 걸리는 시간(s) */
export const ACCEL_TIME = 0.25
/** 최고 속도 → 정지에 걸리는 시간(s). 출발보다 조금 짧게 — 멈추려는 뜻이 바로 보이게 */
export const DECEL_TIME = 0.2
/** 가속도·감속도(m/s²): 일정한 비율로 바뀐다(6.4, 8) */
export const WALK_ACCEL = WALK_SPEED / ACCEL_TIME
export const WALK_DECEL = WALK_SPEED / DECEL_TIME
/** 한 프레임에 반영하는 최대 시간(s) — 화면이 멈췄다 돌아와도 한 번에 크게 움직이지 않는다(예전 이동과 같음) */
export const MAX_STEP_DT = 0.1
/** 조이스틱 죽은 구간(입력 크기) */
export const STICK_DEADZONE = 0.15
/** 이만큼(m) 안이면 이미 도착한 것으로 본다(서 있는 자리를 다시 목적지로 누를 때) */
export const ARRIVE_EPS = 1e-3
/** 걷기 판정: 서 있다가 이 속도 이상이면 걷기, 걷다가 WALK_OFF_SPEED 밑이면 서기(두 값을 달리해 경계에서 떨지 않는다) */
export const WALK_ON_SPEED = 0.2
export const WALK_OFF_SPEED = 0.05
/** 걷기 동작 재생 속도의 아래 한계(최고 속도 재생의 배수). 이보다 느리면(약 0.7 주기/s, 걸음 1.4번/s — 사람이 천천히 걷는 가장 느린 박자 언저리) 발이 조금 미끄러지는 것보다 몸이 멈춘 듯 보이는 쪽이 더 어색하다 */
export const WALK_ANIM_MIN = 0.35

const clampDt = (dt: number) => Math.min(Math.max(dt, 0), MAX_STEP_DT)

/** 현재 속도를 목표 속도 쪽으로 일정 가속도(올릴 때)·감속도(내릴 때)로 옮긴다. 목표는 0~최고 속도로 자른다.
 *  reduced(모션 줄이기 설정)이면 바로 목표값 */
export function approachSpeed(cur: number, target: number, dt: number, reduced = false): number {
  const goal = Math.min(Math.max(target, 0), WALK_SPEED)
  if (reduced) return goal
  const h = clampDt(dt)
  return cur < goal ? Math.min(goal, cur + WALK_ACCEL * h) : Math.max(goal, cur - WALK_DECEL * h)
}

/** 조이스틱 입력 크기 → 목표 속도. 죽은 구간이면 0 */
export function stickTargetSpeed(mag: number): number {
  return mag > STICK_DEADZONE ? WALK_SPEED * Math.min(1, mag) : 0
}

/** 남은 거리 안에서 감속해 설 수 있는 가장 빠른 속도(v² = 2·a·d), 최고 속도까지 */
export function arrivalSpeed(remaining: number): number {
  return Math.min(WALK_SPEED, Math.sqrt(2 * WALK_DECEL * Math.max(0, remaining)))
}

/** 경로 이동 속도: 최고 속도로 가속하되 도착 감속 상한을 넘지 않는다. 상한을 바로 따르므로 목적지를 지나치지 않고,
 *  상한이 v² = 2·a·d 곡선이라 유한한 프레임 안에 닿는다(마지막 위치는 advanceAlongPath가 목적지에 맞춘다).
 *  reduced이면 예전처럼 최고 속도로 가다 즉시 선다 */
export function pathSpeed(cur: number, remaining: number, dt: number, reduced = false): number {
  if (reduced) return WALK_SPEED
  return Math.min(approachSpeed(cur, WALK_SPEED, dt), arrivalSpeed(remaining))
}

/** 경로의 남은 길이: 지금 자리 → path[index] → … → 끝 */
export function pathRemaining(pos: Pt, path: readonly Pt[], index: number): number {
  if (index >= path.length) return 0
  let sum = Math.hypot(path[index]!.x - pos.x, path[index]!.z - pos.z)
  for (let i = index + 1; i < path.length; i++) sum += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z)
  return sum
}

/** 남은 거리가 사실상 0이면 도착한 것 — 새 목적지를 받을 때 바로 끝낸다(남은 거리 0이면 도착 감속 속도도 0이라 경로가 끝나지 않는다) */
export function pathArrived(pos: Pt, path: readonly Pt[], index: number): boolean {
  return pathRemaining(pos, path, index) <= ARRIVE_EPS
}

/** 걷기·서기 판정(이력 있음) */
export function nextWalking(was: boolean, speed: number): boolean {
  return was ? speed >= WALK_OFF_SPEED : speed >= WALK_ON_SPEED
}

/** 걷기 동작 재생 속도: 현재 속도 / 한 주기에 나아가는 거리. 최고 속도에서 예전 고정값과 같고, 아래 한계는 WALK_ANIM_MIN */
export function walkPlayback(speed: number, cycleDistance: number): number {
  const v = Math.min(WALK_SPEED, Math.max(speed, WALK_ANIM_MIN * WALK_SPEED))
  return v / cycleDistance
}
