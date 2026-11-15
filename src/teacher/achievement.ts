// 교사 화면 학생별 성취 표 — 순수 계산(설계 docs/superpowers/specs/2026-11-15-class-records-design.md §3-4)
// 서버 기록 행(listAllServerRecords) → 표의 줄. 한 줄 = 학생(학번) × 과제(과제 판). 값은 가장 최근에 끝낸 수행, 펼치면 모든 수행(날짜순).
// 이 앱에서 '완료'는 교관 검사 통과 뒤에만 되므로 검사 칸에 몇 번째에 통과했는지를 함께 보인다. 정답 값·안전 위반·힌트·AI 질문 수는 넣지 않는다.
// 표에는 마치거나 중단해 서버에 들어온 수행만 나온다(명단이 없어 '안 한 학생'은 세지 못함).
import type { ServerRecordRow } from './serverAdmin'

export interface TaskRef { taskId: string; taskDefinitionVersion: string; title: string }

export interface AchievementAttempt {
  recordId: string
  completedAt: string
  /** 서버 접수 시각(서버 시계) — 기기 시계로 적힌 completedAt과 다를 수 있다. 수업 시간과 맞춰 보는 데 쓴다 */
  acceptedAt: string
  completion: '완료' | '중단'
  inspection: string
  errorCount: number
  duration: string
}

export interface AchievementRow {
  /** 학번|과제 판 */
  key: string
  studentCode: string
  /** 학번 첫째 자리(학번 형식이 아니면 빈 글) */
  grade: string
  /** 학번 둘째 자리 */
  classNo: string
  /** 과제 판(taskDefinitionVersion) — 과제 거르기 값 */
  taskKey: string
  taskLabel: string
  latest: AchievementAttempt
  /** 모든 수행(끝낸 시각 순) */
  attempts: AchievementAttempt[]
  /** 수행 횟수 = 서버 기록 건수 */
  count: number
  /** 가장 최근 서버 접수 시각 */
  lastAcceptedAt: string
}

export interface Achievement {
  rows: AchievementRow[]
  /** 원본(payload_json)을 읽지 못해 건너뛴 행 수 */
  skipped: number
  grades: string[]
  classes: string[]
  tasks: Array<{ key: string; label: string }>
}

const TASK_SHORT: Record<string, string> = { 'braking-force': '제동력', 'min-turning-radius': '최소회전반경' }

/** 과제 이름(짧게): '제동력 사례 1'. 모르는 판이면 과제와 판을 그대로 */
export function taskLabel(taskId: string, version: string, tasks: TaskRef[]): string {
  const t = tasks.find((x) => x.taskDefinitionVersion === version && x.taskId === taskId)
  if (!t) return `${taskId} (${version})`
  const tail = t.title.split(' — ')[1]
  return TASK_SHORT[taskId] && tail ? `${TASK_SHORT[taskId]} ${tail}` : t.title
}

/** 검사 칸: 통과(n번째) / 통과 못함(n번 받음) / 검사 안 받음 */
export function inspectionText(result: string, count: number): string {
  if (result === 'passed') return `통과(${count}번째)`
  if (count <= 0) return '검사 안 받음'
  return `통과 못함(${count}번 받음)`
}

/** 걸린 시간 분:초(멈춘 시간은 기록의 durationSeconds에서 이미 빠져 있다) */
export function durationText(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '—'
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface Parsed { recordId: string; code: string; taskId: string; version: string; completedAt: string; status: 'completed' | 'aborted'; npc: string; npcCount: number; errors: number; secs: number; acceptedAt: string }

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parseRow(r: ServerRecordRow): Parsed | null {
  let p: unknown
  try { p = JSON.parse(r.payload_json) } catch { return null }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null
  const o = p as Record<string, unknown>
  const v = o.versions as Record<string, unknown> | undefined
  if (!isStr(o.anonymousStudentCode) || !isStr(o.taskId) || !v || typeof v !== 'object' || !isStr(v.taskDefinitionVersion)) return null
  if (o.completionStatus !== 'completed' && o.completionStatus !== 'aborted') return null
  if (!isStr(o.completedAt) || Number.isNaN(Date.parse(o.completedAt))) return null
  if (!isStr(o.npcInspectionResult) || !isNum(o.npcInspectionCount) || !isNum(o.errorCount) || !isNum(o.durationSeconds)) return null
  return {
    recordId: isStr(o.recordId) ? o.recordId : r.record_id, code: o.anonymousStudentCode, taskId: o.taskId, version: v.taskDefinitionVersion, completedAt: o.completedAt,
    status: o.completionStatus, npc: o.npcInspectionResult, npcCount: o.npcInspectionCount, errors: o.errorCount, secs: o.durationSeconds, acceptedAt: r.accepted_at ?? '',
  }
}

const byTime = (a: Parsed, b: Parsed) => Date.parse(a.completedAt) - Date.parse(b.completedAt) || a.acceptedAt.localeCompare(b.acceptedAt) || a.recordId.localeCompare(b.recordId)
const attemptOf = (p: Parsed): AchievementAttempt => ({ recordId: p.recordId, completedAt: p.completedAt, acceptedAt: p.acceptedAt, completion: p.status === 'completed' ? '완료' : '중단', inspection: inspectionText(p.npc, p.npcCount), errorCount: p.errors, duration: durationText(p.secs) })
const STUDENT_NUMBER = /^[1-3][1-9](0[1-9]|[1-9]\d)$/

export function buildAchievement(rows: ServerRecordRow[], tasks: TaskRef[]): Achievement {
  let skipped = 0
  const groups = new Map<string, Parsed[]>()
  for (const r of rows) {
    const p = parseRow(r)
    if (!p) { skipped++; continue }
    const key = `${p.code}|${p.version}`
    const g = groups.get(key)
    if (g) g.push(p); else groups.set(key, [p])
  }
  const order = (version: string) => { const i = tasks.findIndex((t) => t.taskDefinitionVersion === version); return i < 0 ? tasks.length : i }
  const out: AchievementRow[] = []
  for (const [key, list] of groups) {
    const sorted = [...list].sort(byTime)
    const first = sorted[0]!
    const sn = STUDENT_NUMBER.test(first.code)
    out.push({
      key, studentCode: first.code, grade: sn ? first.code[0]! : '', classNo: sn ? first.code[1]! : '', taskKey: first.version, taskLabel: taskLabel(first.taskId, first.version, tasks),
      latest: attemptOf(sorted[sorted.length - 1]!), attempts: sorted.map(attemptOf), count: sorted.length,
      lastAcceptedAt: sorted.map((x) => x.acceptedAt).reduce((a, b) => (Date.parse(b) > Date.parse(a) || Number.isNaN(Date.parse(a)) ? b : a)),
    })
  }
  out.sort((a, b) => a.studentCode.localeCompare(b.studentCode) || order(a.taskKey) - order(b.taskKey) || a.taskKey.localeCompare(b.taskKey))
  const uniq = (xs: string[]) => [...new Set(xs.filter((x) => x !== ''))].sort()
  const taskKeys = [...new Set(out.map((r) => r.taskKey))].sort((a, b) => order(a) - order(b) || a.localeCompare(b))
  return {
    rows: out, skipped,
    grades: uniq(out.map((r) => r.grade)), classes: uniq(out.map((r) => r.classNo)),
    tasks: taskKeys.map((k) => ({ key: k, label: out.find((r) => r.taskKey === k)!.taskLabel })),
  }
}

/** 학년·반·과제로 거른다(값이 없으면 그 조건은 보지 않음) */
export function filterAchievement(rows: AchievementRow[], f: { grade?: string | null; classNo?: string | null; taskKey?: string | null }): AchievementRow[] {
  return rows.filter((r) => (!f.grade || r.grade === f.grade) && (!f.classNo || r.classNo === f.classNo) && (!f.taskKey || r.taskKey === f.taskKey))
}

/** 시각(한국 시각, 월/일 시:분). 읽지 못하면 — */
export function whenText(iso: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return '—'
  const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`
}
