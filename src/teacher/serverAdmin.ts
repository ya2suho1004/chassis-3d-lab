// 교사용 Supabase 연결(설계 07 §5) — 로그인(이메일+비밀번호)은 Supabase Auth, 조회·수정은 REST(RLS: 교사 명단에 있을 때만).
// 토큰은 메모리에만 둔다(공용 기기에 남기지 않음). 공개 키(anon)만 쓰고 비밀 키는 쓰지 않는다.
import type { ServerReceipt } from '../records/reconcile'

export interface ServerConfig { url: string; anonKey: string }
export interface TeacherAuth { accessToken: string; expiresAt: number; email: string }
export interface SessionRow { session_code: string; class_condition_code: string; lesson_flow: 'lesson1-2' | 'lesson5'; chatbot_enabled: boolean; chat_cap_per_student: number; chat_daily_cap: number; active: boolean }
export interface ChatLogRecord {
  chat_id: string; created_at: string; session_code: string; anonymous_student_code: string; record_id: string | null; difficulty_mode: string | null; step_id: string | null
  turn_index: number; status: string; question_masked: string; answer: string | null; masked_patterns: string[]; provider: string; model: string; model_version: string | null; prompt_version: string; latency_ms: number | null
}
export interface ServerRecordRow { record_id: string; receipt_id: string; accepted_at: string; payload_hash: string; payload_json: string; session_code: string; anonymous_student_code: string; run_purpose: string; schema_version: string }

export function getServerConfig(): ServerConfig | null {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
  return url && anonKey ? { url: url.replace(/\/$/, ''), anonKey } : null
}

export class ServerError extends Error { constructor(public code: string, public status: number) { super(code) } }

/** 교사 로그인이 살아 있는지. 서버 호출 없이 이 기기 원본을 여는 곳에서 쓴다(서버 호출은 만료되면 서버가 막는다) */
export const loginValid = (auth: TeacherAuth | null, now: number) => !!auth && auth.expiresAt > now

export async function signIn(cfg: ServerConfig, email: string, password: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<TeacherAuth> {
  const r = await fetchImpl(`${cfg.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const b: any = await r.json().catch(() => ({}))
  if (!r.ok || typeof b.access_token !== 'string') throw new ServerError(r.status === 400 ? 'LOGIN_FAILED' : 'LOGIN_ERROR', r.status)
  return { accessToken: b.access_token, expiresAt: now + Number(b.expires_in ?? 3600) * 1000, email: b.user?.email ?? email }
}

async function rest<T>(cfg: ServerConfig, auth: TeacherAuth, path: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<T> {
  const r = await fetchImpl(`${cfg.url}/rest/v1/${path}`, { ...init, headers: { apikey: cfg.anonKey, Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) } })
  const b: any = await r.json().catch(() => null)
  if (!r.ok) throw new ServerError(r.status === 401 || r.status === 403 ? 'NOT_TEACHER' : 'REST_ERROR', r.status)
  return b as T
}

export const isTeacher = async (cfg: ServerConfig, auth: TeacherAuth, f?: typeof fetch) => (await rest<unknown[]>(cfg, auth, 'teachers?select=user_id', {}, f)).length === 1
export const listSessions = (cfg: ServerConfig, auth: TeacherAuth, f?: typeof fetch) => rest<SessionRow[]>(cfg, auth, 'sessions?select=*&order=created_at.asc', {}, f)
export const updateSession = (cfg: ServerConfig, auth: TeacherAuth, code: string, patch: Partial<Pick<SessionRow, 'chatbot_enabled' | 'chat_cap_per_student' | 'chat_daily_cap' | 'active'>>, f?: typeof fetch) =>
  rest<SessionRow[]>(cfg, auth, `sessions?session_code=eq.${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }, f)
export const createSession = (cfg: ServerConfig, auth: TeacherAuth, row: Pick<SessionRow, 'session_code' | 'class_condition_code' | 'lesson_flow'>, f?: typeof fetch) =>
  rest<SessionRow[]>(cfg, auth, 'sessions', { method: 'POST', body: JSON.stringify({ ...row, chatbot_enabled: false }) }, f)
const READ_ATTEMPTS = 3
const MAX_PAGES = 100 // 쪽당 1000줄이면 10만 줄(한 세션에는 넉넉함). 접수가 끝없이 이어져도 요청을 멈추기 위한 상한

interface Listing { table: string; id: string; select: string; filter: string; order: string }
const idOf = (row: unknown, id: string) => String((row as Record<string, unknown>)[id])

/** 서버가 한 번에 주는 줄 수(max_rows 1000)에 기대지 않고 빈 응답이 올 때까지 이어 읽는다. 중간에 실패하면 일부만 돌려주지 않고 오류를 낸다. 줄이 겹치면(읽는 사이 앞쪽에 끼어듦) 또는 끝나지 않으면 null */
async function readPages<T>(cfg: ServerConfig, auth: TeacherAuth, path: string, id: string, f?: typeof fetch): Promise<T[] | null> {
  const all: T[] = []
  const seen = new Set<string>()
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await rest<T[]>(cfg, auth, `${path}&limit=1000&offset=${all.length}`, {}, f)
    if (page.length === 0) return all
    for (const row of page) {
      const key = idOf(row, id)
      if (seen.has(key)) return null
      seen.add(key)
      all.push(row)
    }
  }
  return null
}

/**
 * 표를 끝까지 읽고 번호 목록과 맞춰 본다(독립 검토 2번). 접수 시각은 저장 전에 정해져 늦게 저장된 줄이 앞쪽에 끼어들 수 있고,
 * 그러면 이어 읽는 쪽에서 줄이 겹치고 빠진다. 겹치거나 목록과 다르면 다시 읽고, 그래도 안 맞으면 일부를 돌려주지 않고 오류를 낸다.
 * order는 고유해야 한다. 돌려준 뒤에 들어온 접수는 당연히 포함되지 않는다.
 */
async function readAll<T>(cfg: ServerConfig, auth: TeacherAuth, l: Listing, f?: typeof fetch): Promise<T[]> {
  const path = (select: string) => `${l.table}?select=${select}&${l.filter}&order=${l.order}`
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
    const rows = await readPages<T>(cfg, auth, path(l.select), l.id, f)
    if (!rows) continue
    const check = await readPages<unknown>(cfg, auth, path(l.id), l.id, f)
    if (check && check.length === rows.length && check.every((c, i) => idOf(c, l.id) === idOf(rows[i], l.id))) return rows
  }
  throw new ServerError('READ_UNSTABLE', 0)
}
const sessionEq = (code: string) => `session_code=eq.${encodeURIComponent(code)}`
export const listChatLogs = (cfg: ServerConfig, auth: TeacherAuth, code: string, f?: typeof fetch) =>
  readAll<ChatLogRecord>(cfg, auth, { table: 'chat_logs', id: 'chat_id', select: '*', filter: sessionEq(code), order: 'created_at.asc,chat_id.asc' }, f)
/** 세션의 서버 기록 전부(B1·요약 CSV) */
export const listAllServerRecords = (cfg: ServerConfig, auth: TeacherAuth, code: string, f?: typeof fetch) =>
  readAll<ServerRecordRow>(cfg, auth, { table: 'records', id: 'record_id', select: 'record_id,receipt_id,accepted_at,payload_hash,payload_json,session_code,anonymous_student_code,run_purpose,schema_version', filter: sessionEq(code), order: 'accepted_at.asc,record_id.asc' }, f)
/** 대조용 접수 정보(C2). 원본 내용은 받지 않는다 */
export const listServerReceipts = (cfg: ServerConfig, auth: TeacherAuth, code: string, f?: typeof fetch) =>
  readAll<ServerReceipt>(cfg, auth, { table: 'records', id: 'record_id', select: 'record_id,receipt_id,accepted_at,payload_hash,anonymous_student_code', filter: sessionEq(code), order: 'accepted_at.asc,record_id.asc' }, f)
/** 수업 중 대화 점검(설계 2026-11-03): sinceIso 이후 대화만(없으면 처음부터) 시간순으로 */
export const listChatLogsSince = (cfg: ServerConfig, auth: TeacherAuth, code: string, sinceIso: string | null, f?: typeof fetch) =>
  rest<ChatLogRecord[]>(cfg, auth, `chat_logs?select=*&session_code=eq.${encodeURIComponent(code)}${sinceIso ? `&created_at=gt.${encodeURIComponent(sinceIso)}` : ''}&order=created_at.asc&limit=1000`, {}, f)
