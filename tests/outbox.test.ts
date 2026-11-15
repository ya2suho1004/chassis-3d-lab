import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import { openRepository, type Repository } from '../src/records/repository'
import { processOutbox, STUDENT_NUMBER_OUTSIDE_CLASS } from '../src/delivery/outbox'
import { resendableRejected } from '../src/delivery/submit'
import { payloadHash } from '../src/delivery/jcs'
import type { RecordPayload } from '../src/domain/record'

const base = demo.payload as unknown as RecordPayload
const NOW = new Date('2026-10-26T09:00:00Z')
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const withId = (n: number): RecordPayload => ({ ...base, recordId: id(n) })
/** 수업용 세션 기록(가짜 학번) */
const classRec = (n: number, sessionCode = 'CLS-L12', code = '2211'): RecordPayload => ({ ...base, recordId: id(n), sessionCode, classConditionCode: 'CLS', anonymousStudentCode: code })
/** 시연 세션에 학번 형식으로 남은 기록 */
const demoStudent = (n: number, code = '3999'): RecordPayload => ({ ...base, recordId: id(n), anonymousStudentCode: code })
const recorder = (reply: (rid: string) => Promise<Response>) => {
  const sent: string[] = []
  const f = (async (_u: string, init: RequestInit) => { const rid = JSON.parse(init.body as string).payload.recordId as string; sent.push(rid); return reply(rid) }) as unknown as typeof fetch
  return { sent, f }
}
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
const ok = async (p: RecordPayload, receipt = 'R-' + p.recordId.slice(-4), duplicate = false) => json({ protocolVersion: '1', ok: true, recordId: p.recordId, receiptId: receipt, acceptedAt: '2026-10-26T09:00:01Z', payloadHash: await payloadHash(p), duplicate })

let repo: Repository
beforeEach(async () => { indexedDB = new IDBFactory(); repo = await openRepository() })

describe('대기열(outbox) 처리', () => {
  test('pending 기록을 보내 acknowledged로 저장하고, 저장 완료 뒤에만 결과를 돌려준다', async () => {
    const p = withId(1); await repo.freezeRecord(p)
    const sent: string[] = []
    const f = (async (_u: string, init: RequestInit) => { sent.push(JSON.parse(init.body as string).payload.recordId); return ok(p) }) as unknown as typeof fetch
    const res = await processOutbox(repo, { fetch: f, endpointUrl: 'https://x/exec', now: () => NOW })
    expect(sent).toEqual([id(1)])
    expect(res).toEqual([{ recordId: id(1), outcome: 'acknowledged', code: null }])
    const stored = await repo.loadRecord(id(1))
    expect(stored?.envelope).toMatchObject({ uploadStatus: 'acknowledged', receiptId: 'R-0001', uploadAttemptCount: 1 })
    expect(await repo.listOutbox()).toHaveLength(0)
  })
  test('acknowledged·rejected·conflict는 자동 재전송하지 않고, nextRetryAt이 미래면 건너뛴다', async () => {
    for (const n of [1, 2, 3, 4, 5]) await repo.freezeRecord(withId(n))
    await repo.updateEnvelope(id(1), { uploadStatus: 'acknowledged', receiptId: 'R', uploadedAt: NOW.toISOString(), payloadHash: 'a'.repeat(64) })
    await repo.updateEnvelope(id(2), { uploadStatus: 'rejected', lastErrorCode: 'INVALID_PAYLOAD' })
    await repo.updateEnvelope(id(3), { uploadStatus: 'conflict', lastErrorCode: 'RECORD_ID_CONFLICT' })
    await repo.updateEnvelope(id(4), { uploadStatus: 'pending', nextRetryAt: new Date(NOW.getTime() + 60_000).toISOString() })
    const sent: string[] = []
    const f = (async (_u: string, init: RequestInit) => { const rid = JSON.parse(init.body as string).payload.recordId; sent.push(rid); return ok(withId(5)) }) as unknown as typeof fetch
    const res = await processOutbox(repo, { fetch: f, endpointUrl: 'https://x/exec', now: () => NOW })
    expect(sent).toEqual([id(5)])
    expect(res.map((r) => [r.recordId, r.outcome])).toEqual([[id(2), 'skipped'], [id(3), 'skipped'], [id(4), 'skipped'], [id(5), 'acknowledged']])
  })
  test('새로고침으로 남은 uploading 기록은 confirmationPending으로 보고 같은 ID로 재전송한다(D04)', async () => {
    const p = withId(7); await repo.freezeRecord(p)
    await repo.updateEnvelope(id(7), { uploadStatus: 'uploading', uploadAttemptCount: 1 })
    const f = (async () => ok(p, 'R-first', true)) as unknown as typeof fetch
    const res = await processOutbox(repo, { fetch: f, endpointUrl: 'https://x/exec', now: () => NOW })
    expect(res[0]?.outcome).toBe('acknowledged')
    const stored = await repo.loadRecord(id(7))
    expect(stored?.envelope.receiptId).toBe('R-first'); expect(stored?.envelope.uploadAttemptCount).toBe(2)
  })
  test('전송 중에는 uploading으로 표시하고, 응답 유실이면 confirmationPending과 재시도 시각을 남긴다', async () => {
    const p = withId(8); await repo.freezeRecord(p)
    let during: string | undefined
    const f = (async () => { during = (await repo.loadRecord(id(8)))?.envelope.uploadStatus; throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    const res = await processOutbox(repo, { fetch: f, endpointUrl: 'https://x/exec', now: () => NOW })
    expect(during).toBe('uploading')
    expect(res[0]).toEqual({ recordId: id(8), outcome: 'confirmationPending', code: 'NETWORK_ERROR' })
    const env = (await repo.loadRecord(id(8)))!.envelope
    expect(env.uploadStatus).toBe('confirmationPending'); expect(env.nextRetryAt).toBe(new Date(NOW.getTime() + 30_000).toISOString())
  })
  test('force 옵션이면 교사 조작으로 nextRetryAt을 무시하고 보낸다(rejected·conflict는 여전히 제외)', async () => {
    const p = withId(9); await repo.freezeRecord(p)
    await repo.updateEnvelope(id(9), { uploadStatus: 'confirmationPending', nextRetryAt: new Date(NOW.getTime() + 60_000).toISOString() })
    await repo.freezeRecord(withId(10)); await repo.updateEnvelope(id(10), { uploadStatus: 'rejected' })
    const f = (async () => ok(p)) as unknown as typeof fetch
    const res = await processOutbox(repo, { fetch: f, endpointUrl: 'https://x/exec', now: () => NOW }, { force: true })
    expect(res.map((r) => [r.recordId, r.outcome])).toEqual([[id(9), 'acknowledged'], [id(10), 'skipped']])
  })
  test('서버가 기록 판을 몰라 거절한(UNSUPPORTED_SCHEMA) 기록은 교사가 보내면 다시 보낸다(다른 거절은 그대로 건너뜀)', async () => {
    const p = withId(20); await repo.freezeRecord(p)
    await repo.updateEnvelope(id(20), { uploadStatus: 'rejected', lastErrorCode: 'UNSUPPORTED_SCHEMA', nextRetryAt: null })
    await repo.freezeRecord(withId(21))
    await repo.updateEnvelope(id(21), { uploadStatus: 'rejected', lastErrorCode: 'SESSION_NOT_ALLOWED', nextRetryAt: null })
    const sent: string[] = []
    const f = (async (_u: string, init: RequestInit) => { sent.push(JSON.parse(init.body as string).payload.recordId); return ok(p) }) as unknown as typeof fetch
    const res = await processOutbox(repo, { fetch: f, endpointUrl: 'https://x/exec', now: () => NOW })
    expect(sent).toEqual([id(20)])
    expect(res.find((r) => r.recordId === id(20))).toEqual({ recordId: id(20), outcome: 'acknowledged', code: null })
    expect(res.find((r) => r.recordId === id(21))?.outcome).toBe('skipped')
  })

  test('안전장치 2: 수업용 세션 기록이 세션 허용 안 됨으로 거절됐으면 교사 전송(보통·강제)으로 다시 보낸다. 다른 세션의 같은 거절은 그대로 건너뜀', async () => {
    for (const [n, p] of [[30, classRec(30)], [31, classRec(31, 'CLS-L5', '1105')], [32, withId(32)]] as const) {
      await repo.freezeRecord(p); await repo.updateEnvelope(id(n), { uploadStatus: 'rejected', lastErrorCode: 'SESSION_NOT_ALLOWED', nextRetryAt: null })
    }
    expect(resendableRejected((await repo.loadRecord(id(30)))!)).toBe(true)
    expect(resendableRejected((await repo.loadRecord(id(32)))!)).toBe(false)
    const { sent, f } = recorder(async (rid) => ok(rid === id(30) ? classRec(30) : classRec(31, 'CLS-L5', '1105')))
    const first = await processOutbox(repo, { fetch: f, endpointUrl: 'https://x/exec', now: () => NOW })
    expect(sent).toEqual([id(30), id(31)])
    expect(first.find((r) => r.recordId === id(32))).toEqual({ recordId: id(32), outcome: 'skipped', code: 'SESSION_NOT_ALLOWED' })
    expect((await repo.loadRecord(id(30)))!.envelope.uploadStatus).toBe('acknowledged')
    expect((await repo.loadRecord(id(31)))!.envelope.uploadStatus).toBe('acknowledged')
    // 강제 재전송도 같은 규칙
    const p = classRec(33); await repo.freezeRecord(p); await repo.updateEnvelope(id(33), { uploadStatus: 'rejected', lastErrorCode: 'SESSION_NOT_ALLOWED', nextRetryAt: null })
    const res = await processOutbox(repo, { fetch: (async () => ok(p)) as unknown as typeof fetch, endpointUrl: 'https://x/exec', now: () => NOW }, { force: true })
    expect(res.find((r) => r.recordId === id(33))?.outcome).toBe('acknowledged')
  })
  test('안전장치 1: 수업용이 아닌 세션(시연·리허설)에 학번 형식으로 남은 기록은 교사가 보내도 보내지 않고 건너뛴다(기록·상태 그대로)', async () => {
    await repo.freezeRecord(demoStudent(40))
    await repo.freezeRecord({ ...demoStudent(41, '2211'), sessionCode: 'REH-L12', classConditionCode: 'REH' })
    await repo.freezeRecord(withId(42)) // 시연 세션 D-00: 지금처럼 보낸다
    for (const force of [false, true]) {
      const { sent, f } = recorder(async () => ok(withId(42)))
      const res = await processOutbox(repo, { fetch: f, endpointUrl: 'https://x/exec', now: () => NOW }, { force })
      expect(sent).toEqual(force ? [] : [id(42)])
      expect(res.find((r) => r.recordId === id(40))).toEqual({ recordId: id(40), outcome: 'skipped', code: STUDENT_NUMBER_OUTSIDE_CLASS })
      expect(res.find((r) => r.recordId === id(41))).toEqual({ recordId: id(41), outcome: 'skipped', code: STUDENT_NUMBER_OUTSIDE_CLASS })
    }
    for (const n of [40, 41]) expect((await repo.loadRecord(id(n)))!.envelope).toMatchObject({ uploadStatus: 'pending', uploadAttemptCount: 0, lastErrorCode: null })
  })
})

describe('자동 전송 모드(설계 2026-11-15 §3-3)', () => {
  const auto = { auto: true } as const
  test('수업용 세션 기록만 보낸다. 시연·리허설 기록은 건드리지 않고 결과에도 넣지 않는다', async () => {
    await repo.freezeRecord(withId(50)) // 시연 D-00
    await repo.freezeRecord({ ...withId(51), sessionCode: 'REH-L12', classConditionCode: 'REH', anonymousStudentCode: 'D-07' })
    await repo.freezeRecord(classRec(52))
    await repo.freezeRecord(classRec(53, 'CLS-L5', '1101'))
    const { sent, f } = recorder(async (rid) => ok(rid === id(52) ? classRec(52) : classRec(53, 'CLS-L5', '1101')))
    const res = await processOutbox(repo, { fetch: f, endpointUrl: 'https://x/exec', now: () => NOW }, auto)
    expect(sent).toEqual([id(52), id(53)])
    expect(res.map((r) => [r.recordId, r.outcome])).toEqual([[id(52), 'acknowledged'], [id(53), 'acknowledged']])
    for (const n of [50, 51]) expect((await repo.loadRecord(id(n)))!.envelope).toMatchObject({ uploadStatus: 'pending', uploadAttemptCount: 0 })
  })
  test('재시도 대기 시각을 지킨다(force 아님): 시각 전이면 건너뛰고, 지나면 같은 ID로 다시 보낸다', async () => {
    const p = classRec(54); await repo.freezeRecord(p)
    const down = recorder(async () => { throw new TypeError('Failed to fetch') })
    expect(await processOutbox(repo, { fetch: down.f, endpointUrl: 'https://x/exec', now: () => NOW }, auto)).toEqual([{ recordId: id(54), outcome: 'confirmationPending', code: 'NETWORK_ERROR' }])
    const early = recorder(async () => ok(p))
    const r1 = await processOutbox(repo, { fetch: early.f, endpointUrl: 'https://x/exec', now: () => new Date(NOW.getTime() + 10_000) }, auto)
    expect(early.sent).toEqual([]); expect(r1).toEqual([{ recordId: id(54), outcome: 'skipped', code: 'RETRY_LATER' }])
    const later = recorder(async () => ok(p))
    const r2 = await processOutbox(repo, { fetch: later.f, endpointUrl: 'https://x/exec', now: () => new Date(NOW.getTime() + 31_000) }, auto)
    expect(later.sent).toEqual([id(54)]); expect(r2[0]?.outcome).toBe('acknowledged')
    expect((await repo.loadRecord(id(54)))!.envelope.uploadAttemptCount).toBe(2)
  })
  test('거절·충돌 기록은 자동으로 다시 보내지 않는다(교사가 다시 보낼 수 있는 거절도)', async () => {
    for (const [n, code, st] of [[55, 'SESSION_NOT_ALLOWED', 'rejected'], [56, 'UNSUPPORTED_SCHEMA', 'rejected'], [57, 'RECORD_ID_CONFLICT', 'conflict']] as const) {
      await repo.freezeRecord(classRec(n)); await repo.updateEnvelope(id(n), { uploadStatus: st, lastErrorCode: code, nextRetryAt: null })
    }
    const { sent, f } = recorder(async () => ok(classRec(55)))
    const res = await processOutbox(repo, { fetch: f, endpointUrl: 'https://x/exec', now: () => NOW }, auto)
    expect(sent).toEqual([])
    expect(res.map((r) => r.outcome)).toEqual(['skipped', 'skipped', 'skipped'])
  })
  test('시도 상한이 없다: 교사 전송으로 상한에 닿아 재시도 시각이 빈 기록도 사유가 재시도할 수 있는 것이면 다시 보내고, 실패해도 재시도 시각이 계속 잡힌다(최대 10분)', async () => {
    const p = classRec(58); await repo.freezeRecord(p)
    await repo.updateEnvelope(id(58), { uploadStatus: 'confirmationPending', uploadAttemptCount: 8, lastErrorCode: 'NETWORK_ERROR', nextRetryAt: null })
    const down = recorder(async () => { throw new TypeError('Failed to fetch') })
    expect(await processOutbox(repo, { fetch: down.f, endpointUrl: 'https://x/exec', now: () => NOW }, auto)).toEqual([{ recordId: id(58), outcome: 'confirmationPending', code: 'NETWORK_ERROR' }])
    expect(down.sent).toEqual([id(58)])
    const env = (await repo.loadRecord(id(58)))!.envelope
    expect(env.uploadAttemptCount).toBe(9)
    expect(env.nextRetryAt).toBe(new Date(NOW.getTime() + 10 * 60_000).toISOString())
    // 교사 전송은 지금 규칙(상한 8) 그대로 — 상한을 넘은 실패는 재시도 시각을 비운다
    await repo.updateEnvelope(id(58), { nextRetryAt: null })
    await processOutbox(repo, { fetch: down.f, endpointUrl: 'https://x/exec', now: () => NOW })
    expect((await repo.loadRecord(id(58)))!.envelope.nextRetryAt).toBeNull()
  })
  test('다시 보내도 소용없는 사유(서버 이상·접수 정보 불일치)로 재시도 시각이 빈 기록은 자동으로 다시 보내지 않는다 — 교사 전송으로만', async () => {
    for (const [n, code] of [[60, 'CANONICAL_STORE_INVALID'], [61, 'RECEIPT_MISMATCH'], [62, 'ACCEPTED_AT_MISMATCH']] as const) {
      await repo.freezeRecord(classRec(n)); await repo.updateEnvelope(id(n), { uploadStatus: 'confirmationPending', uploadAttemptCount: 1, lastErrorCode: code, nextRetryAt: null })
    }
    const a = recorder(async () => ok(classRec(60)))
    expect((await processOutbox(repo, { fetch: a.f, endpointUrl: 'https://x/exec', now: () => NOW }, auto)).map((r) => r.code)).toEqual(['NO_AUTO_RETRY', 'NO_AUTO_RETRY', 'NO_AUTO_RETRY'])
    expect(a.sent).toEqual([])
    const t = recorder(async (rid) => ok(classRec(Number(rid.slice(-2)))))
    await processOutbox(repo, { fetch: t.f, endpointUrl: 'https://x/exec', now: () => NOW })
    expect(t.sent).toEqual([id(60), id(61), id(62)])
  })
  test('인터넷이 끊겨 있으면(online=false) 시도하지 않는다 — 시도 횟수·상태를 건드리지 않음', async () => {
    await repo.freezeRecord(classRec(63))
    const a = recorder(async () => ok(classRec(63)))
    const res = await processOutbox(repo, { fetch: a.f, endpointUrl: 'https://x/exec', now: () => NOW, online: () => false }, auto)
    expect(a.sent).toEqual([])
    expect(res).toEqual([{ recordId: id(63), outcome: 'skipped', code: 'OFFLINE' }])
    expect((await repo.loadRecord(id(63)))!.envelope).toMatchObject({ uploadStatus: 'pending', uploadAttemptCount: 0, lastErrorCode: null, nextRetryAt: null })
    // 교사 전송은 지금처럼 시도한다(끊김이면 NETWORK_ERROR로 알려 줌)
    const t = recorder(async () => ok(classRec(63)))
    await processOutbox(repo, { fetch: t.f, endpointUrl: 'https://x/exec', now: () => NOW, online: () => false })
    expect(t.sent).toEqual([id(63)])
  })
  test('online 신호로 불린 자동 전송은 NETWORK_ERROR 기록의 재시도 시각을 무시하고, 다른 사유는 재시도 시각을 지킨다', async () => {
    const later = new Date(NOW.getTime() + 5 * 60_000).toISOString()
    await repo.freezeRecord(classRec(64)); await repo.updateEnvelope(id(64), { uploadStatus: 'confirmationPending', uploadAttemptCount: 3, lastErrorCode: 'NETWORK_ERROR', nextRetryAt: later })
    await repo.freezeRecord(classRec(65)); await repo.updateEnvelope(id(65), { uploadStatus: 'confirmationPending', uploadAttemptCount: 3, lastErrorCode: 'TIMEOUT', nextRetryAt: later })
    const plain = recorder(async () => ok(classRec(64)))
    expect((await processOutbox(repo, { fetch: plain.f, endpointUrl: 'https://x/exec', now: () => NOW }, auto)).map((r) => r.code)).toEqual(['RETRY_LATER', 'RETRY_LATER'])
    const sig = recorder(async () => ok(classRec(64)))
    const res = await processOutbox(repo, { fetch: sig.f, endpointUrl: 'https://x/exec', now: () => NOW }, { auto: true, onlineSignal: true })
    expect(sig.sent).toEqual([id(64)])
    expect(res.map((r) => [r.recordId, r.outcome, r.code])).toEqual([[id(64), 'acknowledged', null], [id(65), 'skipped', 'RETRY_LATER']])
  })
  test('새로고침으로 남은 uploading 수업용 기록은 같은 ID로 다시 확인한다', async () => {
    const p = classRec(59); await repo.freezeRecord(p)
    await repo.updateEnvelope(id(59), { uploadStatus: 'uploading', uploadAttemptCount: 1 })
    const { sent, f } = recorder(async () => ok(p, 'R-first', true))
    const res = await processOutbox(repo, { fetch: f, endpointUrl: 'https://x/exec', now: () => NOW }, auto)
    expect(sent).toEqual([id(59)]); expect(res[0]?.outcome).toBe('acknowledged')
  })
})

describe('교사 화면 전송 결과 문구 — 수업 자료 모으기 안전장치', () => {
  test('수업용이 아닌 세션의 학번 기록을 건너뛴 까닭과 할 일이 보인다', async () => {
    const { sendResultLabel } = await import('../src/delivery/sendLabel')
    const t = sendResultLabel({ recordId: 'abc', outcome: 'skipped', code: STUDENT_NUMBER_OUTSIDE_CLASS })
    expect(t).toMatch(/수업용 세션이 아니/); expect(t).toMatch(/학번/); expect(t).toMatch(/보내지 않/); expect(t).toMatch(/내려받/)
  })
})

describe('전송이 겹치지 않게(전송함 처리 한 줄 세우기)', () => {
  test('교사 전송과 자동 전송을 동시에 불러도 같은 기록의 fetch는 한 번이고 최종 상태는 acknowledged', async () => {
    const p = classRec(70); await repo.freezeRecord(p)
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    let calls = 0
    const f = (async () => { calls++; await gate; return ok(p) }) as unknown as typeof fetch
    const deps = { fetch: f, endpointUrl: 'https://x/exec', now: () => NOW }
    const teacher = processOutbox(repo, deps, { force: true })
    const auto = processOutbox(repo, deps, { auto: true, onlineSignal: true })
    const teacher2 = processOutbox(repo, deps)
    await new Promise((r) => setTimeout(r, 20))
    expect(calls).toBe(1)
    release()
    const [a, b, c] = await Promise.all([teacher, auto, teacher2])
    expect(calls).toBe(1)
    expect(a).toEqual([{ recordId: id(70), outcome: 'acknowledged', code: null }])
    expect(b).toEqual([]); expect(c).toEqual([])
    expect((await repo.loadRecord(id(70)))!.envelope).toMatchObject({ uploadStatus: 'acknowledged', uploadAttemptCount: 1 })
  })
  test('앞 처리가 실패해도 뒤 처리는 돈다', async () => {
    const p = classRec(71); await repo.freezeRecord(p)
    const broken = { ...repo, listOutbox: async () => { throw new Error('idb') } } as Repository
    const first = processOutbox(broken, { fetch: (async () => ok(p)) as unknown as typeof fetch, endpointUrl: 'https://x/exec', now: () => NOW })
    const second = processOutbox(repo, { fetch: (async () => ok(p)) as unknown as typeof fetch, endpointUrl: 'https://x/exec', now: () => NOW })
    await expect(first).rejects.toThrow('idb')
    expect((await second)[0]?.outcome).toBe('acknowledged')
  })
})
