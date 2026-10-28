// 5차시 모형(설계 07 §6, 변경 기록 20 D4) — 차시 선택이 수업 시점·도움 방식·수행 역할을 정한다.
// preview = 실제 실습 전 시뮬레이션(1~2차시), review = 실제 실습 후 시뮬레이션(5차시), other = 그 밖의 보조 사용(3~4차시·시연)
import type { SessionContext, UsagePhase } from '../domain/record'
import type { DifficultyMode } from '../domain/taskEngine'

export const LESSON_LABEL: Record<UsagePhase, string> = {
  preview: '1~2차시 연습 — 실제 실습 전, 안내를 받으며 익힘',
  review: '5차시 정리 — 실제 실습 후, 안내 없이 혼자 수행·판독',
  other: '그 밖의 사용 — 3~4차시 보조·시연',
}

/** 5차시는 무안내로 고정한다. 나머지는 고른 도움 방식을 쓴다(시간제한 평가는 1차 비활성). */
export function lessonMode(phase: UsagePhase, chosen: DifficultyMode): DifficultyMode {
  if (phase === 'review') return 'unguided'
  return chosen === 'timedAssessment' ? 'guided' : chosen
}

/** 5차시 = 주수행, 1~2차시·보조 = 연습(2차시 끝의 무안내 1회 시도도 연습으로 남김) */
export function lessonAttemptRole(phase: UsagePhase): SessionContext['attemptRole'] {
  return phase === 'review' ? 'primary' : 'practice'
}
