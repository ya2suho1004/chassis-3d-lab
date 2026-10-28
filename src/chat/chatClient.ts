// AI 교관 챗봇 전송 — 서버 chat 함수(supabase/functions/chat)에 text/plain JSON으로 보낸다(브라우저 사전 확인 요청 없음, 인증·비밀 없음).
// 응답은 모양을 검사해 읽는다. 읽지 못하면 NETWORK/INVALID_RESPONSE로 돌려준다.
export type ChatMode = 'guided' | 'unguided' | 'timedAssessment'
export interface ChatTurn { q: string; a: string }
export interface ChatAsk {
  sessionCode: string; anonymousStudentCode: string; recordId: string | null; stepId: string | null
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
  return JSON.stringify({ protocolVersion: 'chat-1', ...a, question: a.question.trim(), history: a.history.slice(-CHAT_HISTORY_TURNS) })
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

export async function askChat(endpoint: string, a: ChatAsk, fetchImpl: typeof fetch = fetch): Promise<ChatResult> {
  let res: Response
  try {
    res = await fetchImpl(endpoint, { method: 'POST', mode: 'cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: buildChatBody(a) })
  } catch {
    return { ok: false, code: 'NETWORK', retryable: true }
  }
  let text = ''
  try { text = await res.text() } catch { return { ok: false, code: 'NETWORK', retryable: true } }
  return parseChatResponse(text)
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
    default: return '답을 받지 못했어요. 잠시 후 다시 물어보세요.'
  }
}

/** **굵게** 표시만 안전하게 나눈다(HTML로 넣지 않음). 홀수 번째 조각이 굵은 글씨. */
export function splitBold(text: string): Array<{ text: string; bold: boolean }> {
  const parts = text.split('**')
  if (parts.length % 2 === 0) return [{ text: text.replace(/\*\*/g, ''), bold: false }] // 짝이 안 맞으면 표시만 지운다
  return parts.map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter((p) => p.text.length > 0)
}
