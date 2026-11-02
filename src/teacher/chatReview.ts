// 교사용 AI 대화 점검(설계 docs/superpowers/specs/2026-11-03-teacher-chat-review-design.md) — 화면과 분리한 순수 함수.
// 서버에 저장된 '가림 뒤' 질문만 다룬다. 기기에 따로 저장하지 않는다.
import type { ChatLogRecord } from './serverAdmin'

export type ChatFlag = 'masked' | 'refused' | 'error'
export const FLAG_LABEL: Record<ChatFlag, string> = { masked: '개인정보 가림', refused: '답 거절', error: '오류' }
export const MASK_LABEL: Record<string, string> = { phone: '전화번호', email: '이메일', rrn: '주민번호', classroom: '학년·반' }

export function chatFlags(r: Pick<ChatLogRecord, 'status' | 'masked_patterns'>): ChatFlag[] {
  const f: ChatFlag[] = []
  if ((r.masked_patterns ?? []).length > 0) f.push('masked')
  if (r.status === 'refused') f.push('refused')
  if (r.status === 'error') f.push('error')
  return f
}

/** 새로 받은 대화를 붙인다(chat_id 중복 제거, 시각순) */
export function mergeChatLogs(prev: ChatLogRecord[], incoming: ChatLogRecord[]): ChatLogRecord[] {
  const byId = new Map(prev.map((r) => [r.chat_id, r]))
  for (const r of incoming) byId.set(r.chat_id, r)
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.turn_index - b.turn_index))
}

export function filterChatLogs(rows: ChatLogRecord[], o: { code: string | null; flaggedOnly: boolean }): ChatLogRecord[] {
  return rows.filter((r) => (!o.code || r.anonymous_student_code === o.code) && (!o.flaggedOnly || chatFlags(r).length > 0))
}

export function studentCodesOf(rows: ChatLogRecord[]): string[] {
  return [...new Set(rows.map((r) => r.anonymous_student_code))].sort()
}

/** 다음 새로고침의 기준 시각(가장 늦은 created_at) */
export function latestCreatedAt(rows: ChatLogRecord[]): string | null {
  return rows.reduce<string | null>((m, r) => (m === null || r.created_at > m ? r.created_at : m), null)
}
