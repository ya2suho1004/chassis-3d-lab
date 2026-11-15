// 수업 자료 모으기 — 마치면 자동으로 보내기(설계 docs/superpowers/specs/2026-11-15-class-records-design.md §3-3)
// 실제 서버에 쓰지 않는다: 가짜 fetch와 가짜 저장소(fake-indexeddb)만 쓴다. 학번은 가짜 값(2211, 3999).
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import { openRepository, type Repository } from '../src/records/repository'
import { CLASS_SEND_TEXT, classSendLine, createAutoSender, nextWakeDelay, sendingAfterPass, type AutoSendTimers } from '../src/delivery/autoSend'
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS } from '../src/delivery/submit'
import type { OutboxItemResult } from '../src/delivery/outbox'
import { payloadHash } from '../src/delivery/jcs'
import type { RecordPayload } from '../src/domain/record'
import type { DeliveryEnvelope } from '../src/records/types'

const base = demo.payload as unknown as RecordPayload
const NOW = new Date('2026-11-16T01:00:00Z')
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const classRec = (n: number, code = '2211'): RecordPayload => ({ ...base, recordId: id(n), sessionCode: 'CLS-L12', classConditionCode: 'CLS', anonymousStudentCode: code })
const ok = async (p: RecordPayload) => new Response(JSON.stringify({ protocolVersion: '1', ok: true, recordId: p.recordId, receiptId: 'R-' + p.recordId.slice(-4), acceptedAt: '2026-11-16T01:00:01Z', payloadHash: await payloadHash(p), duplicate: false }), { status: 200 })

let repo: Repository
beforeEach(async () => { indexedDB = new IDBFactory(); repo = await openRepository() })

const env = (patch: Partial<DeliveryEnvelope>): DeliveryEnvelope => ({ recordId: id(1), localSaveStatus: 'saved', uploadStatus: 'pending', uploadedAt: null, receiptId: null, payloadHash: null, uploadAttemptCount: 0, lastErrorCode: null, nextRetryAt: null, ...patch })

describe('자동 전송기', () => {
  test('전송 주소가 없는 빌드에서는 아무것도 하지 않는다(저장소도 읽지 않음)', async () => {
    let touched = false
    const spy = { ...repo, listOutbox: async () => { touched = true; return [] } } as Repository
    expect(await createAutoSender(spy, () => null).run()).toBeNull()
    expect(touched).toBe(false)
  })
  test('수업용 세션 기록만 보내고, 시연 기록은 그대로 둔다', async () => {
    await repo.freezeRecord({ ...base, recordId: id(1) })
    await repo.freezeRecord(classRec(2))
    const sent: string[] = []
    const fetch = (async (_u: string, i: RequestInit) => { const p = JSON.parse(i.body as string).payload as RecordPayload; sent.push(p.recordId); return ok(p) }) as unknown as typeof globalThis.fetch
    const res = await createAutoSender(repo, () => ({ fetch, endpointUrl: 'https://x/submit', now: () => NOW })).run()
    expect(sent).toEqual([id(2)])
    expect(res).toEqual([{ recordId: id(2), outcome: 'acknowledged', code: null }])
    expect((await repo.loadRecord(id(1)))!.envelope.uploadStatus).toBe('pending')
  })
  test('보내는 중에 다시 불리면 겹쳐 보내지 않고, 끝난 뒤 한 번 더 돈다(그 사이 확정된 기록까지)', async () => {
    await repo.freezeRecord(classRec(3))
    const sent: string[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const fetch = (async (_u: string, i: RequestInit) => {
      const p = JSON.parse(i.body as string).payload as RecordPayload
      sent.push(p.recordId)
      if (p.recordId === id(3)) await gate
      return ok(p)
    }) as unknown as typeof globalThis.fetch
    const sender = createAutoSender(repo, () => ({ fetch, endpointUrl: 'https://x/submit', now: () => NOW }))
    const a = sender.run()
    await new Promise((r) => setTimeout(r, 20))
    await repo.freezeRecord(classRec(4, '3999'))
    const b = sender.run()
    const c = sender.run()
    release()
    await Promise.all([a, b, c])
    expect(sent).toEqual([id(3), id(4)])
    expect((await repo.listOutbox()).length).toBe(0)
  })
  test('보내다 저장소가 실패해도 예외를 던지지 않는다(화면이 멈추지 않게)', async () => {
    const broken = { ...repo, listOutbox: async () => { throw new Error('idb') } } as Repository
    expect(await createAutoSender(broken, () => ({ fetch: globalThis.fetch, endpointUrl: 'https://x/submit', now: () => NOW })).run()).toBeNull()
  })
  test('인터넷이 끊겨 못 보낸 기록은 기기에 남고, 재시도 시각이 지난 뒤 다시 부르면 보낸다', async () => {
    const p = classRec(5); await repo.freezeRecord(p)
    let online = false
    let now = NOW
    const fetch = (async () => { if (!online) throw new TypeError('Failed to fetch'); return ok(p) }) as unknown as typeof globalThis.fetch
    const sender = createAutoSender(repo, () => ({ fetch, endpointUrl: 'https://x/submit', now: () => now }))
    expect((await sender.run())?.[0]?.outcome).toBe('confirmationPending')
    online = true
    now = new Date(NOW.getTime() + 31_000)
    expect((await sender.run())?.[0]?.outcome).toBe('acknowledged')
  })
})

/** 가짜 타이머: 걸린 것만 모아 두고 손으로 부른다 */
function fakeTimers(nowMs: () => number) {
  const live = new Map<number, { fn: () => void; delay: number }>()
  let seq = 0
  const t: AutoSendTimers = { set: (fn, delay) => { const k = ++seq; live.set(k, { fn, delay }); return k }, clear: (k) => { live.delete(k as number) }, now: nowMs }
  return { t, live, fire: () => { const [k, v] = [...live][0]!; live.delete(k); v.fn() } }
}

describe('다시 부를 시각(타이머 하나)', () => {
  const rec = (n: number, patch: Partial<DeliveryEnvelope>, sessionCode = 'CLS-L12') => ({ recordId: id(n), payload: { ...classRec(n), sessionCode }, envelope: env({ recordId: id(n), ...patch }) })
  const now = NOW.getTime()
  test('수업용 대기 기록 가운데 가장 이른 재시도 시각까지(지난 시각이면 최소 간격)', () => {
    const recs = [
      rec(1, { uploadStatus: 'confirmationPending', uploadAttemptCount: 1, lastErrorCode: 'NETWORK_ERROR', nextRetryAt: new Date(now + 120_000).toISOString() }),
      rec(2, { uploadStatus: 'pending', uploadAttemptCount: 1, lastErrorCode: 'LOCK_BUSY', nextRetryAt: new Date(now + 30_000).toISOString() }),
      rec(3, { uploadStatus: 'rejected', lastErrorCode: 'INVALID_PAYLOAD', nextRetryAt: new Date(now + 1_000).toISOString() }),
      rec(4, { uploadStatus: 'pending', nextRetryAt: new Date(now + 2_000).toISOString() }, 'DEMO-ONLY'),
    ]
    expect(nextWakeDelay(recs as never, now)).toBe(30_000)
    // 지난 재시도 시각이어도 기본 간격(30초)은 기다린다
    expect(nextWakeDelay([rec(5, { uploadStatus: 'confirmationPending', uploadAttemptCount: 2, lastErrorCode: 'TIMEOUT', nextRetryAt: new Date(now - 60_000).toISOString() })] as never, now)).toBe(BACKOFF_BASE_MS)
  })
  test('재시도 시각이 비었어도 자동으로 다시 보낼 수 있는 기록(교사 전송으로 상한에 닿음)은 최대 간격(10분)으로 센다', () => {
    const capped = rec(8, { uploadStatus: 'confirmationPending', uploadAttemptCount: 9, lastErrorCode: 'NETWORK_ERROR', nextRetryAt: null })
    expect(nextWakeDelay([capped] as never, now)).toBe(BACKOFF_MAX_MS)
    expect(nextWakeDelay([capped, rec(9, { uploadStatus: 'pending', uploadAttemptCount: 1, lastErrorCode: 'LOCK_BUSY', nextRetryAt: new Date(now + 60_000).toISOString() })] as never, now)).toBe(60_000)
    // 시도한 적 없는 기록·다시 보내도 소용없는 사유는 세지 않는다
    expect(nextWakeDelay([rec(10, { uploadStatus: 'pending', uploadAttemptCount: 0, nextRetryAt: null })] as never, now)).toBeNull()
  })
  test('다시 보낼 기록이 없으면(재시도 시각 없음·다시 보내지 않는 사유·접수 확인) 걸지 않는다', () => {
    expect(nextWakeDelay([] as never, now)).toBeNull()
    expect(nextWakeDelay([rec(6, { uploadStatus: 'confirmationPending', uploadAttemptCount: 1, lastErrorCode: 'RECEIPT_MISMATCH', nextRetryAt: null })] as never, now)).toBeNull()
    expect(nextWakeDelay([rec(7, { uploadStatus: 'acknowledged', nextRetryAt: null })] as never, now)).toBeNull()
  })
  test('못 보내면 타이머 하나를 걸고, 다시 돌면 앞 타이머를 지우고 새로 건다. 시각이 되면 다시 보내고, 닫으면 정리한다', async () => {
    const p = classRec(10); await repo.freezeRecord(p)
    let up = false
    let nowMs = NOW.getTime()
    const fetch = (async () => { if (!up) throw new TypeError('Failed to fetch'); return ok(p) }) as unknown as typeof globalThis.fetch
    const tm = fakeTimers(() => nowMs)
    const sender = createAutoSender(repo, () => ({ fetch, endpointUrl: 'https://x/submit', now: () => new Date(nowMs) }), tm.t)
    await sender.run()
    expect([...tm.live.values()].map((v) => v.delay)).toEqual([30_000])
    await sender.run() // 재시도 시각 전이라 건너뛰고, 타이머는 하나만
    expect(tm.live.size).toBe(1)
    up = true; nowMs += 30_000
    tm.fire()
    await new Promise((r) => setTimeout(r, 50))
    expect((await repo.loadRecord(id(10)))!.envelope.uploadStatus).toBe('acknowledged')
    expect(tm.live.size).toBe(0)
    await repo.freezeRecord(classRec(11)); up = false
    await sender.run()
    expect(tm.live.size).toBe(1)
    sender.dispose()
    expect(tm.live.size).toBe(0)
    expect(await sender.run()).toBeNull()
  })
  test('한 차례에 결과 저장 실패(saveFailed)가 있었으면 다음 타이머는 최대 간격(10분) — 5초·30초마다 실제로 다시 보내는 고리를 막음', async () => {
    const p = classRec(15); await repo.freezeRecord(p)
    await repo.updateEnvelope(id(15), { uploadStatus: 'confirmationPending', uploadAttemptCount: 1, lastErrorCode: 'NETWORK_ERROR', nextRetryAt: new Date(NOW.getTime() - 1_000).toISOString() })
    // uploading 표시는 저장되고, fetch 뒤 결과 저장만 실패하는 저장소
    let marks = 0
    const flaky = { ...repo, updateEnvelope: async (rid: string, patch: Partial<DeliveryEnvelope>) => { if (patch.uploadStatus === 'uploading') { marks++; return repo.updateEnvelope(rid, patch) } return { status: 'failed', errorCode: 'QUOTA' } } } as unknown as Repository
    const tm = fakeTimers(() => NOW.getTime())
    const sender = createAutoSender(flaky, () => ({ fetch: (async () => ok(p)) as unknown as typeof globalThis.fetch, endpointUrl: 'https://x/submit', now: () => NOW }), tm.t)
    expect((await sender.run())?.[0]?.outcome).toBe('saveFailed')
    expect(marks).toBe(1)
    expect([...tm.live.values()].map((v) => v.delay)).toEqual([BACKOFF_MAX_MS])
  })
  test('reschedule: 보내지 않고 타이머만 다시 건다(교사 전송 뒤)', async () => {
    const p = classRec(16); await repo.freezeRecord(p)
    let calls = 0
    const tm = fakeTimers(() => NOW.getTime())
    const sender = createAutoSender(repo, () => ({ fetch: (async () => { calls++; return ok(p) }) as unknown as typeof globalThis.fetch, endpointUrl: 'https://x/submit', now: () => NOW }), tm.t)
    // 교사 전송으로 상한에 닿아 재시도 시각이 빈 상태
    await repo.updateEnvelope(id(16), { uploadStatus: 'confirmationPending', uploadAttemptCount: 9, lastErrorCode: 'NETWORK_ERROR', nextRetryAt: null })
    await sender.reschedule()
    expect(calls).toBe(0)
    expect([...tm.live.values()].map((v) => v.delay)).toEqual([BACKOFF_MAX_MS])
    await sender.reschedule()
    expect(tm.live.size).toBe(1)
  })
  test('인터넷이 끊겨 있으면 시도하지 않고 타이머도 걸지 않는다(online 신호를 기다림)', async () => {
    await repo.freezeRecord(classRec(12))
    const tm = fakeTimers(() => NOW.getTime())
    let calls = 0
    const fetch = (async () => { calls++; throw new TypeError('x') }) as unknown as typeof globalThis.fetch
    const sender = createAutoSender(repo, () => ({ fetch, endpointUrl: 'https://x/submit', now: () => NOW, online: () => false }), tm.t)
    expect(await sender.run()).toEqual([{ recordId: id(12), outcome: 'skipped', code: 'OFFLINE' }])
    expect(calls).toBe(0); expect(tm.live.size).toBe(0)
  })
  test('online 신호로 부르면 NETWORK_ERROR 기록은 재시도 시각 전이라도 바로 보낸다', async () => {
    const p = classRec(13); await repo.freezeRecord(p)
    await repo.updateEnvelope(id(13), { uploadStatus: 'confirmationPending', uploadAttemptCount: 4, lastErrorCode: 'NETWORK_ERROR', nextRetryAt: new Date(NOW.getTime() + 600_000).toISOString() })
    const fetch = (async () => ok(p)) as unknown as typeof globalThis.fetch
    const sender = createAutoSender(repo, () => ({ fetch, endpointUrl: 'https://x/submit', now: () => NOW }), fakeTimers(() => NOW.getTime()).t)
    expect((await sender.run())?.[0]?.code).toBe('RETRY_LATER')
    expect((await sender.run({ online: true }))?.[0]?.outcome).toBe('acknowledged')
  })
  test('이미 줄 선(아직 시작 안 한) 차례가 있으면 그 차례에 합치고, online 신호도 그 차례에 얹는다', async () => {
    const p = classRec(14); await repo.freezeRecord(p)
    await repo.updateEnvelope(id(14), { uploadStatus: 'confirmationPending', uploadAttemptCount: 4, lastErrorCode: 'NETWORK_ERROR', nextRetryAt: new Date(NOW.getTime() + 600_000).toISOString() })
    let calls = 0
    const fetch = (async () => { calls++; return ok(p) }) as unknown as typeof globalThis.fetch
    const sender = createAutoSender(repo, () => ({ fetch, endpointUrl: 'https://x/submit', now: () => NOW }), fakeTimers(() => NOW.getTime()).t)
    const a = sender.run(); const b = sender.run({ online: true })
    expect(a).toBe(b)
    expect((await a)?.[0]?.outcome).toBe('acknowledged')
    expect(calls).toBe(1)
  })
})

describe('결과 화면의 보내는 중 표시는 이 기록이 든 차례가 끝날 때만 끈다', () => {
  const r = (recordId: string, outcome: OutboxItemResult['outcome'] = 'acknowledged'): OutboxItemResult => ({ recordId, outcome, code: null })
  test('순수 계산: 결과에 이 기록이 있으면 끄고, 없으면 그대로, 차례가 통째로 실패(null)하면 끈다', () => {
    expect(sendingAfterPass(true, id(1), [r(id(2))])).toBe(true)
    expect(sendingAfterPass(true, id(1), [r(id(2)), r(id(1), 'confirmationPending')])).toBe(false)
    expect(sendingAfterPass(true, id(1), [])).toBe(true)
    expect(sendingAfterPass(true, id(1), null)).toBe(false)
    expect(sendingAfterPass(false, id(1), [r(id(2))])).toBe(false)
  })
  test('앞 차례가 도는 중 확정한 기록: 앞 차례 결과에는 없고, 새 차례(전송함을 다시 읽음) 결과에 들어 있다', async () => {
    await repo.freezeRecord(classRec(20))
    let release!: () => void
    const gate = new Promise<void>((res) => { release = res })
    const fetch = (async (_u: string, i: RequestInit) => { const p = JSON.parse(i.body as string).payload as RecordPayload; if (p.recordId === id(20)) await gate; return ok(p) }) as unknown as typeof globalThis.fetch
    const passes: Array<OutboxItemResult[] | null> = []
    const sender = createAutoSender(repo, () => ({ fetch, endpointUrl: 'https://x/submit', now: () => NOW }), fakeTimers(() => NOW.getTime()).t, (res) => { passes.push(res) })
    const a = sender.run()
    await new Promise((res) => setTimeout(res, 20))
    await repo.freezeRecord(classRec(21)) // 학생이 이 기록을 확정
    const b = sender.run()
    expect(b).not.toBe(a) // 앞 차례가 이미 시작했으므로 새 차례
    let sending = true
    release()
    const resA = await a
    sending = sendingAfterPass(sending, id(21), resA)
    expect(resA?.map((x) => x.recordId)).toEqual([id(20)])
    expect(sending).toBe(true) // 앞 차례가 끝나도 아직 보내는 중
    const resB = await b
    expect(resB?.map((x) => x.recordId)).toEqual([id(21)])
    expect(sendingAfterPass(sending, id(21), resB)).toBe(false)
    expect(passes).toEqual([resA, resB])
  })
})

describe('결과 화면 전송 상태 한 줄', () => {
  test('자동으로 다시 보내지 않는 사유(다시 보내도 소용없음)와 서버 한도는 선생님께 알리라고 한다', () => {
    for (const code of ['CANONICAL_STORE_INVALID', 'RECEIPT_MISMATCH', 'ACCEPTED_AT_MISMATCH'])
      expect(classSendLine(env({ uploadStatus: 'confirmationPending', uploadAttemptCount: 1, lastErrorCode: code, nextRetryAt: null }), false), code).toBe(CLASS_SEND_TEXT.teacher)
    expect(classSendLine(env({ uploadStatus: 'pending', uploadAttemptCount: 1, lastErrorCode: 'RATE_LIMITED', nextRetryAt: new Date(NOW.getTime() + 30_000).toISOString() }), false)).toBe(CLASS_SEND_TEXT.teacher)
    // 자동으로 다시 보낼 기록(끊김·응답 없음·잠금 대기)은 '인터넷이 연결되면 다시 보내요'
    for (const code of ['NETWORK_ERROR', 'TIMEOUT', 'LOCK_BUSY'])
      expect(classSendLine(env({ uploadStatus: 'confirmationPending', uploadAttemptCount: 9, lastErrorCode: code, nextRetryAt: null }), false), code).toBe(CLASS_SEND_TEXT.notYet)
  })
  test('보냈으면·보내는 중·못 보냈으면·거절되면 각각의 문구', () => {
    expect(classSendLine(env({ uploadStatus: 'acknowledged' }), false)).toBe('기록을 선생님께 보냈어요.')
    expect(classSendLine(env({ uploadStatus: 'pending' }), true)).toBe(CLASS_SEND_TEXT.sending)
    expect(classSendLine(env({ uploadStatus: 'pending' }), false)).toBe('아직 보내지 못했어요. 인터넷이 연결되면 다시 보내요.')
    expect(classSendLine(env({ uploadStatus: 'confirmationPending', lastErrorCode: 'NETWORK_ERROR' }), false)).toBe('아직 보내지 못했어요. 인터넷이 연결되면 다시 보내요.')
    expect(classSendLine(env({ uploadStatus: 'rejected', lastErrorCode: 'SESSION_NOT_ALLOWED' }), false)).toBe(CLASS_SEND_TEXT.teacher)
    expect(classSendLine(env({ uploadStatus: 'conflict' }), false)).toBe(CLASS_SEND_TEXT.teacher)
    // 보내기가 끝났으면 보내는 중이어도 보냈다고 한다
    expect(classSendLine(env({ uploadStatus: 'acknowledged' }), true)).toBe('기록을 선생님께 보냈어요.')
  })
  test('이 기기에 확정 저장하지 못했으면 줄을 보이지 않는다(저장 실패 안내가 따로 있음)', () => {
    expect(classSendLine(null, false)).toBeNull()
    expect(classSendLine(env({ localSaveStatus: 'failed' }), false)).toBeNull()
  })
  test('문구에 정오·판정·점수를 암시하는 말이 없다(안내 없음 모드 규칙)', () => {
    for (const t of Object.values(CLASS_SEND_TEXT)) expect(t).not.toMatch(/통과|정답|오답|보완|맞|틀|점수|성공|실패|잘했/)
  })
})
