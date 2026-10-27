// 교사 설정(기기별) — 수업 전에 사례·수업 시점·도움 방식·차량 진입 방향을 한 번 정해 두면 시작 화면의 기본값이 된다.
// ‘잠금’이면 학생은 익명 코드만 입력한다. 이 기기 localStorage에만 두며 전송하지 않는다. 개인정보 칸은 없다.
// 화면 PIN은 시연용이며 보안 통제가 아니다(설계 03 §7).
import type { UsagePhase } from '../domain/record'
import type { DifficultyMode } from '../domain/taskEngine'

export interface TeacherPreset {
  caseId: string
  usagePhase: UsagePhase
  difficultyMode: DifficultyMode
  vehicleEntryDirection: 'north' | 'south' | null
  /** true면 학생 시작 화면에서 바꿀 수 없음 */
  locked: boolean
}

export const PRESET_KEY = 'chassis.teacherPreset.v1'
/** 과제 사례 식별자(사례 ID가 없으면 빈 문자열 — 그런 과제는 고정 설정 대상이 아님) */
export const caseKey = (t: { measurement: { caseId: string | null } }) => t.measurement.caseId ?? ''
const PHASES: UsagePhase[] = ['preview', 'review', 'other']
const MODES: DifficultyMode[] = ['guided', 'unguided']

/** 저장된 값을 검사해 쓸 수 있으면 돌려준다. 모르는 사례·값이면 null(기본 화면으로) */
export function parsePreset(raw: string | null, knownCaseIds: string[]): TeacherPreset | null {
  if (!raw) return null
  let v: unknown
  try { v = JSON.parse(raw) } catch { return null }
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.caseId !== 'string' || !knownCaseIds.includes(o.caseId)) return null
  if (!PHASES.includes(o.usagePhase as UsagePhase)) return null
  if (!MODES.includes(o.difficultyMode as DifficultyMode)) return null
  if (!(o.vehicleEntryDirection === null || o.vehicleEntryDirection === 'north' || o.vehicleEntryDirection === 'south')) return null
  if (typeof o.locked !== 'boolean') return null
  return { caseId: o.caseId, usagePhase: o.usagePhase as UsagePhase, difficultyMode: o.difficultyMode as DifficultyMode, vehicleEntryDirection: o.vehicleEntryDirection, locked: o.locked }
}

export function loadPreset(knownCaseIds: string[]): TeacherPreset | null {
  try { return parsePreset(localStorage.getItem(PRESET_KEY), knownCaseIds) } catch { return null }
}

/** 저장 성공 여부를 돌려준다(사파리 개인 정보 보호 모드 등에서는 실패할 수 있음) */
export function savePreset(p: TeacherPreset | null): boolean {
  try {
    if (p) localStorage.setItem(PRESET_KEY, JSON.stringify(p))
    else localStorage.removeItem(PRESET_KEY)
    return true
  } catch { return false }
}

export const PHASE_LABEL: Record<UsagePhase, string> = { preview: '대기 중 예습', review: '실습 후 복습', other: '기타(시연·연습)' }
export const MODE_LABEL: Record<DifficultyMode, string> = { guided: '안내 있음(견습)', unguided: '안내 없음(정비사)', timedAssessment: '시간제한 평가(1차 비활성)' }
export const ENTRY_LABEL = (d: 'north' | 'south' | null) => (d === 'north' ? '북쪽 진입' : d === 'south' ? '남쪽 진입' : '진입 방향 미설정')
