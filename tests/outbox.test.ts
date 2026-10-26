import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import { openRepository, type Repository } from '../src/records/repository'
import { processOutbox } from '../src/delivery/outbox'
import { payloadHash } from '../src/delivery/jcs'
import type { RecordPayload } from '../src/domain/record'

const base = demo.payload as unknown as RecordPayload
const NOW = new Date('2026-10-26T09:00:00Z')
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const withId = (n: number): RecordPayload => ({ ...base, recordId: id(n) })
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
})
