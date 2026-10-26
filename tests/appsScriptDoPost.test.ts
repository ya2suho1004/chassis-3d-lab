import { describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import { payloadHash } from '../src/delivery/jcs'
import { loadGs, fakeUtilities } from './helpers/gs'
import { fakeSheetServices } from './helpers/gsServices'

const PROPS = { SHEET_ID: 'SHEET-TEST', TAB_NAME: 'canonical', ALLOWED_SESSION_CODES: 'DEMO-ONLY', ALLOWED_SNAPSHOT_IDS: '00000000-0000-4000-8000-000000000004', ACCEPT_UNTIL: '2027-12-31T00:00:00Z', MAX_NEW_ROWS: '50', LOCK_WAIT_MS: '10000' }
const FILES = ['Jcs.gs', 'JsonStrict.gs', 'Validate.gs', 'Schemas.gs', 'DemoSnapshots.gs', 'Code.gs']
function server(opts: Parameters<typeof fakeSheetServices>[0] = {}) {
  const svc = fakeSheetServices({ props: PROPS, ...opts })
  const gs = loadGs(FILES, { ...svc, Utilities: fakeUtilities })
  const post = (body: string, type = 'text/plain;charset=UTF-8') => JSON.parse(gs.doPost({ postData: { contents: body, type, length: Buffer.byteLength(body, 'utf8') } }).text)
  return { gs, svc, post }
}
const reqOf = (p: unknown) => JSON.stringify({ protocolVersion: '1', payload: p })
const P = demo.payload
const id2 = '00000000-0000-4000-8000-000000000002'

describe('doPost — 설계 15 §3~§5 수신 계약 (시트 모의)', () => {
  test('D01 신규 접수: 정본 1행(5열), ack의 ID·receipt·UTC·hash가 행과 일치, duplicate=false', async () => {
    const { svc, post } = server()
    const ack = post(reqOf(P))
    expect(ack).toMatchObject({ protocolVersion: '1', ok: true, recordId: P.recordId, duplicate: false })
    expect(ack.payloadHash).toBe(await payloadHash(P))
    expect(ack.receiptId).toMatch(/^[A-Za-z0-9-]{8,128}$/); expect(Date.parse(ack.acceptedAt)).not.toBeNaN(); expect(ack.acceptedAt.endsWith('Z')).toBe(true)
    expect(svc.rows).toHaveLength(2)
    const row = svc.rows[1]!
    expect(row).toEqual([P.recordId, ack.receiptId, ack.acceptedAt, ack.payloadHash, expect.any(String)])
    expect(JSON.parse(row[4] as string)).toEqual(P) // canonical JSON 전체
    expect(svc.lock.acquired).toBe(1); expect(svc.lock.released).toBe(1); expect(svc.flushes()).toBeGreaterThanOrEqual(1)
  })
  test('D02 같은 ID·같은 내용(키 순서·공백만 다름) 재전송: 최초 receipt·acceptedAt·hash 그대로, duplicate=true, 행 추가 없음', async () => {
    const { svc, post } = server()
    const first = post(reqOf(P))
    const reordered = JSON.stringify({ payload: Object.fromEntries(Object.entries(P).reverse()), protocolVersion: '1' }, null, 2)
    const again = post(reordered)
    expect(again).toEqual({ ...first, duplicate: true })
    expect(svc.rows).toHaveLength(2)
  })
  test('D03 같은 ID·다른 내용 → RECORD_ID_CONFLICT, 기존 행 불변, 새 행·새 ID 없음', () => {
    const { svc, post } = server()
    post(reqOf(P))
    const before = JSON.stringify(svc.rows)
    const r = post(reqOf({ ...P, clientAppVersion: '9.9.9-changed' }))
    expect(r).toEqual({ protocolVersion: '1', ok: false, code: 'RECORD_ID_CONFLICT', retryable: false, recordId: P.recordId })
    expect(JSON.stringify(svc.rows)).toBe(before)
  })
  test('D05 잠금 실패 → LOCK_BUSY(retryable), 쓰기 없음', () => {
    const { svc, post } = server({ lockBusy: () => true })
    expect(post(reqOf(P))).toEqual({ protocolVersion: '1', ok: false, code: 'LOCK_BUSY', retryable: true, recordId: P.recordId })
    expect(svc.rows).toHaveLength(1)
  })
  test('D06 잘못된 입력은 각각 거절되고 정본 증가 0', () => {
    const { svc, post } = server()
    const cases: Array<[string, string, string, string]> = [
      ['빈 본문', '', 'INVALID_PAYLOAD', 'text/plain'],
      ['잘못된 JSON', '{bad', 'INVALID_PAYLOAD', 'text/plain'],
      ['다중 문서', reqOf(P) + reqOf(P), 'INVALID_PAYLOAD', 'text/plain'],
      ['중복 키', '{"protocolVersion":"1","protocolVersion":"1","payload":{}}', 'INVALID_PAYLOAD', 'text/plain'],
      ['추가 필드(deliveryEnvelope)', JSON.stringify({ protocolVersion: '1', payload: P, deliveryEnvelope: {} }), 'INVALID_PAYLOAD', 'text/plain'],
      ['protocol 2', JSON.stringify({ protocolVersion: '2', payload: P }), 'INVALID_PAYLOAD', 'text/plain'],
      ['payload 이중 인코딩', JSON.stringify({ protocolVersion: '1', payload: JSON.stringify(P) }), 'INVALID_PAYLOAD', 'text/plain'],
      ['지원하지 않는 schemaVersion', reqOf({ ...P, schemaVersion: '0.9.0' }), 'UNSUPPORTED_SCHEMA', 'text/plain'],
      ['잘못된 UUID', reqOf({ ...P, recordId: 'nope' }), 'INVALID_PAYLOAD', 'text/plain'],
      ['없는 세션', reqOf({ ...P, sessionCode: 'REAL-CLASS' }), 'SESSION_NOT_ALLOWED', 'text/plain'],
      ['없는 스냅샷', reqOf({ ...P, sessionSnapshotId: '00000000-0000-4000-8000-0000000000aa' }), 'SESSION_NOT_ALLOWED', 'text/plain'],
      ['연구 목적·승인 주장(스키마상 유효)', reqOf({ ...P, runPurpose: 'research', configurationApproval: { taskApproved: true, rulesetApproved: true, layoutConfirmed: true, researchUseApproved: true } }), 'SESSION_NOT_ALLOWED', 'text/plain'],
      ['MIME 틀림', reqOf(P), 'INVALID_PAYLOAD', 'application/json'],
    ]
    for (const [name, body, code, type] of cases) {
      const r = post(body, type)
      expect(r.ok, name).toBe(false); expect(r.code, name).toBe(code); expect(r.retryable, name).toBe(false)
      expect(Object.keys(r).sort(), name).toEqual(expect.arrayContaining(['protocolVersion', 'ok', 'code', 'retryable']))
    }
    expect(svc.rows).toHaveLength(1)
  })
  test('MIME에 charset 매개변수가 붙어도 text/plain이면 받는다', () => {
    const { post } = server()
    expect(post(reqOf(P), 'text/plain; charset=utf-8').ok).toBe(true)
  })
  test('D09 크기 경계: 전체 48 KiB 초과(본문 검사)와 canonical 32 KiB 초과(정규형 검사) 모두 PAYLOAD_TOO_LARGE, 잘림 없음', () => {
    const { svc, post } = server()
    const ev = (i: number, extra: Record<string, string>) => ({ eventId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, sequence: i + 1, elapsedMs: i * 10, type: 'answerSubmitted', ...extra })
    const huge = { ...P, stepEvents: Array.from({ length: 200 }, (_, i) => ev(i, { stepId: 's'.repeat(64), reasonCode: 'r'.repeat(64), itemId: 'i'.repeat(64), feedbackKey: 'f'.repeat(64) })) }
    const hugeBody = reqOf(huge)
    expect(Buffer.byteLength(hugeBody, 'utf8')).toBeGreaterThan(48 * 1024)
    expect(post(hugeBody)).toMatchObject({ ok: false, code: 'PAYLOAD_TOO_LARGE', retryable: false })
    const mid = { ...P, stepEvents: Array.from({ length: 150 }, (_, i) => ev(i, { stepId: 's'.repeat(64), reasonCode: 'r'.repeat(30) })) }
    const midBody = reqOf(mid)
    expect(Buffer.byteLength(midBody, 'utf8')).toBeLessThan(48 * 1024); expect(Buffer.byteLength(midBody, 'utf8')).toBeGreaterThan(32 * 1024)
    expect(post(midBody)).toMatchObject({ ok: false, code: 'PAYLOAD_TOO_LARGE', retryable: false, recordId: P.recordId })
    const okSize = { ...P, stepEvents: Array.from({ length: 60 }, (_, i) => ev(i, { stepId: 'press' })) }
    expect(post(reqOf(okSize)).ok).toBe(true)
    expect(svc.rows).toHaveLength(2)
  })
  test('D11 접수 창 종료 뒤 신규는 SESSION_NOT_ALLOWED이지만 기존 정본의 receipt 회수는 된다', () => {
    const svcOpen = fakeSheetServices({ props: PROPS })
    const gs = loadGs(FILES, { ...svcOpen, Utilities: fakeUtilities })
    const first = JSON.parse(gs.doPost({ postData: { contents: reqOf(P), type: 'text/plain' } }).text)
    // 같은 시트를 접수 창이 닫힌 설정으로 다시 연다
    const closed = { ...svcOpen, PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => (k === 'ACCEPT_UNTIL' ? '2020-01-01T00:00:00Z' : PROPS[k as keyof typeof PROPS] ?? null) }) } }
    const gs2 = loadGs(FILES, { ...closed, Utilities: fakeUtilities })
    const dup = JSON.parse(gs2.doPost({ postData: { contents: reqOf(P), type: 'text/plain' } }).text)
    expect(dup).toEqual({ ...first, duplicate: true })
    const fresh = JSON.parse(gs2.doPost({ postData: { contents: reqOf({ ...P, recordId: id2 }), type: 'text/plain' } }).text)
    expect(fresh).toMatchObject({ ok: false, code: 'SESSION_NOT_ALLOWED' })
    expect(svcOpen.rows).toHaveLength(2)
  })
  test('D11 신규행 상한: MAX_NEW_ROWS를 넘는 신규 접수는 RATE_LIMITED, 중복 회수는 상한에 세지 않음', () => {
    const { svc, post } = server({ props: { ...PROPS, MAX_NEW_ROWS: '1' } })
    expect(post(reqOf(P)).ok).toBe(true)
    expect(post(reqOf(P)).duplicate).toBe(true)
    expect(post(reqOf({ ...P, recordId: id2 }))).toMatchObject({ ok: false, code: 'RATE_LIMITED', retryable: true })
    expect(svc.rows).toHaveLength(2)
  })
  test('정본 이상(같은 ID 2행·hash 불일치)은 CANONICAL_STORE_INVALID, 정상 ack 없음·행 수정 없음', async () => {
    const { svc, post } = server()
    post(reqOf(P))
    svc.rows.push([...svc.rows[1]!]) // 같은 ID 2행
    expect(post(reqOf(P))).toMatchObject({ ok: false, code: 'CANONICAL_STORE_INVALID', retryable: false })
    svc.rows.pop(); svc.rows[1]![3] = 'f'.repeat(64) // 저장 hash가 원본과 다름
    expect(post(reqOf(P))).toMatchObject({ ok: false, code: 'CANONICAL_STORE_INVALID' })
    expect(svc.rows).toHaveLength(2)
  })
  test('flush·재읽기 실패는 UPSTREAM_UNAVAILABLE(retryable)이고 잠금은 해제된다', () => {
    let fail = false
    const { svc, post } = server({ failFlush: () => fail })
    fail = true
    expect(post(reqOf(P))).toMatchObject({ ok: false, code: 'UPSTREAM_UNAVAILABLE', retryable: true })
    expect(svc.lock.released).toBe(1)
  })
  test('오류 응답에는 raw body·스택·Sheet ID·이메일이 없다', () => {
    const { post } = server()
    const r = post('{"protocolVersion":"1","payload":{"secret":"DO-NOT-ECHO"}}')
    expect(JSON.stringify(r)).not.toContain('DO-NOT-ECHO'); expect(JSON.stringify(r)).not.toContain('SHEET-TEST')
  })
})
