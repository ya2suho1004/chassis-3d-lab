// 수업 자료 모으기 — 마치면 자동으로 보내기(설계 docs/superpowers/specs/2026-11-15-class-records-design.md §3-3)
// 실제 서버에 쓰지 않는다: 가짜 fetch와 가짜 저장소(fake-indexeddb)만 쓴다. 학번은 가짜 값(2211, 3999).
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import { openRepository, type Repository } from '../src/records/repository'
import { CLASS_SEND_TEXT, classSendLine, createAutoSender } from '../src/delivery/autoSend'
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

describe('결과 화면 전송 상태 한 줄', () => {
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
