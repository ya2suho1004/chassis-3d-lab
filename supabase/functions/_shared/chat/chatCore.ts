// AI 교관 챗봇 요청 처리 본체(설계 07 §4) — Deno 함수와 Node 시험이 같이 쓴다. 저장소·모델 호출·시계는 deps로 받는다.
// 순서: 요청 검사 → 세션 활성·챗봇 켜짐 → 학생·세션 하루 한도 → 개인정보 가림 → 시스템 프롬프트(측정값 없음) → 모델 호출(429면 1회 재시도) → 대화 기록 저장 → 답변
// 판정·채점은 하지 않는다. 가명 코드·기록 ID·세션 코드는 AI 회사로 보내지 않는다.
import { maskPersonalInfo } from './mask.ts'
import { buildSystemPrompt, PROMPT_VERSION, type TaskContext } from './prompt.ts'
import type { ChatTurn, ModelCall, ModelResult } from './providers.ts'

export const CHAT_PROTOCOL = 'chat-1'
export const QUESTION_MAX_CHARS = 300
export const ANSWER_HISTORY_MAX_CHARS = 2000
export const HISTORY_MAX_TURNS = 3
export const REQUEST_MAX_BYTES = 16 * 1024
export const MAX_OUTPUT_TOKENS = 400
export const RETRY_MAX_WAIT_MS = 3000
export const REFUSAL_FALLBACK = '그 질문에는 답할 수 없어요. 제동력 측정 방법이나 안전수칙에 대해 물어봐 주세요.'

const CODE_RE = /^[A-Za-z0-9_-]{1,32}$/
const STEP_RE = /^[A-Za-z][A-Za-z0-9_:-]{0,63}$/
const MODES = new Set(['guided', 'unguided', 'timedAssessment'])

export interface ChatRequest {
  protocolVersion: string
  sessionCode: string
  anonymousStudentCode: string
  recordId: string | null
  stepId: string | null
  difficultyMode: 'guided' | 'unguided' | 'timedAssessment'
  question: string
  history: ChatTurn[]
  turnIndex: number
}

export interface SessionSettings { active: boolean; chatbotEnabled: boolean; capPerStudent: number; dailyCap: number }

export interface ChatLogRow {
  record_id: string | null; session_code: string; anonymous_student_code: string; difficulty_mode: string; step_id: string | null; turn_index: number
  question_masked: string; answer: string | null; masked_patterns: string[]; provider: string; model: string; model_version: string | null; prompt_version: string
  latency_ms: number | null; status: 'answered' | 'refused' | 'error'
}

export interface ChatDeps {
  getSession(sessionCode: string): Promise<SessionSettings | null>
  /** 오늘(한국 시각) 해당 세션의 answered·refused 건수. studentCode가 있으면 그 학생만. */
  countToday(sessionCode: string, studentCode: string | null, sinceIso: string): Promise<number>
  insertLog(row: ChatLogRow): Promise<string | null>
  model(): { provider: string; model: string; apiKey: string }
  callModel(call: ModelCall): Promise<ModelResult>
  now(): number
  sleep(ms: number): Promise<void>
  context: TaskContext
}

export type ChatResponse =
  | { protocolVersion: string; ok: true; answer: string; remaining: number; logged: boolean; chatId: string | null; masked: string[]; refused: boolean }
  | { protocolVersion: string; ok: false; code: 'INVALID_REQUEST' | 'CHAT_DISABLED' | 'LIMIT_STUDENT' | 'LIMIT_SESSION' | 'UPSTREAM_BUSY' | 'UPSTREAM_ERROR'; retryable: boolean; remaining?: number }

const fail = (code: Extract<ChatResponse, { ok: false }>['code'], retryable: boolean, remaining?: number): ChatResponse =>
  (remaining === undefined ? { protocolVersion: CHAT_PROTOCOL, ok: false, code, retryable } : { protocolVersion: CHAT_PROTOCOL, ok: false, code, retryable, remaining })

/** 한국 시각(UTC+9) 오늘 0시의 UTC ISO */
export function startOfTodayKstIso(nowMs: number): string {
  const kst = nowMs + 9 * 3600_000
  const dayStartKst = Math.floor(kst / 86_400_000) * 86_400_000
  return new Date(dayStartKst - 9 * 3600_000).toISOString()
}

export function parseChatRequest(contentType: string | null, body: string): ChatRequest | null {
  if (typeof contentType !== 'string' || contentType.split(';')[0]!.trim().toLowerCase() !== 'text/plain') return null
  if (!body || new TextEncoder().encode(body).length > REQUEST_MAX_BYTES) return null
  let v: any
  try { v = JSON.parse(body) } catch { return null }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const keys = ['protocolVersion', 'sessionCode', 'anonymousStudentCode', 'recordId', 'stepId', 'difficultyMode', 'question', 'history', 'turnIndex']
  if (Object.keys(v).some((k) => !keys.includes(k))) return null
  if (v.protocolVersion !== CHAT_PROTOCOL) return null
  if (typeof v.sessionCode !== 'string' || !CODE_RE.test(v.sessionCode)) return null
  if (typeof v.anonymousStudentCode !== 'string' || !CODE_RE.test(v.anonymousStudentCode)) return null
  if (!(v.recordId === null || (typeof v.recordId === 'string' && v.recordId.length > 0 && v.recordId.length <= 64))) return null
  if (!(v.stepId === null || (typeof v.stepId === 'string' && STEP_RE.test(v.stepId)))) return null
  if (typeof v.difficultyMode !== 'string' || !MODES.has(v.difficultyMode)) return null
  if (typeof v.question !== 'string') return null
  const question = v.question.trim()
  if (question.length < 1 || question.length > QUESTION_MAX_CHARS) return null
  if (!Array.isArray(v.history) || v.history.length > HISTORY_MAX_TURNS) return null
  for (const t of v.history) {
    if (!t || typeof t !== 'object' || typeof t.q !== 'string' || typeof t.a !== 'string') return null
    if (Object.keys(t).length !== 2 || t.q.length > QUESTION_MAX_CHARS || t.a.length > ANSWER_HISTORY_MAX_CHARS) return null
  }
  if (!Number.isInteger(v.turnIndex) || v.turnIndex < 0 || v.turnIndex > 10000) return null
  return { ...v, question, history: v.history.map((t: ChatTurn) => ({ q: t.q, a: t.a })) }
}

export async function handleChat(contentType: string | null, body: string, deps: ChatDeps): Promise<ChatResponse> {
  const req = parseChatRequest(contentType, body)
  if (!req) return fail('INVALID_REQUEST', false)

  const s = await deps.getSession(req.sessionCode)
  if (!s || !s.active || !s.chatbotEnabled) return fail('CHAT_DISABLED', false)

  const since = startOfTodayKstIso(deps.now())
  const mine = await deps.countToday(req.sessionCode, req.anonymousStudentCode, since)
  if (mine >= s.capPerStudent) return fail('LIMIT_STUDENT', false, 0)
  const all = await deps.countToday(req.sessionCode, null, since)
  if (all >= s.dailyCap) return fail('LIMIT_SESSION', false, Math.max(0, s.capPerStudent - mine))

  const q = maskPersonalInfo(req.question)
  const history = req.history.map((t) => ({ q: maskPersonalInfo(t.q).text, a: t.a }))
  const mode = req.difficultyMode === 'guided' ? 'guided' : 'unguided' // 평가(시간제한) 단계도 정답 금지 쪽으로 다룬다
  const system = buildSystemPrompt(deps.context, { mode, stepId: req.stepId })
  const m = deps.model()
  const call: ModelCall = { provider: m.provider, model: m.model, apiKey: m.apiKey, system, history, question: q.text, maxOutputTokens: MAX_OUTPUT_TOKENS }

  const t0 = deps.now()
  let res = await deps.callModel(call).catch((): ModelResult => ({ ok: false, status: 0, error: 'NETWORK' }))
  if (!res.ok && res.status === 429 && (res.retryAfterMs ?? 1000) <= RETRY_MAX_WAIT_MS) {
    await deps.sleep(res.retryAfterMs ?? 1000)
    res = await deps.callModel(call).catch((): ModelResult => ({ ok: false, status: 0, error: 'NETWORK' }))
  }
  const latency = deps.now() - t0
  const base = {
    record_id: req.recordId, session_code: req.sessionCode, anonymous_student_code: req.anonymousStudentCode, difficulty_mode: req.difficultyMode, step_id: req.stepId,
    turn_index: req.turnIndex, question_masked: q.text, masked_patterns: q.masked, provider: m.provider, model: m.model, prompt_version: PROMPT_VERSION, latency_ms: latency,
  }
  if (!res.ok) {
    await deps.insertLog({ ...base, answer: null, model_version: null, status: 'error' }).catch(() => null)
    return fail(res.status === 429 ? 'UPSTREAM_BUSY' : 'UPSTREAM_ERROR', true, Math.max(0, s.capPerStudent - mine))
  }
  const refused = !res.text
  const answer = res.text || REFUSAL_FALLBACK
  const chatId = await deps.insertLog({ ...base, answer, model_version: res.modelVersion ?? null, status: refused ? 'refused' : 'answered' }).catch(() => null)
  return { protocolVersion: CHAT_PROTOCOL, ok: true, answer, remaining: Math.max(0, s.capPerStudent - mine - 1), logged: chatId !== null, chatId, masked: q.masked, refused }
}
