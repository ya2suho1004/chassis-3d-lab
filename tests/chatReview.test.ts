// 교사용 AI 대화 점검(설계 docs/superpowers/specs/2026-11-03-teacher-chat-review-design.md)
import { describe, expect, test } from 'vitest'
import { chatFlags, filterChatLogs, latestCreatedAt, mergeChatLogs, studentCodesOf } from '../src/teacher/chatReview'
import { listChatLogsSince, type ChatLogRecord } from '../src/teacher/serverAdmin'

const row = (o: Partial<ChatLogRecord>): ChatLogRecord => ({
  chat_id: 'c1', created_at: '2026-11-03T01:00:00Z', session_code: 'DEMO-ONLY', anonymous_student_code: 'D-01', record_id: null, difficulty_mode: 'guided', step_id: 'read',
  turn_index: 0, status: 'answered', question_masked: '질문', answer: '답', masked_patterns: [], provider: 'gemini', model: 'm', model_version: null, prompt_version: '0.3.0', latency_ms: 10, ...o,
})

describe('표시', () => {
  test('가림·거절·오류를 구분하고, 보통 답은 표시 없음', () => {
    expect(chatFlags(row({}))).toEqual([])
    expect(chatFlags(row({ masked_patterns: ['phone'] }))).toEqual(['masked'])
    expect(chatFlags(row({ status: 'refused' }))).toEqual(['refused'])
    expect(chatFlags(row({ status: 'error', masked_patterns: ['email'] }))).toEqual(['masked', 'error'])
  })
})

describe('병합·거르기', () => {
  const a = row({ chat_id: 'a', created_at: '2026-11-03T01:00:00Z' })
  const b = row({ chat_id: 'b', created_at: '2026-11-03T01:05:00Z', anonymous_student_code: 'D-02', status: 'refused' })
  const c = row({ chat_id: 'c', created_at: '2026-11-03T01:02:00Z' })
  test('중복은 한 번만, 시각순', () => {
    expect(mergeChatLogs([a, b], [b, c]).map((r) => r.chat_id)).toEqual(['a', 'c', 'b'])
  })
  test('코드·주의만 거르기, 코드 목록, 마지막 시각', () => {
    const all = [a, b, c]
    expect(filterChatLogs(all, { code: 'D-02', flaggedOnly: false }).map((r) => r.chat_id)).toEqual(['b'])
    expect(filterChatLogs(all, { code: null, flaggedOnly: true }).map((r) => r.chat_id)).toEqual(['b'])
    expect(studentCodesOf(all)).toEqual(['D-01', 'D-02'])
    expect(latestCreatedAt(all)).toBe('2026-11-03T01:05:00Z')
    expect(latestCreatedAt([])).toBeNull()
  })
})

describe('새 대화만 불러오기(REST)', () => {
  const cfg = { url: 'https://p.supabase.co', anonKey: 'ANON' }
  const auth = { accessToken: 'TOKEN', expiresAt: 0, email: 't@x' }
  test('세션 코드·시각을 주소에 안전하게 넣고 교사 토큰을 붙인다', async () => {
    let seen: any
    const f = (async (u: string, i: any) => { seen = { u, i }; return new Response('[]') }) as any
    await listChatLogsSince(cfg, auth, 'A&B', '2026-11-03T01:00:00.123+00:00', f)
    expect(seen.u).toBe('https://p.supabase.co/rest/v1/chat_logs?select=*&session_code=eq.A%26B&created_at=gt.2026-11-03T01%3A00%3A00.123%2B00%3A00&order=created_at.asc&limit=1000')
    expect(seen.i.headers.Authorization).toBe('Bearer TOKEN')
    await listChatLogsSince(cfg, auth, 'S', null, f)
    expect(seen.u).not.toContain('created_at=gt')
  })
})
