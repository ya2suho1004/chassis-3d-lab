// 오늘 과제 — 교사 설정(없으면 기본값)으로 학생이 할 과제·차시·도움 방식을 정한다(설계 2026-11-14-student-number-and-class-link §3-3).
// 시작 화면의 '오늘 과제' 줄과 이어 하기 화면의 비교 줄이 같은 규칙·같은 글을 쓰게 한곳에 둔다. 순수 계산.
import type { UsagePhase } from '../domain/record'
import type { DifficultyMode } from '../domain/taskEngine'
import type { ApprovedTask } from '../domain/types'
import { LESSON_SHORT, lessonMode } from './lesson'
import { DEFAULT_SESSION_CODE, applySessionRules } from './sessions'
import { caseKey, MODE_LABEL, type TeacherPreset } from './teacherPreset'

export interface TodayTask { sessionCode: string; task: ApprovedTask; usagePhase: UsagePhase; difficultyMode: DifficultyMode; vehicleEntryDirection: 'north' | 'south' | null }

/** 교사 설정이 없으면 기본값(시연 세션 · 첫 과제 · 1~2차시 연습 · 안내 있음 · 진입 방향 없음). 세션이 정한 차시·도움 방식이 먼저, 5차시는 안내 없음 */
export function todayTask(preset: TeacherPreset | null, tasks: ApprovedTask[]): TodayTask {
  const sessionCode = preset?.sessionCode ?? DEFAULT_SESSION_CODE
  const task = tasks[Math.max(0, preset ? tasks.findIndex((t) => caseKey(t) === preset.caseId) : 0)]!
  const fixed = applySessionRules(sessionCode, { usagePhase: preset?.usagePhase ?? 'preview', difficultyMode: preset?.difficultyMode ?? 'guided' })
  return { sessionCode, task, usagePhase: fixed.usagePhase, difficultyMode: lessonMode(fixed.usagePhase, fixed.difficultyMode), vehicleEntryDirection: preset?.vehicleEntryDirection ?? null }
}

/** '{과제} · {차시} · {도움 방식}' */
export const todayTaskText = (t: TodayTask) => `${t.task.title} · ${LESSON_SHORT[t.usagePhase]} · ${MODE_LABEL[t.difficultyMode]}`

/**
 * 이어 하기 화면: 이 기기의 교사 설정이 있고 세션·과제 사례·차시·도움 방식 가운데 하나라도 초안과 다르면 오늘 과제 줄을 준다.
 * 교사 설정이 없거나 같으면 null. 어느 쪽을 고르라고 권하지 않고 사실만 보인다.
 */
export function resumeTodayLine(draft: { sessionCode: string; caseId: string; usagePhase: UsagePhase; difficultyMode: DifficultyMode }, preset: TeacherPreset | null, tasks: ApprovedTask[]): string | null {
  if (!preset) return null
  const t = todayTask(preset, tasks)
  const same = t.sessionCode === draft.sessionCode && caseKey(t.task) === draft.caseId && t.usagePhase === draft.usagePhase && t.difficultyMode === draft.difficultyMode
  return same ? null : `오늘 과제(선생님이 정함) ${todayTaskText(t)}`
}
