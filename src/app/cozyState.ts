// src/app/cozyState.ts — '따뜻한 정비 공방' 연출의 판단 로직(순수 함수). 컴포넌트는 이것만 쓴다.
import type { Effect } from './reactions'

/** 켜져 있는 연출: 이름 → 켠 차례 번호. 같은 연출을 다시 켜면 번호가 바뀌어 CSS 움직임을 처음부터 다시 건다 */
export type Fx = { on: Partial<Record<Effect, number>>; seq: number }
export const EMPTY_FX: Fx = { on: {}, seq: 0 }

/** 완료 단계 수가 '늘어날 때만' true. 같거나 줄면(되돌림·재마운트 0) false */
export function shouldPopOnDone(prevDone: number, nextDone: number): boolean {
  return nextDone > prevDone
}

/** 결과 화면 '의뢰 완료' 도장·교관 한마디 조건: 완료 상태 + 기록 생성 성공 + NPC 검사 통과 */
export function isRequestPassed(completionStatus: 'completed' | 'aborted', payload: { ok: true; value: { npcInspectionResult: string } } | { ok: false }): boolean {
  return completionStatus === 'completed' && payload.ok && payload.value.npcInspectionResult === 'passed'
}

/** 연출을 켠다(켤 것이 없으면 같은 객체를 돌려 불필요한 렌더 방지) */
export function addEffects(f: Fx, effects: readonly Effect[]): Fx {
  if (!effects.length) return f
  const seq = f.seq + 1
  const on = { ...f.on }
  for (const e of effects) on[e] = seq
  return { on, seq }
}

/** onAnimationEnd: 끝난 연출 하나만 끈다. 함께 켜진 다른 연출은 끝까지 간다(꺼져 있던 것이면 같은 객체) */
export function dropEffect(f: Fx, e: Effect): Fx {
  if (f.on[e] === undefined) return f
  const on = { ...f.on }
  delete on[e]
  return { on, seq: f.seq }
}

/** run이 null이 되면 연출 상태 초기화(이미 비어 있으면 같은 객체를 돌려 불필요한 렌더 방지) */
export function resetFxIfIdle(f: Fx): Fx {
  return Object.keys(f.on).length || f.seq ? EMPTY_FX : f
}

/** 검사 통과 뒤 결과 화면 전에 교관이 고개를 끄덕일지(설계 §4 대화창).
 *  기록 저장이 끝난 완료 + 교관 곁(대화에서 검사 받음) + 움직임 줄이기 아님일 때만. 저장 실패·중단은 바로 결과 화면 */
export function shouldNodBeforeResult(o: { status: 'completed' | 'aborted'; saveError: string | null; nearNpc: boolean; reducedMotion: boolean }): boolean {
  return o.status === 'completed' && o.saveError === null && o.nearNpc && !o.reducedMotion
}

/** 끄덕임 길이(초) — 두 번 숙였다 든다 */
export const NOD_SECONDS = 1.1
const NOD_MAX_RAD = 0.3

/** t초째 머리 숙임 각도(rad, 양수 = 숙임). 0~NOD_SECONDS 밖은 0 */
export function nodAngle(t: number): number {
  if (t <= 0 || t >= NOD_SECONDS) return 0
  return NOD_MAX_RAD * Math.sin((2 * Math.PI * t) / NOD_SECONDS) ** 2
}
