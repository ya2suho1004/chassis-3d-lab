import { describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import { buildRequestBody, submitRecord, type SubmitDeps } from '../src/delivery/submit'
import { payloadHash } from '../src/delivery/jcs'
import type { StoredRecord } from '../src/records/repository'
import type { RecordPayload } from '../src/domain/record'

const payload = demo.payload as unknown as RecordPayload
const NOW = new Date('2026-10-26T09:00:00Z')
const ACCEPTED = '2026-10-26T09:00:01Z'

function record(envPatch: Partial<StoredRecord['envelope']> = {}): StoredRecord {
  return {
    recordId: payload.recordId, payload, frozenAt: '2026-10-26T08:59:00Z',
    envelope: { recordId: payload.recordId, localSaveStatus: 'saved', uploadStatus: 'pending', uploadedAt: null, receiptId: null, payloadHash: null, uploadAttemptCount: 0, lastErrorCode: null, nextRetryAt: null, ...envPatch },
  }
}
type Call = { url: string; init: RequestInit }
function fakeFetch(reply: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return reply({ url, init }) }) as unknown as typeof fetch
  return { fetch: f, calls }
}
const json = (body: unknown, status = 200, type = 'application/json') => new Response(JSON.stringify(body), { status, headers: { 'content-type': type } })
const deps = (f: typeof globalThis.fetch, extra: Partial<SubmitDeps> = {}): SubmitDeps => ({ fetch: f, endpointUrl: 'https://script.google.com/macros/s/TEST/exec', now: () => NOW, ...extra })
const okAck = async (over: Record<string, unknown> = {}) => ({ protocolVersion: '1', ok: true, recordId: payload.recordId, receiptId: 'R-0001', acceptedAt: ACCEPTED, payloadHash: await payloadHash(payload), duplicate: false, ...over })

describe('요청 모양 (설계 15 §3)', () => {
  test('본문은 {"protocolVersion":"1","payload":{…}} 한 문서이고 payload는 이중 인코딩하지 않는다', () => {
    const body = buildRequestBody(payload)
    const parsed = JSON.parse(body)
    expect(parsed.protocolVersion).toBe('1')
    expect(typeof parsed.payload).toBe('object')
    expect(parsed.payload.recordId).toBe(payload.recordId)
    expect(Object.keys(parsed)).toEqual(['protocolVersion', 'payload'])
  })
  test('POST · text/plain;charset=UTF-8 · cors · credentials omit · redirect follow · 인증 헤더 없음 · 쿼리스트링 없음', async () => {
    const { fetch, calls } = fakeFetch(async () => json(await okAck()))
    await submitRecord(record(), deps(fetch))
    expect(calls).toHaveLength(1)
    const c = calls[0]!
    expect(c.url).toBe('https://script.google.com/macros/s/TEST/exec')
    expect(c.init.method).toBe('POST')
    expect(c.init.mode).toBe('cors'); expect(c.init.credentials).toBe('omit'); expect(c.init.redirect).toBe('follow')
    const headers = c.init.headers as Record<string, string>
    expect(Object.keys(headers)).toEqual(['Content-Type'])
    expect(headers['Content-Type']).toBe('text/plain;charset=UTF-8')
    expect(typeof c.init.body).toBe('string')
  })
})

describe('ack 검증과 상태 전이 (설계 15 §5)', () => {
  test('D01 정상 ack: ID·hash·receipt·시각이 맞으면 acknowledged, uploadedAt=acceptedAt', async () => {
    const { fetch } = fakeFetch(async () => json(await okAck()))
    const r = await submitRecord(record(), deps(fetch))
    expect(r.outcome.kind).toBe('acknowledged')
    expect(r.patch).toMatchObject({ uploadStatus: 'acknowledged', receiptId: 'R-0001', uploadedAt: ACCEPTED, payloadHash: await payloadHash(payload), uploadAttemptCount: 1, lastErrorCode: null, nextRetryAt: null })
  })
  test('D02 같은 ID 재전송: duplicate=true이고 저장된 receipt·시각과 같으면 acknowledged', async () => {
    const { fetch } = fakeFetch(async () => json(await okAck({ duplicate: true })))
    const r = await submitRecord(record({ uploadStatus: 'confirmationPending', receiptId: 'R-0001', uploadedAt: ACCEPTED, uploadAttemptCount: 1 }), deps(fetch))
    expect(r.outcome.kind).toBe('acknowledged')
    expect(r.patch.receiptId).toBe('R-0001'); expect(r.patch.uploadAttemptCount).toBe(2)
  })
  test('D02 변형: 저장된 receipt와 다른 receipt가 오면 acknowledged가 아니라 confirmationPending', async () => {
    const { fetch } = fakeFetch(async () => json(await okAck({ receiptId: 'R-9999', duplicate: true })))
    const r = await submitRecord(record({ receiptId: 'R-0001', uploadedAt: ACCEPTED, uploadStatus: 'confirmationPending' }), deps(fetch))
    expect(r.outcome.kind).toBe('confirmationPending')
    expect(r.patch.uploadStatus).toBe('confirmationPending'); expect(r.patch.lastErrorCode).toBe('RECEIPT_MISMATCH'); expect(r.patch.receiptId).toBe('R-0001')
  })
  test('D03 RECORD_ID_CONFLICT → conflict, 새 ID 발급 없음', async () => {
    const { fetch } = fakeFetch(() => json({ protocolVersion: '1', ok: false, code: 'RECORD_ID_CONFLICT', retryable: false, recordId: payload.recordId }))
    const r = await submitRecord(record(), deps(fetch))
    expect(r.outcome.kind).toBe('conflict')
    expect(r.patch).toMatchObject({ uploadStatus: 'conflict', lastErrorCode: 'RECORD_ID_CONFLICT', nextRetryAt: null })
    expect(r.patch.recordId ?? payload.recordId).toBe(payload.recordId)
  })
  test('INVALID_PAYLOAD·UNSUPPORTED_SCHEMA·PAYLOAD_TOO_LARGE·SESSION_NOT_ALLOWED → rejected, 자동 재시도 없음', async () => {
    for (const code of ['INVALID_PAYLOAD', 'UNSUPPORTED_SCHEMA', 'PAYLOAD_TOO_LARGE', 'SESSION_NOT_ALLOWED']) {
      const { fetch } = fakeFetch(() => json({ protocolVersion: '1', ok: false, code, retryable: false }))
      const r = await submitRecord(record(), deps(fetch))
      expect(r.outcome.kind).toBe('rejected'); expect(r.patch.uploadStatus).toBe('rejected'); expect(r.patch.nextRetryAt).toBeNull(); expect(r.patch.lastErrorCode).toBe(code)
    }
  })
  test('LOCK_BUSY·RATE_LIMITED(retryable) → pending, 지수 백오프 nextRetryAt', async () => {
    const { fetch } = fakeFetch(() => json({ protocolVersion: '1', ok: false, code: 'LOCK_BUSY', retryable: true }))
    const r1 = await submitRecord(record(), deps(fetch))
    expect(r1.outcome.kind).toBe('pending'); expect(r1.patch.uploadStatus).toBe('pending')
    expect(r1.patch.nextRetryAt).toBe(new Date(NOW.getTime() + 30_000).toISOString())
    const r2 = await submitRecord(record({ uploadAttemptCount: 3 }), deps(fetch))
    expect(r2.patch.nextRetryAt).toBe(new Date(NOW.getTime() + 240_000).toISOString())
  })
  test('UPSTREAM_UNAVAILABLE → confirmationPending(재시도 예정), CANONICAL_STORE_INVALID → confirmationPending(자동 재시도 중단)', async () => {
    const a = await submitRecord(record(), deps(fakeFetch(() => json({ protocolVersion: '1', ok: false, code: 'UPSTREAM_UNAVAILABLE', retryable: true })).fetch))
    expect(a.patch.uploadStatus).toBe('confirmationPending'); expect(a.patch.nextRetryAt).not.toBeNull()
    const b = await submitRecord(record(), deps(fakeFetch(() => json({ protocolVersion: '1', ok: false, code: 'CANONICAL_STORE_INVALID', retryable: false })).fetch))
    expect(b.patch.uploadStatus).toBe('confirmationPending'); expect(b.patch.nextRetryAt).toBeNull(); expect(b.patch.lastErrorCode).toBe('CANONICAL_STORE_INVALID')
  })
  test('D07 잘못된 ack는 어느 것도 acknowledged가 되지 않는다', async () => {
    const cases: Array<[string, () => Promise<Response> | Response, string]> = [
      ['HTML 200', () => new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } }), 'UNREADABLE_ACK'],
      ['필수 필드 누락', async () => json({ protocolVersion: '1', ok: true, recordId: payload.recordId }), 'INVALID_ACK'],
      ['다른 recordId', async () => json(await okAck({ recordId: '00000000-0000-4000-8000-0000000000ff' })), 'RECORD_ID_MISMATCH'],
      ['다른 hash', async () => json(await okAck({ payloadHash: 'a'.repeat(64) })), 'HASH_MISMATCH'],
      ['추가 필드', async () => json(await okAck({ extra: 1 })), 'INVALID_ACK'],
      ['HTTP 500 JSON 아님', () => new Response('error', { status: 500 }), 'UNREADABLE_ACK'],
    ]
    for (const [name, reply, code] of cases) {
      const r = await submitRecord(record(), deps(fakeFetch(reply).fetch))
      expect(r.outcome.kind, name).toBe('confirmationPending')
      expect(r.patch.uploadStatus, name).toBe('confirmationPending'); expect(r.patch.lastErrorCode, name).toBe(code); expect(r.patch.receiptId, name).toBeNull()
    }
  })
  test('네트워크 오류(fetch 예외)·opaque 응답 → confirmationPending, 원본·ID 유지', async () => {
    const r = await submitRecord(record(), deps((async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch))
    expect(r.patch.uploadStatus).toBe('confirmationPending'); expect(r.patch.lastErrorCode).toBe('NETWORK_ERROR')
    const opaque = { type: 'opaque', status: 0, ok: false, headers: new Headers(), text: async () => '' } as unknown as Response
    const r2 = await submitRecord(record(), deps(fakeFetch(() => opaque).fetch))
    expect(r2.patch.uploadStatus).toBe('confirmationPending'); expect(r2.patch.lastErrorCode).toBe('OPAQUE_RESPONSE')
  })
  test('로컬 저장이 끝나지 않은 기록은 전송하지 않는다', async () => {
    const { fetch, calls } = fakeFetch(async () => json(await okAck()))
    const r = await submitRecord(record({ localSaveStatus: 'unpersisted' }), deps(fetch))
    expect(calls).toHaveLength(0); expect(r.outcome.kind).toBe('skipped')
  })
  test('canonical 32 KiB 초과는 보내지 않고 rejected(PAYLOAD_TOO_LARGE)', async () => {
    const big = { ...payload, clientAppVersion: 'x'.repeat(40_000) } as RecordPayload
    const { fetch, calls } = fakeFetch(async () => json(await okAck()))
    const r = await submitRecord({ ...record(), payload: big }, deps(fetch))
    expect(calls).toHaveLength(0); expect(r.patch.uploadStatus).toBe('rejected'); expect(r.patch.lastErrorCode).toBe('PAYLOAD_TOO_LARGE')
  })
})
