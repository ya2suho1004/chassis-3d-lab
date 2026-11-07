// AI 교관 챗봇 전송 — 서버 chat 함수(supabase/functions/chat)에 text/plain JSON으로 보낸다(브라우저 사전 확인 요청 없음, 인증·비밀 없음).
// 응답은 모양을 검사해 읽는다. 읽지 못하면 NETWORK/INVALID_RESPONSE로 돌려준다.
import { CHAT_TIMEOUT_MS, deadline } from '../delivery/timeout'

export type ChatMode = 'guided' | 'unguided' | 'timedAssessment'
export interface ChatTurn { q: string; a: string }
export interface ChatAsk {
  sessionCode: string; anonymousStudentCode: string; recordId: string | null; stepId: string | null
  /** 과제(서버가 그 과제 기준·순서로 답한다). 없으면 제동력 */
  taskId?: string | null
  difficultyMode: ChatMode; question: string; history: ChatTurn[]; turnIndex: number
}
export type ChatResult =
  | { ok: true; answer: string; remaining: number; logged: boolean; chatId: string | null; masked: string[]; refused: boolean }
  | { ok: false; code: string; retryable: boolean; remaining?: number }

export const CHAT_HISTORY_TURNS = 3
export const CHAT_QUESTION_MAX = 300

export function getChatEndpoint(): string | null {
  const v = (import.meta.env.VITE_CHAT_ENDPOINT as string | undefined)?.trim()
  return v ? v : null
}

export function buildChatBody(a: ChatAsk): string {
  // taskId는 최소회전반경일 때만 보낸다(제동력 요청 모양은 그대로 — 이전 서버와도 맞음)
  const { taskId, ...rest } = a
  return JSON.stringify({ protocolVersion: 'chat-1', ...rest, ...(taskId ? { taskId } : {}), question: a.question.trim(), history: a.history.slice(-CHAT_HISTORY_TURNS) })
}

export function parseChatResponse(text: string): ChatResult {
  let v: any
  try { v = JSON.parse(text) } catch { return { ok: false, code: 'INVALID_RESPONSE', retryable: true } }
  if (!v || typeof v !== 'object' || v.protocolVersion !== 'chat-1' || typeof v.ok !== 'boolean') return { ok: false, code: 'INVALID_RESPONSE', retryable: true }
  if (v.ok === true) {
    if (typeof v.answer !== 'string' || !Number.isInteger(v.remaining) || typeof v.logged !== 'boolean') return { ok: false, code: 'INVALID_RESPONSE', retryable: true }
    return { ok: true, answer: v.answer, remaining: v.remaining, logged: v.logged, chatId: typeof v.chatId === 'string' ? v.chatId : null, masked: Array.isArray(v.masked) ? v.masked.filter((x: unknown) => typeof x === 'string') : [], refused: v.refused === true }
  }
  if (typeof v.code !== 'string') return { ok: false, code: 'INVALID_RESPONSE', retryable: true }
  return { ok: false, code: v.code, retryable: v.retryable === true, ...(Number.isInteger(v.remaining) ? { remaining: v.remaining } : {}) }
}

export async function askChat(endpoint: string, a: ChatAsk, fetchImpl: typeof fetch = fetch, timeoutMs: number = CHAT_TIMEOUT_MS): Promise<ChatResult> {
  // 연결은 붙어 있는데 답이 안 오는 경우를 끊는다(요청·본문 읽기 모두). 시간 초과는 끊김과 구분해 TIMEOUT
  const d = deadline(timeoutMs)
  const fail = (): ChatResult => ({ ok: false, code: d.expired() ? 'TIMEOUT' : 'NETWORK', retryable: true })
  try {
    let res: Response
    try {
      res = await d.run(fetchImpl(endpoint, { method: 'POST', mode: 'cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: buildChatBody(a), signal: d.signal }))
    } catch {
      return fail()
    }
    let text = ''
    try { text = await d.run(res.text()) } catch { return fail() }
    return parseChatResponse(text)
  } finally {
    d.clear()
  }
}

/** 실패한 질문을 입력란에 되살릴지 — 다시 보내면 될 수 있는 실패(인터넷 끊김·몰림)만. AI 꺼짐·횟수 다 씀은 되살리지 않는다 */
export function keepQuestionAfter(res: ChatResult): boolean {
  return !res.ok && res.retryable
}

/** 답은 왔지만 서버 대화 기록 저장을 확인하지 못했을 때(logged=false) 작은 안내 — 교사 목록에 안 보이는 이유(Codex 검토 A7) */
export function serverLogNote(res: ChatResult): string | null {
  return res.ok && !res.logged ? '이 질문은 선생님 대화 목록에 저장되지 않았을 수 있어요.' : null
}

/** 학생에게 보일 오류 문구 */
export function chatErrorMessage(code: string): string {
  switch (code) {
    case 'CHAT_DISABLED': return '지금은 AI 교관이 꺼져 있어요. 선생님께 물어보세요.'
    case 'LIMIT_STUDENT': return '오늘 질문할 수 있는 횟수를 다 썼어요. 선생님께 물어보세요.'
    case 'LIMIT_SESSION': return '오늘 반 전체 질문 수가 다 찼어요. 선생님께 물어보세요.'
    case 'UPSTREAM_BUSY': return '질문이 몰려 있어요. 잠시 후 다시 물어보세요.'
    case 'INVALID_REQUEST': return '질문을 보낼 수 없어요. 300자 이내로 다시 써 주세요.'
    case 'NETWORK': return '인터넷 연결을 확인한 뒤 다시 물어보세요.'
    case 'TIMEOUT': return '답이 오래 오지 않았어요. 잠시 뒤 ‘보내기’를 다시 눌러 보세요.'
    default: return '답을 받지 못했어요. 잠시 후 다시 물어보세요.'
  }
}

/** **굵게** 표시만 안전하게 나눈다(HTML로 넣지 않음). 홀수 번째 조각이 굵은 글씨. */
export function splitBold(text: string): Array<{ text: string; bold: boolean }> {
  const parts = text.split('**')
  if (parts.length % 2 === 0) return [{ text: text.replace(/\*\*/g, ''), bold: false }] // 짝이 안 맞으면 표시만 지운다
  return parts.map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter((p) => p.text.length > 0)
}

/**
 * 질문 창의 예시 질문 — 과제에 맞춘다(2026-11-07 시연 리허설: 최소회전반경 과제에도 제동력 예시가 나오던 것).
 * 다음 단계·정답을 알려 주지 않는 일반 질문만 쓴다(안내 없음 조건 유지).
 */
export function chatExamples(taskId: string | null | undefined): string[] {
  return taskId === 'min-turning-radius'
    ? ['측정판 눈금은 어떻게 읽어요?', '최소회전반경은 무엇을 재는 거예요?']
    : ['편차는 어떻게 계산해요?', '롤러에 차를 올릴 때 뭘 조심해요?']
}
