// 교사용 AI 대화 점검(설계 docs/superpowers/specs/2026-11-03-teacher-chat-review-design.md) — 화면과 분리한 순수 함수.
// 서버에 저장된 '가림 뒤' 질문만 다룬다. 기기에 따로 저장하지 않는다.
import { csvCell, CHAT_CSV_HEADER } from '../records/csv'
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

// ---------- AI 정리 행(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2-4) ----------
// 정리 기록도 chat_logs에 남는다. prompt_version이 'debrief-'로 시작하면 정리 행(question_masked = 서버가 만든 수행 요약, answer = 정리 JSON)

export const DEBRIEF_LOG_LABEL = '수행 정리'

export function isDebriefLog(r: Pick<ChatLogRecord, 'prompt_version'>): boolean {
  return typeof r.prompt_version === 'string' && r.prompt_version.startsWith('debrief-')
}

const DEBRIEF_GROUPS: Array<[string, string]> = [['good', '잘한 점'], ['improve', '보완할 점'], ['hard', '어려웠던 점']]

/** 정리 글(JSON)을 묶음 이름을 붙여 한 줄로. 읽을 수 없으면(검사에서 걸린 모델 원문 등) 그대로 */
export function debriefAnswerText(answer: string | null): string | null {
  if (answer === null) return null
  try {
    const v = JSON.parse(answer)
    if (!v || typeof v !== 'object' || DEBRIEF_GROUPS.some(([k]) => !Array.isArray(v[k]))) return answer
    return DEBRIEF_GROUPS.map(([k, name]) => `${name}: ${(v[k] as unknown[]).length ? (v[k] as unknown[]).map(String).join(' ') : '(없음)'}`).join(' · ')
  } catch {
    return answer
  }
}

/** 교사 화면 '대화 기록 CSV': 지금 열(records/csv의 CHAT_CSV_HEADER) 그대로 + 맨 끝 kind(대화·수행 정리) */
export function toChatLogCsv(rows: ChatLogRecord[]): string {
  const lines = [[...CHAT_CSV_HEADER, 'kind'].join(',')]
  for (const r of rows) {
    const rec = r as unknown as Record<string, unknown>
    const cells = CHAT_CSV_HEADER.map((k) => csvCell(k === 'masked_patterns' && Array.isArray(rec[k]) ? (rec[k] as string[]).join('|') : rec[k]))
    lines.push([...cells, csvCell(isDebriefLog(r) ? DEBRIEF_LOG_LABEL : '대화')].join(','))
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n'
}
