// Supabase Edge Function: AI 교관 챗봇(설계 07 §4). 학생 화면은 인증 없이 text/plain으로 보낸다 → verify_jwt=false.
// 막는 장치: sessions 표의 활성·챗봇 켜짐, 학생·세션 하루 한도, 질문 길이, 허용 주소(CORS). API 키는 Supabase 비밀값에만 있다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { handleChat, type ChatLogRow } from '../_shared/chat/chatCore.ts'
import { callModel } from '../_shared/chat/providers.ts'
import context from '../_shared/chat/taskContext.generated.json' with { type: 'json' }

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

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return new Response(JSON.stringify({ protocolVersion: 'chat-1', ok: false, code: 'INVALID_REQUEST', retryable: false }), { status: 200, headers })
  let body = ''
  try { body = await req.text() } catch { body = '' }
  const res = await handleChat(req.headers.get('content-type'), body, {
    context,
    async getSession(code) {
      const { data, error } = await supabase.from('sessions').select('active, chatbot_enabled, chat_cap_per_student, chat_daily_cap').eq('session_code', code).maybeSingle()
      if (error || !data) return null
      return { active: data.active, chatbotEnabled: data.chatbot_enabled, capPerStudent: data.chat_cap_per_student, dailyCap: data.chat_daily_cap }
    },
    async countToday(sessionCode, studentCode, sinceIso) {
      let q = supabase.from('chat_logs').select('chat_id', { count: 'exact', head: true }).eq('session_code', sessionCode).in('status', ['answered', 'refused']).gte('created_at', sinceIso)
      if (studentCode) q = q.eq('anonymous_student_code', studentCode)
      const { count, error } = await q
      if (error || count === null) throw new Error('DB_COUNT')
      return count
    },
    async insertLog(row: ChatLogRow) {
      const { data, error } = await supabase.from('chat_logs').insert(row).select('chat_id').single()
      return error || !data ? null : data.chat_id
    },
    model() {
      const provider = Deno.env.get('CHAT_PROVIDER') ?? 'gemini'
      return { provider, model: Deno.env.get('CHAT_MODEL') ?? 'gemini-3.5-flash-lite', apiKey: Deno.env.get(KEY_ENV[provider] ?? '') ?? '' }
    },
    callModel: (call) => callModel(call),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  }).catch(() => ({ protocolVersion: 'chat-1', ok: false, code: 'UPSTREAM_ERROR', retryable: true }))
  return new Response(JSON.stringify(res), { status: 200, headers })
})
