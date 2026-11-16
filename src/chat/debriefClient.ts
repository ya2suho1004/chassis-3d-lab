// AI 정리 요청(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2-2·2-4) — 대화와 같은 주소(VITE_CHAT_ENDPOINT)에
// protocolVersion 'debrief-1'로 text/plain JSON을 보낸다(브라우저 사전 확인 요청 없음, 인증·비밀 없음). 서버가 옛 판이면 실패로 읽혀 화면은 규칙 정리를 쓴다.
// 보내는 것은 허용 목록의 이름과 정수·불리언뿐(학생이 넣은 값·사례 값·닉네임 없음). 받은 글은 화면 상태에만 두고 기록·기기 저장에 넣지 않는다.
import { deadline } from '../delivery/timeout'
import type { ChatMode } from './chatClient'

export const DEBRIEF_PROTOCOL = 'debrief-1'
/** 정리 화면이 AI 글을 기다리는 시간(화면이 뜬 때부터). 요청도 이때 끊는다. 8초였으나 실제 모델 시험(0.1.1)에서 11개 중 2개가 11~13초라 12초로 */
export const DEBRIEF_WAIT_MS = 12_000
const LINES_MAX = 3
const LINE_MAX_CHARS = 120

export interface DebriefRequestFacts {
  /** 응답 항목별 처음·마지막 답의 정오(답하지 않았으면 null). 값은 없다 */
  items: Array<{ itemId: string; first: boolean | null; final: boolean | null }>
  errorTypes: Record<string, number>
  safetyViolationTypes: Record<string, number>
  hintCount: number
  npcInspectionCount: number
  durationSeconds: number | null
}

export interface DebriefAsk {
  sessionCode: string
  anonymousStudentCode: string
  recordId: string
  taskId: string
  difficultyMode: ChatMode
  facts: DebriefRequestFacts
}

export interface DebriefAiNotes { good: string[]; improve: string[]; hard: string[] }
export type DebriefResult = { ok: true; notes: DebriefAiNotes; reused: boolean } | { ok: false; code: string }

export function buildDebriefBody(a: DebriefAsk): string {
  return JSON.stringify({
    protocolVersion: DEBRIEF_PROTOCOL, sessionCode: a.sessionCode, anonymousStudentCode: a.anonymousStudentCode, recordId: a.recordId,
    taskId: a.taskId, difficultyMode: a.difficultyMode, facts: a.facts,
  })
}

const isLines = (v: unknown): v is string[] => Array.isArray(v) && v.length <= LINES_MAX && v.every((x) => typeof x === 'string' && x.length <= LINE_MAX_CHARS)

/** 응답 읽기. 실패 응답은 어느 판이든 code만 읽는다(옛 서버는 chat-1 INVALID_REQUEST). 모양이 틀리면 INVALID_RESPONSE */
export function parseDebriefResponse(text: string): DebriefResult {
  const bad: DebriefResult = { ok: false, code: 'INVALID_RESPONSE' }
  let v: any
  try { v = JSON.parse(text) } catch { return bad }
  if (!v || typeof v !== 'object' || typeof v.ok !== 'boolean') return bad
  if (v.ok === false) return typeof v.code === 'string' ? { ok: false, code: v.code } : bad
  if (v.protocolVersion !== DEBRIEF_PROTOCOL) return bad
  const n = v.notes
  if (!n || typeof n !== 'object' || !isLines(n.good) || !isLines(n.improve) || !isLines(n.hard)) return bad
  return { ok: true, notes: { good: [...n.good], improve: [...n.improve], hard: [...n.hard] }, reused: v.reused === true }
}

export async function askDebrief(endpoint: string, a: DebriefAsk, fetchImpl: typeof fetch = fetch, timeoutMs: number = DEBRIEF_WAIT_MS): Promise<DebriefResult> {
  const d = deadline(timeoutMs)
  const fail = (): DebriefResult => ({ ok: false, code: d.expired() ? 'TIMEOUT' : 'NETWORK' })
  try {
    let res: Response
    try {
      res = await d.run(fetchImpl(endpoint, { method: 'POST', mode: 'cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: buildDebriefBody(a), signal: d.signal }))
    } catch {
      return fail()
    }
    let text = ''
    try { text = await d.run(res.text()) } catch { return fail() }
    return parseDebriefResponse(text)
  } finally {
    d.clear()
  }
}

/** 수행 번호별로 한 번만 부른다 — 화면이 다시 그려지거나(개발 모드의 두 번 마운트 포함) 다시 떠도 같은 답을 기다린다. 앱을 새로 열면 비워진다 */
const asked = new Map<string, Promise<DebriefResult>>()
export function askDebriefOnce(recordId: string, start: () => Promise<DebriefResult>): Promise<DebriefResult> {
  let p = asked.get(recordId)
  if (!p) {
    p = start().catch((): DebriefResult => ({ ok: false, code: 'NETWORK' }))
    asked.set(recordId, p)
  }
  return p
}

/** 시험용: 부른 기록을 비운다 */
export function forgetDebriefAsks(): void {
  asked.clear()
}
