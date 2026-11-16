// 수업 세션 목록(설계 docs/superpowers/specs/2026-11-03-class-sessions-design.md) — src/data/session/sessions.json을 읽는다.
// 교사가 기기마다 '오늘 세션'을 고르고, 세션이 정한 차시·도움 방식은 학생이 바꿀 수 없다. 연구 세션은 IRB 승인 전 잠금(pending).
import data from '../data/session/sessions.json'
import type { UsagePhase } from '../domain/record'
import type { DifficultyMode } from '../domain/taskEngine'

export interface SessionDef {
  code: string
  condition: string
  /** class: 실제 수업용(설계 2026-11-15-class-records) — 학번으로 들어오고 마치면 기록을 서버로 바로 보낸다. 연구 기록은 아니다(runPurpose=demo) */
  kind: 'demo' | 'class' | 'rehearsal' | 'research'
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

/** 수업용 세션인가(설계 2026-11-15-class-records §3-1) — 이 세션의 기록만 자동으로 서버에 보낸다 */
export function isClassSession(code: string | null | undefined): boolean {
  return sessionDef(code)?.kind === 'class'
}

/** 시연 세션인가 — 공개 주소로 구경 온 사람이 들어오는 곳이라, 학번이 없는 사람에게 '기록 없이 하기'를 알려 준다 */
export function isDemoSession(code: string | null | undefined): boolean {
  return sessionDef(code)?.kind === 'demo'
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
