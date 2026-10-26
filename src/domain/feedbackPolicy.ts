// 피드백 노출 정책 — task.feedbackPolicy (docs/design/docs/13 §8, 16 §2)
// 안내 모드: 정답 관련 피드백 즉시. 무안내 모드: 필수 응답 6개의 최초 답이 모두 저장된 뒤에만 정답 관련 피드백.
// 안전 피드백은 모드와 관계없이 즉시. 이 정책은 교사 확인 0E(2026-10-26)로 승인(approved)됐으며 feedbackPolicyVersion에 고정해 기록한다.
import type { TaskRun } from './taskEngine'

const SAFETY_KEYS = new Set(['blocked_ppe', 'blocked_safety_lift', 'blocked_safety_motor', 'blocked_safety_accel', 'blocked_safety_exit'])

export function isSafetyFeedback(feedbackKey: string | null | undefined): boolean {
  return !!feedbackKey && SAFETY_KEYS.has(feedbackKey)
}

/** 정답 관련(판독·계산·판정) 피드백을 지금 보여 줘도 되는가 */
export function answerFeedbackAllowed(run: TaskRun): boolean {
  if (run.difficultyMode === 'guided') return true
  const policy = run.task.feedbackPolicy?.unguidedAnswerFeedback ?? 'afterAllFirstResponses'
  if (policy !== 'afterAllFirstResponses') return true
  return run.responses.items.every((i) => i.firstInput !== null || i.firstAnswer !== null)
}

export function isAnswerFeedbackKey(run: TaskRun, feedbackKey: string | null | undefined): boolean {
  if (!feedbackKey) return false
  const keys = run.task.feedbackPolicy?.answerFeedbackKeys ?? ['wrong_reading', 'wrong_calc', 'wrong_verdict']
  return keys.includes(feedbackKey)
}
