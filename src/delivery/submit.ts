// 직접 제출 클라이언트 — 설계 15 §3(요청) §5(ack 검증·상태 전이), 05 §7·§10
// 원칙:
//  - 로컬 선저장(localSaveStatus=saved)이 끝난 확정 기록만 보낸다. 같은 recordId·같은 원본으로만 재시도한다.
//  - HTTP 200·fetch 성공만으로 완료 처리하지 않는다. JSON 모양·protocol·recordId·독립 계산 hash·receipt·시각이 모두 맞아야 acknowledged.
//  - 저장된 receipt/acceptedAt이 있으면 재시도 응답도 같아야 한다.
//  - 읽지 못한 응답(HTML·opaque·네트워크 오류·필드 불일치)은 confirmationPending. 서버 미저장을 추정하지 않는다.
//  - 비밀·인증 헤더·쿼리스트링 없음. payload를 문자열로 이중 인코딩하지 않음.
import type { RecordPayload } from '../domain/record'
import type { StoredRecord } from '../records/repository'
import type { DeliveryEnvelope } from '../records/types'
import { canonicalize, JcsError, sha256Hex, utf8Length } from './jcs'

export const PROTOCOL_VERSION = '1'
export const CANONICAL_MAX_BYTES = 32 * 1024
export const REQUEST_MAX_BYTES = 48 * 1024
export const DEFAULT_MAX_ATTEMPTS = 8
const BACKOFF_BASE_MS = 30_000
const BACKOFF_MAX_MS = 10 * 60_000

export interface SubmitDeps {
  fetch: typeof fetch
  /** 시험/운영 배포의 고정 /exec URL. 학생 입력으로 바꾸지 않는다. */
  endpointUrl: string
  now: () => Date
  maxAttempts?: number
}

export type SubmitOutcome =
  | { kind: 'acknowledged'; receiptId: string; acceptedAt: string; payloadHash: string; duplicate: boolean }
  | { kind: 'rejected'; code: string }
  | { kind: 'conflict'; code: string }
  | { kind: 'pending'; code: string; nextRetryAt: string }
  | { kind: 'confirmationPending'; code: string; nextRetryAt: string | null }
  | { kind: 'skipped'; reason: string }

export interface SubmitResult { outcome: SubmitOutcome; patch: Partial<DeliveryEnvelope> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HEX64 = /^[0-9a-f]{64}$/
const isDateTime = (s: unknown) => typeof s === 'string' && !Number.isNaN(Date.parse(s)) && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)

export function buildRequestBody(payload: RecordPayload): string {
  return JSON.stringify({ protocolVersion: PROTOCOL_VERSION, payload })
}

type Ack =
  | { kind: 'success'; recordId: string; receiptId: string; acceptedAt: string; payloadHash: string; duplicate: boolean }
  | { kind: 'failure'; code: string; retryable: boolean; recordId: string | null }
  | { kind: 'unreadable'; code: 'UNREADABLE_ACK' | 'INVALID_ACK' }

const SUCCESS_KEYS = ['protocolVersion', 'ok', 'recordId', 'receiptId', 'acceptedAt', 'payloadHash', 'duplicate']
const FAILURE_KEYS = ['protocolVersion', 'ok', 'code', 'retryable']

/** 응답 본문을 submission.schema(success/failure)에 맞춰 읽는다. 추가 필드·형식 위반은 INVALID_ACK. */
export function parseAck(text: string): Ack {
  let v: unknown
  try { v = JSON.parse(text) } catch { return { kind: 'unreadable', code: 'UNREADABLE_ACK' } }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { kind: 'unreadable', code: 'UNREADABLE_ACK' }
  const o = v as Record<string, unknown>
  if (o.protocolVersion !== PROTOCOL_VERSION) return { kind: 'unreadable', code: 'INVALID_ACK' }
  const keys = Object.keys(o)
  if (o.ok === true) {
    if (keys.length !== SUCCESS_KEYS.length || !SUCCESS_KEYS.every((k) => k in o)) return { kind: 'unreadable', code: 'INVALID_ACK' }
    const { recordId, receiptId, acceptedAt, payloadHash, duplicate } = o
    if (typeof recordId !== 'string' || !UUID.test(recordId)) return { kind: 'unreadable', code: 'INVALID_ACK' }
    if (typeof receiptId !== 'string' || receiptId.length < 1 || receiptId.length > 128) return { kind: 'unreadable', code: 'INVALID_ACK' }
    if (!isDateTime(acceptedAt)) return { kind: 'unreadable', code: 'INVALID_ACK' }
    if (typeof payloadHash !== 'string' || !HEX64.test(payloadHash)) return { kind: 'unreadable', code: 'INVALID_ACK' }
    if (typeof duplicate !== 'boolean') return { kind: 'unreadable', code: 'INVALID_ACK' }
    return { kind: 'success', recordId, receiptId, acceptedAt: acceptedAt as string, payloadHash, duplicate }
  }
  if (o.ok === false) {
    const allowed = [...FAILURE_KEYS, 'recordId']
    if (!FAILURE_KEYS.every((k) => k in o) || !keys.every((k) => allowed.includes(k))) return { kind: 'unreadable', code: 'INVALID_ACK' }
    if (typeof o.code !== 'string' || o.code.length < 1 || o.code.length > 64 || typeof o.retryable !== 'boolean') return { kind: 'unreadable', code: 'INVALID_ACK' }
    const rid = typeof o.recordId === 'string' && UUID.test(o.recordId) ? o.recordId : null
    return { kind: 'failure', code: o.code, retryable: o.retryable, recordId: rid }
  }
  return { kind: 'unreadable', code: 'INVALID_ACK' }
}

export function backoffAt(now: Date, attemptCountAfter: number): string {
  const ms = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attemptCountAfter - 1), BACKOFF_MAX_MS)
  return new Date(now.getTime() + ms).toISOString()
}

// 오류 코드 → 상태 (설계 15 §5 표)
const REJECT_CODES = new Set(['INVALID_PAYLOAD', 'UNSUPPORTED_SCHEMA', 'PAYLOAD_TOO_LARGE', 'SESSION_NOT_ALLOWED'])
const PENDING_CODES = new Set(['LOCK_BUSY', 'RATE_LIMITED'])

export async function submitRecord(rec: StoredRecord, deps: SubmitDeps): Promise<SubmitResult> {
  const env = rec.envelope
  if (env.localSaveStatus !== 'saved') return { outcome: { kind: 'skipped', reason: 'NOT_SAVED_LOCALLY' }, patch: {} }
  if (env.uploadStatus === 'acknowledged') return { outcome: { kind: 'skipped', reason: 'ALREADY_ACKNOWLEDGED' }, patch: {} }
  const now = deps.now()
  const attempts = env.uploadAttemptCount + 1
  const base: Partial<DeliveryEnvelope> = { uploadAttemptCount: attempts }
  const keep = { receiptId: env.receiptId, uploadedAt: env.uploadedAt, payloadHash: env.payloadHash }
  const pendingConfirm = (code: string, retry: boolean): SubmitResult => {
    const nextRetryAt = retry && attempts < (deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS) ? backoffAt(now, attempts) : null
    return { outcome: { kind: 'confirmationPending', code, nextRetryAt }, patch: { ...base, ...keep, uploadStatus: 'confirmationPending', lastErrorCode: code, nextRetryAt } }
  }

  // 1. 로컬 독립 계산: canonical·hash·크기
  let canonical: string
  try { canonical = canonicalize(rec.payload) } catch (e) {
    const code = e instanceof JcsError ? `INVALID_PAYLOAD` : 'INVALID_PAYLOAD'
    return { outcome: { kind: 'rejected', code }, patch: { ...base, ...keep, uploadStatus: 'rejected', lastErrorCode: code, nextRetryAt: null } }
  }
  const body = buildRequestBody(rec.payload)
  if (utf8Length(canonical) > CANONICAL_MAX_BYTES || utf8Length(body) > REQUEST_MAX_BYTES) {
    return { outcome: { kind: 'rejected', code: 'PAYLOAD_TOO_LARGE' }, patch: { ...base, ...keep, uploadStatus: 'rejected', lastErrorCode: 'PAYLOAD_TOO_LARGE', nextRetryAt: null } }
  }
  const localHash = await sha256Hex(canonical)

  // 2. 전송
  let res: Response
  try {
    res = await deps.fetch(deps.endpointUrl, { method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body })
  } catch {
    return pendingConfirm('NETWORK_ERROR', true)
  }
  if (res.type === 'opaque' || res.type === 'opaqueredirect' || res.status === 0) return pendingConfirm('OPAQUE_RESPONSE', true)
  let text = ''
  try { text = await res.text() } catch { return pendingConfirm('UNREADABLE_ACK', true) }

  // 3. ack 검증
  const ack = parseAck(text)
  if (ack.kind === 'unreadable') return pendingConfirm(ack.code, true)
  if (ack.kind === 'failure') {
    const code = ack.code
    if (ack.recordId && ack.recordId !== rec.recordId) return pendingConfirm('RECORD_ID_MISMATCH', true)
    if (code === 'RECORD_ID_CONFLICT') return { outcome: { kind: 'conflict', code }, patch: { ...base, ...keep, uploadStatus: 'conflict', lastErrorCode: code, nextRetryAt: null } }
    if (REJECT_CODES.has(code)) return { outcome: { kind: 'rejected', code }, patch: { ...base, ...keep, uploadStatus: 'rejected', lastErrorCode: code, nextRetryAt: null } }
    if (PENDING_CODES.has(code) && ack.retryable) {
      const nextRetryAt = attempts < (deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS) ? backoffAt(now, attempts) : null
      return { outcome: { kind: 'pending', code, nextRetryAt: nextRetryAt ?? '' }, patch: { ...base, ...keep, uploadStatus: 'pending', lastErrorCode: code, nextRetryAt } }
    }
    if (code === 'CANONICAL_STORE_INVALID') return pendingConfirm(code, false)
    // UPSTREAM_UNAVAILABLE 등 접수 불명: 같은 원본으로 확인 재시도
    return pendingConfirm(code, ack.retryable)
  }
  if (ack.recordId !== rec.recordId) return pendingConfirm('RECORD_ID_MISMATCH', true)
  if (ack.payloadHash !== localHash) return pendingConfirm('HASH_MISMATCH', true)
  if (env.receiptId && env.receiptId !== ack.receiptId) return pendingConfirm('RECEIPT_MISMATCH', false)
  if (env.uploadedAt && Date.parse(env.uploadedAt) !== Date.parse(ack.acceptedAt)) return pendingConfirm('ACCEPTED_AT_MISMATCH', false)
  return {
    outcome: { kind: 'acknowledged', receiptId: ack.receiptId, acceptedAt: ack.acceptedAt, payloadHash: ack.payloadHash, duplicate: ack.duplicate },
    patch: { ...base, uploadStatus: 'acknowledged', receiptId: ack.receiptId, uploadedAt: ack.acceptedAt, payloadHash: ack.payloadHash, lastErrorCode: null, nextRetryAt: null },
  }
}
