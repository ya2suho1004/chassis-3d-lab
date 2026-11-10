// 기록 창(설계 docs/superpowers/specs/2026-11-10-record-window-design.md)의 규칙을 한곳에 둔다:
// 어느 단계가 기록 단계인지, 칸·이름·칸이 열리는 때·복원 값·칸 표시·다시 보기 조건·빠진 칸 문구·창 크기·창 안 스크롤.
// 칸 목록은 엔진 정의(responseItemsOf)를 그대로 쓴다. 화면 상태만 다루고 수행 기록은 바꾸지 않는다.
import { answerFeedbackAllowed } from '../domain/feedbackPolicy'
import { responseItemsOf, type TaskRun } from '../domain/taskEngine'
import type { ApprovedTask } from '../domain/types'

/** 완료 조건별 버튼·창 이름(§2) */
const RECORD_LABEL: Record<string, string> = {
  axleWeightRead: '축중 기록',
  readingsSubmitted: '좌·우 제동력 기록',
  answersSubmitted: '계산·판정 기록',
  anglesRead: '조향각 기록',
  radiusSubmitted: '반경·판정 기록',
}

const stepById = (task: ApprovedTask, stepId: string) => task.steps.find((s) => s.stepId === stepId)

/** 기록 단계의 칸. 기록 단계가 아니면 빈 배열 */
export function recordItems(task: ApprovedTask, stepId: string): readonly string[] {
  const st = stepById(task, stepId)
  return st ? responseItemsOf(st) : []
}

/** 기록 단계면 버튼·창 이름, 아니면 null */
export function recordLabel(task: ApprovedTask, stepId: string): string | null {
  const st = stepById(task, stepId)
  if (!st || responseItemsOf(st).length === 0) return null
  return RECORD_LABEL[st.completionCondition] ?? '기록'
}

/** 칸이 속한 기록 단계 */
export function recordStepOf(task: ApprovedTask, itemId: string): string | null {
  return task.steps.find((s) => responseItemsOf(s).includes(itemId))?.stepId ?? null
}

/** 칸이 열렸는가(§2): 그 단계의 선행 단계가 모두 끝났을 때. 제동력 좌·우는 최대값이 고정된 뒤(hold)에만 */
export function itemOpen(run: TaskRun, itemId: string, hold: boolean): boolean {
  const stepId = recordStepOf(run.task, itemId)
  const st = stepId ? stepById(run.task, stepId) : undefined
  if (!st || !st.prerequisites.every((p) => run.completedSteps.includes(p))) return false
  return itemId === 'left' || itemId === 'right' ? hold : true
}

/** 제출한 최종 답으로 칸을 다시 채운다(§7). 숫자 칸은 finalInput, 판정은 finalAnswer. 제출하지 않은 칸은 넣지 않는다 */
export function restoreInputs(run: TaskRun): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of run.responses.items) {
    const v = i.finalAnswer ?? i.finalInput
    if (v !== null) out[i.itemId] = v
  }
  return out
}

/** 칸 옆 표시(§3.2). 정오를 보여 줄 수 없으면(안내 없음, 최초 답이 다 모이기 전) 제출한 칸에 '저장'만 */
export function markFor(run: TaskRun, itemId: string): { text: string; cls: string } {
  const i = run.responses.items.find((x) => x.itemId === itemId)
  if (!i || (i.finalInput === null && i.finalAnswer === null)) return { text: '', cls: '' }
  if (!answerFeedbackAllowed(run)) return { text: '저장', cls: '' }
  if (i.finalCorrect === true) return { text: '✓', cls: 'ok' }
  if (i.finalCorrect === false) return { text: '✗', cls: 'bad' }
  return { text: '', cls: '' }
}

/** 측정 당시 눈금 다시 보기(§5): 직진 복귀 뒤, 정오를 보여 줄 수 있고, 조향각 최종 답이 하나라도 오답일 때만 */
export function canReviewDial(run: TaskRun): boolean {
  if (!run.completedSteps.includes('return') || !answerFeedbackAllowed(run)) return false
  return run.responses.items.some((i) => (i.itemId === 'leftAngle' || i.itemId === 'rightAngle') && i.finalCorrect === false)
}

/** 단계를 끝내려는데 칸이 비었을 때(§3.2). 적어 두고 입력을 누르지 않았으면 그것을 알린다 */
export function missingText(label: string, typed: boolean): string {
  return typed ? `${label} 칸 옆 입력을 눌러야 저장됩니다.` : `${label} 입력이 필요합니다.`
}

/** 창 위치·최대 높이(§8): 보이는 화면(visualViewport)을 따른다. 없으면 innerHeight */
export function recordWindowBox(vv: { height: number; offsetTop: number } | null, innerHeight: number): { top: number; maxHeight: number } {
  // 160px 하한: 보이는 높이가 아주 작거나 0이어도 창이 사라지지 않게 한다. 키보드를 띄운 폰 가로처럼 보이는 높이가 176px보다 작으면 창이 화면 아래로 조금 넘친다(받아들인 한계)
  const height = vv ? vv.height : innerHeight
  return { top: Math.round((vv ? vv.offsetTop : 0) + 8), maxHeight: Math.max(160, Math.round(height - 16)) }
}

/** 창 안 스크롤 양(§8): 줄이 창 안(body)에 다 보이게 scrollTop에 더할 값. 줄이 창보다 크면 줄의 위를 맞춘다 */
export function scrollDelta(body: { top: number; bottom: number }, row: { top: number; bottom: number }, margin = 8): number {
  if (row.top < body.top + margin) return row.top - body.top - margin
  if (row.bottom > body.bottom - margin) return Math.min(row.bottom - body.bottom + margin, row.top - body.top - margin)
  return 0
}
