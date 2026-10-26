// NPC 검사 — 최종 수행 검사
// 원칙(docs/design/docs/02 §6, 04 §5.3): 완료 절차·현재 안전 조건·최종 응답을 검사한다.
// 차량 판정(vehicleVerdict)이나 학생 최초 정오(judgmentCorrect)와 다른 결과이며, 이전 오류·안전 위반을 지우지 않는다.
// 불량 차량을 정확히 판정하거나 최초 오답을 보완해 최종 정답이면 통과할 수 있다.
import { EVENT_LIMIT, appendEvent, type TaskRun } from './taskEngine'

export type InspectionIssue =
  | { kind: 'step'; stepId: string; reasonCode: 'STEP_NOT_COMPLETED' }
  | { kind: 'response'; itemId: string; reasonCode: 'UNANSWERED' | 'FINAL_INCORRECT' | 'NOT_EVALUABLE' }
  | { kind: 'safety'; conditionId: string; reasonCode: 'SAFETY_NOT_SATISFIED' }

export interface InspectionResult {
  /** 검사 횟수와 npcInspected 사건이 함께 기록됐는지. false면 이벤트 한도라 둘 다 올리지 않음 */
  recorded: boolean
  run: TaskRun
  result: 'passed' | 'needsCorrection'
  issues: InspectionIssue[]
}

export function inspectPerformance(run: TaskRun): InspectionResult {
  const issues: InspectionIssue[] = []
  for (const st of run.task.steps) {
    if (!run.completedSteps.includes(st.stepId)) issues.push({ kind: 'step', stepId: st.stepId, reasonCode: 'STEP_NOT_COMPLETED' })
  }
  // 측정 중 상태(모터 켜짐)로 끝낼 수 없다
  if (run.motorOn) issues.push({ kind: 'safety', conditionId: 's-exit', reasonCode: 'SAFETY_NOT_SATISFIED' })
  for (const it of run.responses.items) {
    const answered = it.firstInput !== null || it.firstAnswer !== null
    if (!answered) issues.push({ kind: 'response', itemId: it.itemId, reasonCode: 'UNANSWERED' })
    else if (it.finalCorrect === null) issues.push({ kind: 'response', itemId: it.itemId, reasonCode: 'NOT_EVALUABLE' })
    else if (it.finalCorrect === false) issues.push({ kind: 'response', itemId: it.itemId, reasonCode: 'FINAL_INCORRECT' })
  }
  const result = issues.length === 0 ? 'passed' : 'needsCorrection'
  // 횟수와 사건은 함께 확정한다: 이벤트 한도면 둘 다 올리지 않는다(recorded=false, Codex B3-b)
  if (run.eventLimitReached || run.events.length >= EVENT_LIMIT) return { run, result, issues, recorded: false }
  const counted = { ...run, npcInspectionCount: run.npcInspectionCount + 1 }
  const withEvent = appendEvent(counted, { type: 'npcInspected', reasonCode: result === 'passed' ? 'PASSED' : 'NEEDS_CORRECTION' })
  return { run: withEvent.run, result, issues, recorded: withEvent.ok }
}
