// 수업 자료 모으기 — 마치면 자동으로 보내기(설계 docs/superpowers/specs/2026-11-15-class-records-design.md §3-3)
// 실제 서버에 쓰지 않는다: 가짜 fetch와 가짜 저장소(fake-indexeddb)만 쓴다. 학번은 가짜 값(2211, 3999).
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import { openRepository, type Repository } from '../src/records/repository'
import { CLASS_SEND_TEXT, classSendLine, createAutoSender, nextWakeDelay, type AutoSendTimers } from '../src/delivery/autoSend'
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
    expect(nextWakeDelay([rec(5, { uploadStatus: 'confirmationPending', uploadAttemptCount: 2, lastErrorCode: 'TIMEOUT', nextRetryAt: new Date(now - 60_000).toISOString() })] as never, now)).toBe(5_000)
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
