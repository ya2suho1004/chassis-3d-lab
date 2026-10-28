// 수행 기록 수신 본체 — Apps Script Code.gs의 doPost/acceptInLock_를 Supabase(Postgres)용으로 옮긴 것.
// 검사 규칙(엄격 파싱·스키마·의미·허용 세션·JCS 해시)은 receiverCore.generated.js(검증된 .gs 원본)를 그대로 쓴다.
// 바뀐 것은 저장소뿐이다: 시트+LockService → records 표의 record_id 고유 제약 + insertIfAbsent.
// 응답 본문(ack/오류)은 submission.schema와 Apps Script 때와 같다(src/delivery/submit.ts가 엄격히 검사).
import {
  CANONICAL_MAX_BYTES, HEX64_RE, MAX_STEP_EVENTS, PROTOCOL_VERSION, RECORD_SCHEMAS, REQUEST_MAX_BYTES, SUPPORTED_RECORD_VERSIONS, UUID_RE,
  isValidUtcDateTime_, jcsCanonicalize, jcsSha256Hex, parseJsonStrict, sessionAllowed_, utf8ByteLength_,
  validateAgainst, validateRecordSemantics_, validateRequestEnvelope, validateStepEvents_,
} from './receiverCore.generated.js'

export interface StoredRow { recordId: string; receiptId: string; acceptedAt: string; payloadHash: string; payloadJson: string }
export interface NewRow extends StoredRow { sessionCode: string; anonymousStudentCode: string; runPurpose: string; schemaVersion: string }

export interface SubmitStore {
  /** 같은 record_id 행을 모두 돌려준다(정상이면 0 또는 1개). */
  findByRecordId(recordId: string): Promise<StoredRow[]>
  /** 고유 제약으로 없을 때만 넣는다. 이미 있으면 'exists'(동시 요청 경합). */
  insertIfAbsent(row: NewRow): Promise<'inserted' | 'exists'>
  countRows(): Promise<number>
}

export interface SubmitConfig { acceptUntilMs: number; maxNewRows: number; intakeValid: boolean }

export interface SubmitDeps {
  store: SubmitStore
  config: () => SubmitConfig
  now: () => number
  uuid: () => string
}

export type Ack =
  | { protocolVersion: string; ok: true; recordId: string; receiptId: string; acceptedAt: string; payloadHash: string; duplicate: boolean }
  | { protocolVersion: string; ok: false; code: string; retryable: boolean; recordId?: string }

const ok = (rid: string, receipt: string, acceptedAt: string, hash: string, duplicate: boolean): Ack =>
  ({ protocolVersion: PROTOCOL_VERSION, ok: true, recordId: rid, receiptId: receipt, acceptedAt, payloadHash: hash, duplicate })
const fail = (code: string, retryable: boolean, rid: string | null): Ack => {
  const b: Ack = { protocolVersion: PROTOCOL_VERSION, ok: false, code, retryable }
  if (rid) (b as { recordId?: string }).recordId = rid
  return b
}

/** 설정 읽기(환경변수). 비거나 잘못되면 신규 접수를 닫는다(fail-closed, Apps Script B4와 같음). */
export function parseConfig(acceptUntil: string | undefined, maxNewRows: string | undefined): SubmitConfig {
  const until = acceptUntil && isValidUtcDateTime_(acceptUntil) ? Date.parse(acceptUntil) : NaN
  const max = Number(maxNewRows)
  const intakeValid = Number.isFinite(until) && Number.isFinite(max) && Math.floor(max) === max && max > 0 && max <= 100000
  return { acceptUntilMs: until, maxNewRows: max, intakeValid }
}

export function mimeAllowed(type: string | null | undefined): boolean {
  if (typeof type !== 'string') return false
  return type.split(';')[0]!.trim().toLowerCase() === 'text/plain'
}

export async function handleSubmit(contentType: string | null, body: string, deps: SubmitDeps): Promise<Ack> {
  let rid: string | null = null
  try {
    if (!mimeAllowed(contentType)) return fail('INVALID_PAYLOAD', false, null)
    if (body.length === 0) return fail('INVALID_PAYLOAD', false, null)
    if (utf8ByteLength_(body) > REQUEST_MAX_BYTES) return fail('PAYLOAD_TOO_LARGE', false, null)

    let req: any
    try { req = parseJsonStrict(body) } catch { return fail('INVALID_PAYLOAD', false, null) }
    if (!validateRequestEnvelope(req).ok) return fail('INVALID_PAYLOAD', false, null)
    const payload = req.payload
    if (typeof payload.recordId === 'string' && UUID_RE.test(payload.recordId)) rid = payload.recordId
    if (SUPPORTED_RECORD_VERSIONS.indexOf(payload.schemaVersion) < 0) return fail('UNSUPPORTED_SCHEMA', false, rid)
    if (!validateAgainst(RECORD_SCHEMAS[payload.schemaVersion], payload).ok) return fail('INVALID_PAYLOAD', false, rid)
    if (payload.stepEvents.length > MAX_STEP_EVENTS) return fail('PAYLOAD_TOO_LARGE', false, rid)
    if (validateRecordSemantics_(payload).length > 0) return fail('INVALID_PAYLOAD', false, rid)

    const entry = sessionAllowed_(payload)
    if (!entry) return fail('SESSION_NOT_ALLOWED', false, rid)
    if (validateStepEvents_(payload, entry.allowedStepIds || null, entry.stepPrerequisites || null).length > 0) return fail('INVALID_PAYLOAD', false, rid)

    let canonical: string
    try { canonical = jcsCanonicalize(payload) } catch { return fail('INVALID_PAYLOAD', false, rid) }
    if (utf8ByteLength_(canonical) > CANONICAL_MAX_BYTES) return fail('PAYLOAD_TOO_LARGE', false, rid)
    const hash: string = jcsSha256Hex(canonical)

    try {
      return await accept(deps, rid as string, canonical, hash, entry, payload)
    } catch {
      return fail('UPSTREAM_UNAVAILABLE', true, rid)
    }
  } catch {
    return fail('UPSTREAM_UNAVAILABLE', true, rid)
  }
}

/** 기존 행 검증 → 중복/충돌/이상 판정 (Apps Script acceptInLock_의 기존 행 분기와 같은 검사) */
function judgeExisting(found: StoredRow[], rid: string, canonical: string, hash: string): Ack {
  if (found.length > 1) return fail('CANONICAL_STORE_INVALID', false, rid)
  const row = found[0]!
  const storedReceipt = String(row.receiptId ?? ''), storedAt = String(row.acceptedAt ?? ''), storedHash = String(row.payloadHash ?? ''), storedJson = String(row.payloadJson ?? '')
  if (!storedReceipt || !storedAt || !HEX64_RE.test(storedHash) || !storedJson) return fail('CANONICAL_STORE_INVALID', false, rid)
  if (storedReceipt.length > 128 || !isValidUtcDateTime_(storedAt)) return fail('CANONICAL_STORE_INVALID', false, rid)
  let storedObj: any
  try { storedObj = parseJsonStrict(storedJson) } catch { return fail('CANONICAL_STORE_INVALID', false, rid) }
  if (!storedObj || typeof storedObj !== 'object' || Array.isArray(storedObj)) return fail('CANONICAL_STORE_INVALID', false, rid)
  if (jcsCanonicalize(storedObj) !== storedJson || jcsSha256Hex(storedJson) !== storedHash) return fail('CANONICAL_STORE_INVALID', false, rid)
  if (storedObj.recordId !== rid || SUPPORTED_RECORD_VERSIONS.indexOf(storedObj.schemaVersion) < 0) return fail('CANONICAL_STORE_INVALID', false, rid)
  if (!validateAgainst(RECORD_SCHEMAS[storedObj.schemaVersion], storedObj).ok || validateRecordSemantics_(storedObj).length > 0) return fail('CANONICAL_STORE_INVALID', false, rid)
  if (storedJson === canonical && storedHash === hash) return ok(rid, storedReceipt, storedAt, storedHash, true)
  return fail('RECORD_ID_CONFLICT', false, rid)
}

async function accept(deps: SubmitDeps, rid: string, canonical: string, hash: string, entry: any, payload: any): Promise<Ack> {
  const found = await deps.store.findByRecordId(rid)
  if (found.length > 0) return judgeExisting(found, rid, canonical, hash)

  // 신규 접수 — 설정이 없거나 잘못되면 닫는다(fail-closed). retired 스냅샷은 기존 receipt 회수만.
  const cfg = deps.config()
  if (!cfg.intakeValid) return fail('SESSION_NOT_ALLOWED', false, rid)
  if (!entry || entry.status !== 'active') return fail('SESSION_NOT_ALLOWED', false, rid)
  if (deps.now() > cfg.acceptUntilMs) return fail('SESSION_NOT_ALLOWED', false, rid)
  if ((await deps.store.countRows()) >= cfg.maxNewRows) return fail('RATE_LIMITED', true, rid)

  const receipt = deps.uuid()
  const acceptedAt = new Date(deps.now()).toISOString()
  const row: NewRow = {
    recordId: rid, receiptId: receipt, acceptedAt, payloadHash: hash, payloadJson: canonical,
    sessionCode: String(payload.sessionCode), anonymousStudentCode: String(payload.anonymousStudentCode), runPurpose: String(payload.runPurpose), schemaVersion: String(payload.schemaVersion),
  }
  const result = await deps.store.insertIfAbsent(row)
  // 동시 요청 경합: 다른 요청이 먼저 넣었으면 그 행으로 중복/충돌을 판정한다(Apps Script의 잠금 대기와 같은 결과)
  if (result === 'exists') return judgeExisting(await deps.store.findByRecordId(rid), rid, canonical, hash)

  // 다시 읽어 저장 원본·해시가 그대로인지 확인한 뒤에만 정상 ack(Apps Script flush·재읽기와 같음)
  const back = await deps.store.findByRecordId(rid)
  const b = back.length === 1 ? back[0]! : null
  const same = !!b && b.recordId === rid && b.receiptId === receipt && b.acceptedAt === acceptedAt && b.payloadHash === hash && b.payloadJson === canonical && jcsSha256Hex(b.payloadJson) === hash
  if (!same) return fail('UPSTREAM_UNAVAILABLE', true, rid)
  return ok(rid, receipt, acceptedAt, hash, false)
}
