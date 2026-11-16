// Supabase Edge Function: AI 교관 챗봇(설계 07 §4). 학생 화면은 인증 없이 text/plain으로 보낸다 → verify_jwt=false.
// 막는 장치: sessions 표의 활성·챗봇 켜짐, 학생·세션 하루 한도, 질문 길이, 허용 주소(CORS). API 키는 Supabase 비밀값에만 있다.
// 2026-11-16 AI 정리(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2-1): 본문의 protocolVersion이 'debrief-1'이면 정리 본체로,
// 아니면 지금 그대로 대화 본체로. 정리 기록도 chat_logs에 남기고 prompt_version이 'debrief-'로 시작하는 것으로 가른다(대화 한도는 이 행을 세지 않는다).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { handleChat, type ChatLogRow } from '../_shared/chat/chatCore.ts'
import { handleDebrief, isDebriefBody, DEBRIEF_PROTOCOL } from '../_shared/chat/debriefCore.ts'
import { DEBRIEF_PROMPT_PREFIX } from '../_shared/chat/debriefPrompt.ts'
import { callModel } from '../_shared/chat/providers.ts'
import context from '../_shared/chat/taskContext.generated.json' with { type: 'json' }
import labels from '../_shared/chat/debriefContext.generated.json' with { type: 'json' }

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const KEY_ENV: Record<string, string> = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' }

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' }
  if (origin && allowedOrigins.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    h['Access-Control-Allow-Headers'] = 'content-type'
  }
  return h
}

/** 대화·정리가 함께 쓰는 의존성(세션 설정, 기록, 모델, 시계) */
const shared = {
  context,
  async getSession(code: string) {
    const { data, error } = await supabase.from('sessions').select('active, chatbot_enabled, chat_cap_per_student, chat_daily_cap').eq('session_code', code).maybeSingle()
    if (error || !data) return null
    return { active: data.active, chatbotEnabled: data.chatbot_enabled, capPerStudent: data.chat_cap_per_student, dailyCap: data.chat_daily_cap }
  },
  async insertLog(row: ChatLogRow) {
    const { data, error } = await supabase.from('chat_logs').insert(row).select('chat_id').single()
    return error || !data ? null : data.chat_id
  },
  model() {
    const provider = Deno.env.get('CHAT_PROVIDER') ?? 'gemini'
    return { provider, model: Deno.env.get('CHAT_MODEL') ?? 'gemini-3.5-flash-lite', apiKey: Deno.env.get(KEY_ENV[provider] ?? '') ?? '' }
  },
  callModel: (call: Parameters<typeof callModel>[0]) => callModel(call),
  now: () => Date.now(),
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return new Response(JSON.stringify({ protocolVersion: 'chat-1', ok: false, code: 'INVALID_REQUEST', retryable: false }), { status: 200, headers })
  let body = ''
  try { body = await req.text() } catch { body = '' }
  const contentType = req.headers.get('content-type')
  const res = isDebriefBody(body)
    ? await handleDebrief(contentType, body, {
      ...shared,
      labels,
      async findDebrief(sessionCode, studentCode, recordId) {
        const { data, error } = await supabase.from('chat_logs').select('chat_id, answer').eq('session_code', sessionCode).eq('anonymous_student_code', studentCode).eq('record_id', recordId)
          .eq('status', 'answered').like('prompt_version', `${DEBRIEF_PROMPT_PREFIX}%`).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (error || !data || typeof data.answer !== 'string') return null
        return { chatId: data.chat_id, answer: data.answer }
      },
      // 정리 한도: 오늘의 정리 행만, 상태와 관계없이(모델을 부른 것은 모두 센다)
      async countDebriefToday(sessionCode, studentCode, sinceIso) {
        let q = supabase.from('chat_logs').select('chat_id', { count: 'exact', head: true }).eq('session_code', sessionCode).like('prompt_version', `${DEBRIEF_PROMPT_PREFIX}%`).gte('created_at', sinceIso)
        if (studentCode) q = q.eq('anonymous_student_code', studentCode)
        const { count, error } = await q
        if (error || count === null) throw new Error('DB_COUNT')
        return count
      },
    }).catch(() => ({ protocolVersion: DEBRIEF_PROTOCOL, ok: false, code: 'UPSTREAM_ERROR', retryable: true }))
    : await handleChat(contentType, body, {
      ...shared,
      // 대화 한도: answered·refused 중 정리 행(prompt_version 'debrief-…')은 빼고 센다
      async countToday(sessionCode, studentCode, sinceIso) {
        let q = supabase.from('chat_logs').select('chat_id', { count: 'exact', head: true }).eq('session_code', sessionCode).in('status', ['answered', 'refused']).not('prompt_version', 'like', `${DEBRIEF_PROMPT_PREFIX}%`).gte('created_at', sinceIso)
        if (studentCode) q = q.eq('anonymous_student_code', studentCode)
        const { count, error } = await q
        if (error || count === null) throw new Error('DB_COUNT')
        return count
      },
    }).catch(() => ({ protocolVersion: 'chat-1', ok: false, code: 'UPSTREAM_ERROR', retryable: true }))
  return new Response(JSON.stringify(res), { status: 200, headers })
})
