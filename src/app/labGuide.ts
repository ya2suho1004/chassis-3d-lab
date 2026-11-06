// 실습장 안내 규칙(Codex 교차 검토 2026-11-06 A1·A5)
import type { TaskRun } from '../domain/taskEngine'
import type { ApprovedTask } from '../domain/types'

/**
 * 3D에서 강조할 다음 단계 장비. 안내 있음일 때만 — 안내 없음은 최초 응답 전
 * 다음 단계를 자동으로 드러내지 않는다(task-vocabulary v1.2.0 unguided). 요청형 힌트는 따로.
 */
export function nextHighlightId(run: TaskRun | null): string | null {
  if (!run || run.difficultyMode !== 'guided' || !run.nextStepId) return null
  return run.task.steps.find((s) => s.stepId === run.nextStepId)?.equipmentId ?? null
}

/** AI 교관에 보낼 과제 — 과제 수령 전에도 시작 화면에서 고른 과제 기준으로 답하게 한다(없으면 서버가 제동력으로 본다) */
export function chatTaskId(task: ApprovedTask, run: TaskRun | null): 'min-turning-radius' | null {
  return (run?.task ?? task).taskId === 'min-turning-radius' ? 'min-turning-radius' : null
}

/**
 * 실습장 준비 화면은 멈춤을 막으려고 20초에 닫는다(LabScreen). 닫힌 뒤에도 자료를 받는 중이거나
 * 받지 못했으면 작은 표시로 알려 준다(Codex 교차 검토 2026-11-06 A4).
 */
export function loadBadge(s: { loadedOnce: boolean; active: boolean; progress: number; errorCount: number }): string | null {
  if (!s.loadedOnce) return null
  if (s.active) return `3D 자료를 아직 받는 중… ${Math.round(s.progress)}%`
  if (s.errorCount > 0) return '3D 자료 일부를 받지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침하거나, 메뉴(☰)에서 품질 낮음을 켜 보세요.'
  return null
}
