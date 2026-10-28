// Supabase 수신 본체(supabase/functions/_shared/submitCore.ts) — Apps Script doPost 시험(D01~D11, 정본 이상, 상류 실패, 오류 위생)을 같은 입력·같은 기대값으로 옮김.
// 저장소는 메모리 표(records)로 흉내 낸다. 잠금 대신 record_id 고유 제약(insertIfAbsent)과 경합 분기를 시험한다.
import { describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import legacyRecord from '../docs/design/examples/legacy/1.0.0/record.demo-aborted.json'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createTaskRun, attempt } from '../src/domain/taskEngine'
import { buildRecordPayload } from '../src/domain/record'
import { createDemoSession } from '../src/app/session'
import type { ApprovedTask } from '../src/domain/types'
import { payloadHash } from '../src/delivery/jcs'
import { handleSubmit, parseConfig, type NewRow, type StoredRow, type SubmitStore } from '../supabase/functions/_shared/submitCore'

const P = demo.payload
const id2 = '00000000-0000-4000-8000-000000000002'
const reqOf = (p: unknown) => JSON.stringify({ protocolVersion: '1', payload: p })
let n = 0
const aid = () => `40000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

function memStore(opts: { failRead?: () => boolean; corruptReadBack?: () => boolean; raceInsert?: () => boolean } = {}) {
  const rows: NewRow[] = []
  const ops: string[] = []
  const store: SubmitStore = {
    async findByRecordId(rid) {
      ops.push('read')
      if (opts.failRead?.()) throw new Error('db down')
      const found = rows.filter((r) => r.recordId === rid).map(({ recordId, receiptId, acceptedAt, payloadHash, payloadJson }): StoredRow => ({ recordId, receiptId, acceptedAt, payloadHash, payloadJson }))
      if (opts.corruptReadBack?.() && found[0]) found[0] = { ...found[0], payloadJson: found[0].payloadJson + ' ' }
      return found
    },
    async insertIfAbsent(row) {
      ops.push('insert')
      if (opts.raceInsert?.()) { rows.push({ ...row, receiptId: 'race-winner-receipt', acceptedAt: '2026-10-28T00:00:00.000Z' }); return 'exists' }
      if (rows.some((r) => r.recordId === row.recordId)) return 'exists'
      rows.push(row); return 'inserted'
    },
    async countRows() { return rows.length },
  }
  return { rows, ops, store }
}

function server(o: { acceptUntil?: string; maxNewRows?: string; now?: number; store?: ReturnType<typeof memStore> } = {}) {
  const s = o.store ?? memStore()
  let u = 0
  const post = (body: string, type: string | null = 'text/plain;charset=UTF-8') => handleSubmit(type, body, {
    store: s.store,
    config: () => parseConfig(o.acceptUntil ?? '2027-12-31T00:00:00Z', o.maxNewRows ?? '50'),
    now: () => o.now ?? Date.parse('2026-10-28T05:00:00.000Z'),
    uuid: () => `receipt-${String(++u).padStart(4, '0')}-${Math.random().toString(36).slice(2, 8)}`,
  })
  return { ...s, post }
}

describe('Supabase submit — Apps Script 수신 계약과 같은 결과', () => {
  test('S01 신규 접수: 표 1행, ack의 ID·receipt·UTC·hash가 행과 일치, hash는 학생 화면 계산과 같음', async () => {
    const { rows, post } = server()
    const ack: any = await post(reqOf(P))
    expect(ack).toMatchObject({ protocolVersion: '1', ok: true, recordId: P.recordId, duplicate: false })
    expect(ack.payloadHash).toBe(await payloadHash(P))
    expect(ack.receiptId).toMatch(/^[A-Za-z0-9-]{8,128}$/)
    expect(ack.acceptedAt.endsWith('Z')).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ recordId: P.recordId, receiptId: ack.receiptId, acceptedAt: ack.acceptedAt, payloadHash: ack.payloadHash, sessionCode: P.sessionCode, anonymousStudentCode: P.anonymousStudentCode })
    expect(JSON.parse(rows[0]!.payloadJson)).toEqual(P)
  })
  test('S02 같은 ID·같은 내용(키 순서·공백만 다름) 재전송: 최초 receipt·acceptedAt·hash 그대로, duplicate=true, 행 추가 없음', async () => {
    const { rows, post } = server()
    const first = await post(reqOf(P))
    const reordered = JSON.stringify({ payload: Object.fromEntries(Object.entries(P).reverse()), protocolVersion: '1' }, null, 2)
    expect(await post(reordered)).toEqual({ ...first, duplicate: true })
    expect(rows).toHaveLength(1)
  })
  test('S03 같은 ID·다른 내용 → RECORD_ID_CONFLICT, 기존 행 불변', async () => {
    const { rows, post } = server()
    await post(reqOf(P))
    const before = JSON.stringify(rows)
    expect(await post(reqOf({ ...P, clientAppVersion: '9.9.9-changed' }))).toEqual({ protocolVersion: '1', ok: false, code: 'RECORD_ID_CONFLICT', retryable: false, recordId: P.recordId })
    expect(JSON.stringify(rows)).toBe(before)
  })
  test('S04 동시 요청 경합(다른 요청이 먼저 넣음): 그 행 기준으로 duplicate 또는 충돌 판정, 새 행 없음', async () => {
    let race = true
    const s = memStore({ raceInsert: () => { const r = race; race = false; return r } })
    const { post } = server({ store: s })
    // 경합에서 이긴 행은 receipt만 다르고 원본·hash는 같다 → 같은 원본이므로 duplicate로 그 receipt를 돌려준다
    const r: any = await post(reqOf(P))
    expect(r).toMatchObject({ ok: true, duplicate: true, receiptId: 'race-winner-receipt', recordId: P.recordId })
    expect(s.rows).toHaveLength(1)
  })
  test('S06 잘못된 입력은 각각 거절되고 표 증가 0', async () => {
    const { rows, post } = server()
    const cases: Array<[string, string, string, string | null]> = [
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
      ['연구 목적·승인 주장', reqOf({ ...P, runPurpose: 'research', configurationApproval: { taskApproved: true, rulesetApproved: true, layoutConfirmed: true, researchUseApproved: true } }), 'SESSION_NOT_ALLOWED', 'text/plain'],
      ['합성 코드 패턴 밖(A-01)', reqOf({ ...P, anonymousStudentCode: 'A-01' }), 'SESSION_NOT_ALLOWED', 'text/plain'],
      ['MIME 틀림', reqOf(P), 'INVALID_PAYLOAD', 'application/json'],
      ['MIME 없음', reqOf(P), 'INVALID_PAYLOAD', null],
      ['정상 기록에 __proto__ 키', '{"protocolVersion":"1","payload":{"__proto__":{},' + JSON.stringify(P).slice(1) + '}', 'INVALID_PAYLOAD', 'text/plain'],
    ]
    for (const [name, body, code, type] of cases) {
      const r: any = await post(body, type)
      expect(r.ok, name).toBe(false); expect(r.code, name).toBe(code); expect(r.retryable, name).toBe(false)
    }
    expect(rows).toHaveLength(0)
  })
  test('MIME에 charset 매개변수가 붙어도 text/plain이면 받는다', async () => {
    expect((await server().post(reqOf(P), 'text/plain; charset=utf-8')).ok).toBe(true)
  })
  test('S09 크기 경계: 전체 48 KiB 초과와 canonical 32 KiB 초과 모두 PAYLOAD_TOO_LARGE, 잘림 없음', async () => {
    const { rows, post } = server()
    const ev = (i: number, extra: Record<string, string>) => ({ eventId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, sequence: i + 1, elapsedMs: i * 10, type: 'answerSubmitted', ...extra })
    const huge = { ...P, stepEvents: Array.from({ length: 200 }, (_, i) => ev(i, { stepId: 's'.repeat(64), reasonCode: 'r'.repeat(64), itemId: 'i'.repeat(64), feedbackKey: 'f'.repeat(64) })) }
    expect(await post(reqOf(huge))).toMatchObject({ ok: false, code: 'PAYLOAD_TOO_LARGE', retryable: false })
    const mid = { ...P, stepEvents: Array.from({ length: 150 }, (_, i) => ev(i, { stepId: 's'.repeat(64), reasonCode: 'r'.repeat(30) })) }
    expect(await post(reqOf(mid))).toMatchObject({ ok: false, code: 'PAYLOAD_TOO_LARGE', recordId: P.recordId })
    expect(rows).toHaveLength(0)
  })
  test('S11 접수 기간이 끝나면 신규는 SESSION_NOT_ALLOWED, 기존 receipt 회수는 된다', async () => {
    const s = memStore()
    const first = await server({ store: s }).post(reqOf(P))
    const closed = server({ store: s, acceptUntil: '2020-01-01T00:00:00Z' })
    expect(await closed.post(reqOf(P))).toEqual({ ...first, duplicate: true })
    expect(await closed.post(reqOf({ ...P, recordId: id2 }))).toMatchObject({ ok: false, code: 'SESSION_NOT_ALLOWED' })
    expect(s.rows).toHaveLength(1)
  })
  test('S11 설정이 비거나 잘못되면 신규 접수를 닫는다(fail-closed)', async () => {
    for (const [until, max] of [[undefined, '50'], ['2027-12-31T00:00:00Z', undefined], ['not-a-date', '50'], ['2027-12-31T00:00:00Z', '0'], ['2027-12-31T00:00:00Z', '1.5']] as const) {
      const r: any = await handleSubmit('text/plain', reqOf(P), { store: memStore().store, config: () => parseConfig(until, max), now: () => Date.now(), uuid: () => 'receipt-xxxxxxxx' })
      expect(r.code, `${until}/${max}`).toBe('SESSION_NOT_ALLOWED')
    }
  })
  test('S11 신규 건수 상한: 넘으면 RATE_LIMITED(retryable), 중복 회수는 상한에 세지 않음', async () => {
    const { rows, post } = server({ maxNewRows: '1' })
    expect((await post(reqOf(P))).ok).toBe(true)
    expect(((await post(reqOf(P))) as any).duplicate).toBe(true)
    expect(await post(reqOf({ ...P, recordId: id2 }))).toMatchObject({ ok: false, code: 'RATE_LIMITED', retryable: true })
    expect(rows).toHaveLength(1)
  })
  test('정본 이상(같은 ID 2행, hash 불일치, 시각 손상, recordId 불일치)은 CANONICAL_STORE_INVALID', async () => {
    const { rows, post } = server()
    await post(reqOf(P))
    rows.push({ ...rows[0]! })
    expect(await post(reqOf(P))).toMatchObject({ ok: false, code: 'CANONICAL_STORE_INVALID', retryable: false })
    rows.pop()
    const good = { ...rows[0]! }
    for (const bad of [{ payloadHash: 'f'.repeat(64) }, { acceptedAt: '2026-02-31T00:00:00Z' }, { payloadJson: 'null' }, { receiptId: '' }]) {
      rows[0] = { ...good, ...bad }
      expect(await post(reqOf(P)), JSON.stringify(bad)).toMatchObject({ ok: false, code: 'CANONICAL_STORE_INVALID' })
    }
    expect(rows).toHaveLength(1)
  })
  test('DB 읽기 실패·재읽기 불일치는 UPSTREAM_UNAVAILABLE(retryable)', async () => {
    expect(await server({ store: memStore({ failRead: () => true }) }).post(reqOf(P))).toMatchObject({ ok: false, code: 'UPSTREAM_UNAVAILABLE', retryable: true, recordId: P.recordId })
    let reads = 0
    const s = memStore({ corruptReadBack: () => ++reads > 1 })
    expect(await server({ store: s }).post(reqOf(P))).toMatchObject({ ok: false, code: 'UPSTREAM_UNAVAILABLE', retryable: true })
  })
  test('오류 응답에는 원문·내부 정보가 없다', async () => {
    const r = await server().post('{"protocolVersion":"1","payload":{"secret":"DO-NOT-ECHO"}}')
    expect(JSON.stringify(r)).not.toContain('DO-NOT-ECHO')
    expect(Object.keys(r).sort()).toEqual(['code', 'ok', 'protocolVersion', 'retryable'])
  })
  test('legacy 1.0.0 예시 기록은 접수되고 같은 ID 재전송은 duplicate', async () => {
    const { post } = server()
    expect(await post(reqOf(legacyRecord))).toMatchObject({ ok: true, recordId: legacyRecord.recordId, duplicate: false })
    expect(await post(reqOf(legacyRecord))).toMatchObject({ ok: true, duplicate: true })
  })
  test('앱이 만든 실제 세션(합성 코드 D-01)으로 만든 기록은 접수되고, 신규마다 receipt가 다르다', async () => {
    const task = lv1 as ApprovedTask
    const session = createDemoSession({ studentCode: 'D-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', vehicleEntryDirection: 'south', task, difficultyMode: 'guided' })
    let run = createTaskRun(task, { difficultyMode: 'guided', displayMode: 'threeD' })
    run = attempt(run, { type: 'step', stepId: 'ppe' }, aid()).run
    const payload = buildRecordPayload(run, session, { completedAtIso: new Date(run.startedAtMs + 5000).toISOString(), completionStatus: 'aborted' })
    const { rows, post } = server()
    const a: any = await post(reqOf(payload))
    const b: any = await post(reqOf(P))
    expect(a).toMatchObject({ ok: true, recordId: payload.recordId, duplicate: false })
    expect(b.ok).toBe(true); expect(a.receiptId).not.toBe(b.receiptId)
    expect(rows).toHaveLength(2)
  })
})
