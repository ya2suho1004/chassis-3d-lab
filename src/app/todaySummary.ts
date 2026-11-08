// C1(Codex 회의 2026-11-08): 교사 화면 '오늘 수업 설정' 한 장 요약 — 순수 계산.
// 이 기기 설정(저장본)과, 교사 로그인 때 이미 받은 서버 세션 정보만 쓴다(새 서버 조회·새 수집 없음).
import { caseKey, ENTRY_LABEL, MODE_LABEL, type TeacherPreset } from './teacherPreset'
import { LESSON_SHORT, lessonMode } from './lesson'
import { sessionDef } from './sessions'
import type { ApprovedTask } from '../domain/types'
import type { UsagePhase } from '../domain/record'
import type { SessionRow } from '../teacher/serverAdmin'

export interface SummaryRow { label: string; value: string; tone?: 'warn' }
export interface SummaryServer {
  /** 서버 주소가 설정된 판인지 */
  configured: boolean
  loggedIn: boolean
  /** 로그인 뒤 받은 세션 목록에서 찾은 행(undefined = 아직 모름, null = 목록에 없음) */
  session: SessionRow | null | undefined
}

const FLOW_PHASE: Record<SessionRow['lesson_flow'], UsagePhase> = { 'lesson1-2': 'preview', lesson5: 'review' }

const same = (a: TeacherPreset, b: TeacherPreset) =>
  a.sessionCode === b.sessionCode && a.caseId === b.caseId && a.usagePhase === b.usagePhase && a.difficultyMode === b.difficultyMode &&
  a.vehicleEntryDirection === b.vehicleEntryDirection && a.locked === b.locked

function aiText(server: SummaryServer): SummaryRow {
  if (!server.configured) return { label: 'AI 교관', value: '서버 주소 없음(이 판은 AI 교관을 쓰지 않음)' }
  if (!server.loggedIn) return { label: 'AI 교관', value: '교사 로그인하면 보임(② 수업 중)' }
  if (server.session === null) return { label: 'AI 교관', value: '서버에 이 세션이 없음', tone: 'warn' }
  if (server.session === undefined) return { label: 'AI 교관', value: '불러오는 중' }
  const s = server.session
  const base = s.chatbot_enabled ? `켜짐 · 학생 1인 하루 질문 ${s.chat_cap_per_student}회` : '꺼짐'
  return { label: 'AI 교관', value: s.active ? base : `${base} · 세션 비활성`, tone: s.active ? undefined : 'warn' }
}

export function todaySummary(o: {
  preset: TeacherPreset | null
  form: TeacherPreset
  tasks: ApprovedTask[]
  server: SummaryServer
  counts: { records: number; outbox: number } | null
}): { rows: SummaryRow[]; warnings: string[] } {
  const rows: SummaryRow[] = []
  const warnings: string[] = []
  const p = o.preset
  if (!p) {
    rows.push({ label: '설정', value: '저장된 설정 없음 — 학생이 시작 화면에서 직접 고름', tone: 'warn' })
  } else {
    const def = sessionDef(p.sessionCode)
    rows.push({ label: '세션', value: def ? `${p.sessionCode} · ${def.label}` : p.sessionCode })
    rows.push({ label: '과제 사례', value: o.tasks.find((t) => caseKey(t) === p.caseId)?.title ?? '알 수 없는 사례', tone: o.tasks.some((t) => caseKey(t) === p.caseId) ? undefined : 'warn' })
    rows.push({ label: '차시', value: LESSON_SHORT[p.usagePhase] })
    rows.push({ label: '도움 방식', value: MODE_LABEL[lessonMode(p.usagePhase, p.difficultyMode)] })
    rows.push({ label: '차량 진입', value: ENTRY_LABEL(p.vehicleEntryDirection) })
    rows.push(p.locked ? { label: '학생 변경', value: '막음 — 익명 코드만 입력' } : { label: '학생 변경', value: '허용 — 학생이 바꿀 수 있음', tone: 'warn' })
    if (!same(p, o.form)) warnings.push('아래에서 바꾼 설정이 아직 저장되지 않았습니다. ‘설정 저장’을 눌러야 학생 화면에 적용됩니다.')
    const flow = o.server.session?.lesson_flow
    if (flow && p.usagePhase !== 'other' && FLOW_PHASE[flow] !== p.usagePhase) {
      warnings.push(`서버의 이 세션은 ${LESSON_SHORT[FLOW_PHASE[flow]]}인데, 이 기기 차시는 ${LESSON_SHORT[p.usagePhase]}입니다.`)
    }
  }
  rows.push(aiText(o.server))
  rows.push(o.counts
    ? { label: '이 기기 기록', value: `확정 ${o.counts.records}건 · 전송 대기 ${o.counts.outbox}건`, tone: o.counts.outbox > 0 ? 'warn' : undefined }
    : { label: '이 기기 기록', value: '확인 중' })
  return { rows, warnings }
}
