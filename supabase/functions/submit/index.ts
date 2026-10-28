// Supabase Edge Function: 수행 기록 수신 (설계 07 §3). 학생 화면은 인증 머리글 없이 text/plain으로 보낸다
// → 이 함수는 JWT 검사를 끄고 배포한다(supabase/config.toml [functions.submit] verify_jwt = false).
// 막는 장치는 Apps Script 때와 같다: 허용 스냅샷 대조, 접수 기간(SUBMIT_ACCEPT_UNTIL), 신규 건수 상한(SUBMIT_MAX_NEW_ROWS).
// 응답은 항상 JSON 본문(ack/오류). 원본 payload·스택·DB 정보는 응답·로그에 남기지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { handleSubmit, parseConfig, type NewRow, type StoredRow, type SubmitStore } from '../_shared/submitCore.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' }
  if (origin && allowedOrigins.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    h['Access-Control-Allow-Headers'] = 'content-type'
  }
  return h
}

const toStored = (r: any): StoredRow => ({ recordId: r.record_id, receiptId: r.receipt_id, acceptedAt: r.accepted_at, payloadHash: r.payload_hash, payloadJson: r.payload_json })

const store: SubmitStore = {
  async findByRecordId(recordId) {
    const { data, error } = await supabase.from('records').select('record_id, receipt_id, accepted_at, payload_hash, payload_json').eq('record_id', recordId).limit(2)
    if (error) throw new Error('DB_READ')
    return (data ?? []).map(toStored)
  },
  async insertIfAbsent(row: NewRow) {
    const { data, error } = await supabase.from('records').upsert({
      record_id: row.recordId, receipt_id: row.receiptId, accepted_at: row.acceptedAt, payload_hash: row.payloadHash, payload_json: row.payloadJson,
      session_code: row.sessionCode, anonymous_student_code: row.anonymousStudentCode, run_purpose: row.runPurpose, schema_version: row.schemaVersion,
    }, { onConflict: 'record_id', ignoreDuplicates: true }).select('record_id')
    if (error) throw new Error('DB_WRITE')
    return data && data.length === 1 ? 'inserted' : 'exists'
  },
  async countRows() {
    const { count, error } = await supabase.from('records').select('record_id', { count: 'exact', head: true })
    if (error || count === null) throw new Error('DB_COUNT')
    return count
  },
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return new Response(JSON.stringify({ protocolVersion: '1', ok: false, code: 'INVALID_PAYLOAD', retryable: false }), { status: 200, headers })
  let body = ''
  try { body = await req.text() } catch { body = '' }
  const ack = await handleSubmit(req.headers.get('content-type'), body, {
    store,
    config: () => parseConfig(Deno.env.get('SUBMIT_ACCEPT_UNTIL'), Deno.env.get('SUBMIT_MAX_NEW_ROWS')),
    now: () => Date.now(),
    uuid: () => crypto.randomUUID(),
  })
  return new Response(JSON.stringify(ack), { status: 200, headers })
})
