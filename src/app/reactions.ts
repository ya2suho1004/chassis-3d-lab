// src/app/reactions.ts
// 손맛 반응 규칙(설계 2026-11-06 §5). 이미 일어난 일에 대한 반응만 다룬다 — 다음 단계를 가리키는 연출은 없다.
// 그래서 안내 있음·안내 없음에서 결과가 같다(§2-3). 움직임 줄이기면 움직이는 연출을 뺀다(§2-6).
import type { DifficultyMode } from '../domain/taskEngine'

export type ReactionEvent = 'stepDone' | 'steerLimit' | 'ppeOn' | 'inspectionPassed'
export type Effect = 'checkPop' | 'tick' | 'sparkle' | 'stamp' | 'confetti'

export function reactionsFor(ev: ReactionEvent, o: { mode: DifficultyMode; reducedMotion: boolean; sound: boolean }): Effect[] {
  void o.mode // 모드는 일부러 쓰지 않는다(시험이 같음을 확인)
  switch (ev) {
    case 'stepDone': return o.reducedMotion ? [] : ['checkPop']
    case 'steerLimit': return [...(o.sound ? ['tick'] : []), ...(o.reducedMotion ? [] : ['checkPop'])] as Effect[] // 핸들이 조작 한계에 닿은 소리 — 정답 각도 신호 아님
    case 'ppeOn': return o.reducedMotion ? [] : ['sparkle']
    case 'inspectionPassed': return o.reducedMotion ? ['stamp'] : ['stamp', 'confetti']
  }
}

/** 새로 끝난 단계 하나 → 사건(LabScreen의 newCue 결과에 붙인다) */
export function reactionEventForStep(stepId: string): ReactionEvent {
  if (stepId === 'ppe') return 'ppeOn'
  if (stepId === 'steer') return 'steerLimit'
  return 'stepDone'
}

/** 브라우저의 움직임 줄이기 설정 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
