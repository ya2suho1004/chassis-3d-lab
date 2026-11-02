// 수업 세션 목록(설계 docs/superpowers/specs/2026-11-03-class-sessions-design.md) — src/data/session/sessions.json을 읽는다.
// 교사가 기기마다 '오늘 세션'을 고르고, 세션이 정한 차시·도움 방식은 학생이 바꿀 수 없다. 연구 세션은 IRB 승인 전 잠금(pending).
import data from '../data/session/sessions.json'
import type { UsagePhase } from '../domain/record'
import type { DifficultyMode } from '../domain/taskEngine'

export interface SessionDef {
  code: string
  condition: string
  kind: 'demo' | 'rehearsal' | 'research'
  label: string
  usagePhase: UsagePhase | null
  difficultyMode: Extract<DifficultyMode, 'guided' | 'unguided'> | null
  pending: boolean
}

export const SESSIONS = data.sessions as SessionDef[]
export const DEFAULT_SESSION_CODE = 'DEMO-ONLY'

export function sessionDef(code: string | null | undefined): SessionDef | null {
  return SESSIONS.find((s) => s.code === code) ?? null
}

/** 고를 수 있는 세션(연구 세션은 IRB 승인 뒤 pending을 풀어야 고를 수 있다) */
export function selectableSession(code: string | null | undefined): boolean {
  const s = sessionDef(code)
  return !!s && !s.pending
}

/** 세션이 차시·도움 방식을 정하면 그 값으로 덮는다(5차시 정리는 안내 없음 고정 규칙은 lessonMode가 따로 지킨다) */
export function applySessionRules<T extends { usagePhase: UsagePhase; difficultyMode: DifficultyMode }>(code: string, v: T): T {
  const s = sessionDef(code)
  if (!s) return v
  return { ...v, usagePhase: s.usagePhase ?? v.usagePhase, difficultyMode: s.difficultyMode ?? v.difficultyMode }
}
