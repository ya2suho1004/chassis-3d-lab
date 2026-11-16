// AI 정리 요청 처리 본체(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2-1~2-3) — chat 함수가 protocolVersion 'debrief-1'일 때 부른다.
// Deno 함수와 Node 시험이 같이 쓴다. 저장소·모델 호출·시계는 deps로 받는다(대화 본체 chatCore와 같은 방식).
// 순서: 요청 검사(허용 목록) → 세션 활성·AI 켜짐 → 같은 수행의 저장된 정리 재사용 → 학생·세션 하루 한도(정리 행만) → 요약 글(서버가 만듦) →
//       모델 호출(429면 1회 재시도, 대화와 같음) → 답 검사 → 기록 → 응답
// 판정·채점은 하지 않는다. 학번·수행 번호·세션 코드는 기록·한도·재사용에만 쓰고 AI 회사로 보내지 않는다.
import { startOfTodayKstIso, RETRY_MAX_WAIT_MS, classifyFinish, type ChatLogRow, type SessionSettings } from './chatCore.ts'
import { buildDebriefSummary, buildDebriefSystemPrompt, DEBRIEF_PROMPT_VERSION, type DebriefContext, type DebriefFacts, type DebriefTaskId } from './debriefPrompt.ts'
import type { TaskContext } from './prompt.ts'
import type { ModelCall, ModelResult } from './providers.ts'

export const DEBRIEF_PROTOCOL = 'debrief-1'
/** 학생 하루 정리 횟수(상수). 세션 하루 한도는 세션의 chat_daily_cap을 정리 행에만 적용한다 */
export const DEBRIEF_CAP_PER_STUDENT = 10
export const DEBRIEF_REQUEST_MAX_BYTES = 16 * 1024
/** 세 묶음 × 3문장이 들어갈 만큼(한글은 글자당 토큰이 많다). 넘쳐 끊기면 JSON이 깨져 DEBRIEF_INVALID */
export const DEBRIEF_MAX_OUTPUT_TOKENS = 800
export const DEBRIEF_LINES_MAX = 3
export const DEBRIEF_LINE_MAX_CHARS = 120
export const DEBRIEF_COUNT_MAX = 999
export const DEBRIEF_DURATION_MAX_SECONDS = 86_400
/** 검사에서 걸린 모델 원문을 기록에 남길 때의 최대 길이 */
const RAW_LOG_MAX_CHARS = 4000

const CODE_RE = /^[A-Za-z0-9_-]{1,32}$/
const MODES = new Set(['guided', 'unguided', 'timedAssessment'])
const REQUEST_KEYS = ['protocolVersion', 'sessionCode', 'anonymousStudentCode', 'recordId', 'taskId', 'difficultyMode', 'facts']
const FACT_KEYS = ['items', 'errorTypes', 'safetyViolationTypes', 'hintCount', 'npcInspectionCount', 'durationSeconds']
const GROUP_KEYS = ['good', 'improve', 'hard'] as const

export interface DebriefNotes { good: string[]; improve: string[]; hard: string[] }

export interface DebriefRequest {
  protocolVersion: string
  sessionCode: string
  anonymousStudentCode: string
  recordId: string
  taskId: DebriefTaskId
  difficultyMode: 'guided' | 'unguided' | 'timedAssessment'
  facts: DebriefFacts
}

export interface DebriefDeps {
  getSession(sessionCode: string): Promise<SessionSettings | null>
  /** 같은 세션·학번·수행 번호의 저장된 정리(status answered, 정리 행) 중 가장 늦은 것 */
  findDebrief(sessionCode: string, studentCode: string, recordId: string): Promise<{ chatId: string | null; answer: string } | null>
  /** 오늘(한국 시각) 해당 세션의 정리 행 수(상태와 관계없이 — 모델을 부른 것은 모두 센다). studentCode가 있으면 그 학생만 */
  countDebriefToday(sessionCode: string, studentCode: string | null, sinceIso: string): Promise<number>
  insertLog(row: ChatLogRow): Promise<string | null>
  model(): { provider: string; model: string; apiKey: string }
  callModel(call: ModelCall): Promise<ModelResult>
  now(): number
  sleep(ms: number): Promise<void>
  context: TaskContext
  labels: DebriefContext
}

export type DebriefErrorCode = 'INVALID_REQUEST' | 'CHAT_DISABLED' | 'LIMIT_STUDENT' | 'LIMIT_SESSION' | 'UPSTREAM_BUSY' | 'UPSTREAM_ERROR' | 'DEBRIEF_INVALID'
export type DebriefResponse =
  | { protocolVersion: string; ok: true; notes: DebriefNotes; logged: boolean; chatId: string | null; reused: boolean }
  | { protocolVersion: string; ok: false; code: DebriefErrorCode; retryable: boolean }

const fail = (code: DebriefErrorCode, retryable: boolean): DebriefResponse => ({ protocolVersion: DEBRIEF_PROTOCOL, ok: false, code, retryable })

/** 본문이 정리 요청인가(갈래 나누기). JSON이 아니거나 protocolVersion이 다르면 대화로 간다(지금 그대로) */
export function isDebriefBody(body: string): boolean {
  try {
    const v = JSON.parse(body)
    return !!v && typeof v === 'object' && !Array.isArray(v) && v.protocolVersion === DEBRIEF_PROTOCOL
  } catch {
    return false
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= DEBRIEF_COUNT_MAX
const isOx = (v: unknown): v is boolean | null => v === true || v === false || v === null

/** 키는 허용 목록에서만, 값은 0~999 정수 */
function countsOk(v: unknown, allowed: Record<string, string>): v is Record<string, number> {
  if (!isPlainObject(v)) return false
  return Object.entries(v).every(([k, n]) => Object.prototype.hasOwnProperty.call(allowed, k) && isCount(n))
}

/** 요청 검사: 모르는 키 거부, 항목은 그 과제의 응답 항목과 정확히 같은 묶음, 오류·안전 키는 알려진 키만, 횟수는 0~999 정수. 자유 글은 받지 않는다 */
export function parseDebriefRequest(contentType: string | null, body: string, labels: DebriefContext): DebriefRequest | null {
  if (typeof contentType !== 'string' || contentType.split(';')[0]!.trim().toLowerCase() !== 'text/plain') return null
  if (!body || new TextEncoder().encode(body).length > DEBRIEF_REQUEST_MAX_BYTES) return null
  let v: any
  try { v = JSON.parse(body) } catch { return null }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  if (Object.keys(v).some((k) => !REQUEST_KEYS.includes(k))) return null
  if (v.protocolVersion !== DEBRIEF_PROTOCOL) return null
  if (typeof v.sessionCode !== 'string' || !CODE_RE.test(v.sessionCode)) return null
  if (typeof v.anonymousStudentCode !== 'string' || !CODE_RE.test(v.anonymousStudentCode)) return null
  if (typeof v.recordId !== 'string' || v.recordId.length < 1 || v.recordId.length > 64) return null
  if (typeof v.taskId !== 'string' || !Object.prototype.hasOwnProperty.call(labels.tasks, v.taskId)) return null
  if (typeof v.difficultyMode !== 'string' || !MODES.has(v.difficultyMode)) return null
  if (!isPlainObject(v.facts)) return null
  const f: any = v.facts
  if (Object.keys(f).length !== FACT_KEYS.length || Object.keys(f).some((k) => !FACT_KEYS.includes(k))) return null
  const want = labels.tasks[v.taskId]!.items.map((i) => i.itemId)
  if (!Array.isArray(f.items) || f.items.length !== want.length) return null
  const seen = new Set<string>()
  for (const it of f.items as unknown[]) {
    if (!isPlainObject(it) || Object.keys(it).length !== 3 || typeof it.itemId !== 'string' || !isOx(it.first) || !isOx(it.final)) return null
    if (!want.includes(it.itemId) || seen.has(it.itemId)) return null
    seen.add(it.itemId)
  }
  if (!countsOk(f.errorTypes, labels.errorLabels) || !countsOk(f.safetyViolationTypes, labels.safetyLabels)) return null
  if (!isCount(f.hintCount) || !isCount(f.npcInspectionCount)) return null
  if (!(f.durationSeconds === null || (Number.isInteger(f.durationSeconds) && f.durationSeconds >= 0 && f.durationSeconds <= DEBRIEF_DURATION_MAX_SECONDS))) return null
  const items = (f.items as Array<{ itemId: string; first: boolean | null; final: boolean | null }>).map((i) => ({ itemId: i.itemId, first: i.first, final: i.final }))
  return {
    protocolVersion: DEBRIEF_PROTOCOL, sessionCode: v.sessionCode, anonymousStudentCode: v.anonymousStudentCode, recordId: v.recordId, taskId: v.taskId, difficultyMode: v.difficultyMode,
    facts: { items, errorTypes: { ...f.errorTypes }, safetyViolationTypes: { ...f.safetyViolationTypes }, hintCount: f.hintCount, npcInspectionCount: f.npcInspectionCount, durationSeconds: f.durationSeconds },
  }
}

/** 숫자 조각(정수·소수). 1,000 같은 자리 쉼표는 쓰지 않는 글이라 따로 다루지 않는다 */
const numbersIn = (s: string): string[] => s.match(/\d+(?:\.\d+)?/g) ?? []

/** 코드 표시(```json … ```)를 벗긴다 */
function stripFence(text: string): string {
  const t = text.trim()
  const m = t.match(/^```[A-Za-z]*\s*\n?([\s\S]*?)\n?```$/)
  return (m ? m[1]! : t).trim()
}

/**
 * 답 검사(설계 2-3 ⑥): JSON 하나, good·improve·hard가 문자열 목록, 묶음마다 3문장(목록 칸) 이하, 문장마다 120자 이하,
 * "양호"·"불량" 없음, 답의 숫자는 모두 allowedSource(지시문 + 요약)에 있는 숫자. 빈 문장은 버리고 앞뒤 공백은 다듬는다.
 */
export function checkDebriefAnswer(text: string, allowedSource: string): { ok: true; notes: DebriefNotes } | { ok: false; reason: string } {
  let v: unknown
  try { v = JSON.parse(stripFence(text)) } catch { return { ok: false, reason: 'JSON이 아님' } }
  if (!isPlainObject(v)) return { ok: false, reason: 'JSON 객체가 아님' }
  const keys = Object.keys(v)
  if (keys.length !== GROUP_KEYS.length || GROUP_KEYS.some((k) => !keys.includes(k))) return { ok: false, reason: `묶음이 good·improve·hard가 아님(${keys.join(',')})` }
  const allowed = new Set(numbersIn(allowedSource))
  const notes: DebriefNotes = { good: [], improve: [], hard: [] }
  for (const k of GROUP_KEYS) {
    const list = v[k]
    if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) return { ok: false, reason: `${k}가 문자열 목록이 아님` }
    const lines = (list as string[]).map((x) => x.trim()).filter((x) => x.length > 0)
    if (lines.length > DEBRIEF_LINES_MAX) return { ok: false, reason: `${k} 문장 ${lines.length}개` }
    for (const l of lines) {
      if (l.length > DEBRIEF_LINE_MAX_CHARS) return { ok: false, reason: `${k} 문장 ${l.length}자` }
      if (/양호|불량/.test(l)) return { ok: false, reason: `${k}에 양호·불량` }
      const stray = numbersIn(l).filter((n) => !allowed.has(n))
      if (stray.length) return { ok: false, reason: `${k}에 없는 숫자 ${stray.join(',')}` }
    }
    notes[k] = lines
  }
  return { ok: true, notes }
}

/** 저장된 정리 글(answer 열)을 읽는다. 모양이 맞지 않으면 null(새로 쓴다) */
function storedNotes(answer: string): DebriefNotes | null {
  let v: unknown
  try { v = JSON.parse(answer) } catch { return null }
  if (!isPlainObject(v)) return null
  const out: DebriefNotes = { good: [], improve: [], hard: [] }
  for (const k of GROUP_KEYS) {
    const list = v[k]
    if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) return null
    out[k] = list as string[]
  }
  return out
}

export async function handleDebrief(contentType: string | null, body: string, deps: DebriefDeps): Promise<DebriefResponse> {
  const req = parseDebriefRequest(contentType, body, deps.labels)
  if (!req) return fail('INVALID_REQUEST', false)

  const s = await deps.getSession(req.sessionCode)
  if (!s || !s.active || !s.chatbotEnabled) return fail('CHAT_DISABLED', false)

  // 같은 수행에 이미 쓴 정리가 있으면 그 글을 그대로(모델을 부르지 않고 한도에도 세지 않는다). 찾지 못하면 새로 쓴다
  const stored = await deps.findDebrief(req.sessionCode, req.anonymousStudentCode, req.recordId).catch(() => null)
  const reusedNotes = stored ? storedNotes(stored.answer) : null
  if (stored && reusedNotes) return { protocolVersion: DEBRIEF_PROTOCOL, ok: true, notes: reusedNotes, logged: true, chatId: stored.chatId, reused: true }

  const since = startOfTodayKstIso(deps.now())
  const mine = await deps.countDebriefToday(req.sessionCode, req.anonymousStudentCode, since)
  if (mine >= DEBRIEF_CAP_PER_STUDENT) return fail('LIMIT_STUDENT', false)
  const all = await deps.countDebriefToday(req.sessionCode, null, since)
  if (all >= s.dailyCap) return fail('LIMIT_SESSION', false)

  const system = buildDebriefSystemPrompt(deps.context, req.taskId)
  const summary = buildDebriefSummary(deps.labels, req)
  const m = deps.model()
  const call: ModelCall = { provider: m.provider, model: m.model, apiKey: m.apiKey, system, history: [], question: summary, maxOutputTokens: DEBRIEF_MAX_OUTPUT_TOKENS }

  const t0 = deps.now()
  let res = await deps.callModel(call).catch((): ModelResult => ({ ok: false, status: 0, error: 'NETWORK' }))
  if (!res.ok && res.status === 429 && (res.retryAfterMs ?? 1000) <= RETRY_MAX_WAIT_MS) {
    await deps.sleep(res.retryAfterMs ?? 1000)
    res = await deps.callModel(call).catch((): ModelResult => ({ ok: false, status: 0, error: 'NETWORK' }))
  }
  const latency = deps.now() - t0
  const base = {
    record_id: req.recordId, session_code: req.sessionCode, anonymous_student_code: req.anonymousStudentCode, difficulty_mode: req.difficultyMode, step_id: null,
    turn_index: 0, question_masked: summary, masked_patterns: [], provider: m.provider, model: m.model, prompt_version: DEBRIEF_PROMPT_VERSION, latency_ms: latency,
  }
  if (!res.ok) {
    await deps.insertLog({ ...base, answer: null, model_version: null, status: 'error' }).catch(() => null)
    return fail(res.status === 429 ? 'UPSTREAM_BUSY' : 'UPSTREAM_ERROR', true)
  }
  // 막히거나 끊긴 답은 고쳐 쓰지 않고 버린다(화면은 규칙 정리)
  const checked = classifyFinish(res.finishReason) === 'complete' && res.text
    ? checkDebriefAnswer(res.text, `${system}\n${summary}`)
    : { ok: false as const, reason: `끝난 이유 ${res.finishReason ?? '없음'}` }
  if (!checked.ok) {
    await deps.insertLog({ ...base, answer: res.text ? res.text.slice(0, RAW_LOG_MAX_CHARS) : null, model_version: res.modelVersion ?? null, status: 'error' }).catch(() => null)
    return fail('DEBRIEF_INVALID', false)
  }
  const chatId = await deps.insertLog({ ...base, answer: JSON.stringify(checked.notes), model_version: res.modelVersion ?? null, status: 'answered' }).catch(() => null)
  return { protocolVersion: DEBRIEF_PROTOCOL, ok: true, notes: checked.notes, logged: chatId !== null, chatId, reused: false }
}
