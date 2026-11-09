// C2 수업 종료 접수 대조표(Codex 회의 11-08, 설계 05 §12): 이 기기 기록과 서버 접수를 맞춰 회수할 기록을 찾는다.
// 새로 모으는 자료 없음. 지우는 기능 없음. 합성 코드만 쓴다.
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import { payloadHash } from '../src/delivery/jcs'
import type { RecordPayload } from '../src/domain/record'
import { deviceAction, reconcileSession, reconcileToCsv, summarizeDevice, type ServerReceipt } from '../src/records/reconcile'
import type { Draft, StoredRecord } from '../src/records/repository'
import type { DeliveryEnvelope } from '../src/records/types'
import { DeviceSummaryView, ReconcileView } from '../src/screens/RecordCheck'
import { exportFileName, kstDate } from '../src/teacher/exportName'
import { listAllServerRecords, listChatLogs, listServerReceipts, type ChatLogRecord } from '../src/teacher/serverAdmin'

const base = demo.payload as unknown as RecordPayload
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const payload = (n: number, over: Partial<RecordPayload> = {}): RecordPayload => ({ ...base, recordId: id(n), anonymousStudentCode: `D-${String(n).padStart(2, '0')}`, ...over })

function record(n: number, env: Partial<DeliveryEnvelope> = {}, over: Partial<RecordPayload> = {}): StoredRecord {
  return {
    recordId: id(n), payload: payload(n, over), frozenAt: '2026-11-09T05:00:00.000Z',
    envelope: { recordId: id(n), localSaveStatus: 'saved', uploadStatus: 'pending', uploadedAt: null, receiptId: null, payloadHash: null, uploadAttemptCount: 0, lastErrorCode: null, nextRetryAt: null, ...env },
  }
}
const acked = (n: number, receipt = `R-${n}`) => record(n, { uploadStatus: 'acknowledged', receiptId: receipt, uploadedAt: '2026-11-09T05:01:00.000Z', payloadHash: 'a'.repeat(64) })
const receipt = async (n: number, over: Partial<ServerReceipt> = {}): Promise<ServerReceipt> => ({ record_id: id(n), receipt_id: `R-${n}`, accepted_at: '2026-11-09T05:01:00.000Z', payload_hash: await payloadHash(payload(n)), anonymous_student_code: `D-${String(n).padStart(2, '0')}`, ...over })
const draft = (recordId: string, sessionCode: string) => ({ recordId, savedAt: '2026-11-09T05:00:00.000Z', session: { sessionCode, anonymousStudentCode: 'D-90' } }) as unknown as Draft
const S = base.sessionCode

const run = async (records: StoredRecord[], receipts: ServerReceipt[], drafts: Draft[] = []) => reconcileSession({ sessionCode: S, records, drafts, receipts })
const verdictOf = (r: Awaited<ReturnType<typeof run>>, n: number) => r.rows.find((x) => x.recordId === id(n))?.verdict

describe('기기 상태 요약(서버 로그인 없이)', () => {
  test('상태별 건수와 끝내지 않은 수행 수를 세고, 접수 확인 전 기록만 할 일 목록에 올린다', () => {
    const s = summarizeDevice([
      acked(1), record(2), record(3, { uploadStatus: 'confirmationPending', lastErrorCode: 'NETWORK_ERROR' }), record(4, { uploadStatus: 'uploading' }),
      record(5, { uploadStatus: 'rejected', lastErrorCode: 'SESSION_NOT_ALLOWED' }), record(6, { uploadStatus: 'conflict', lastErrorCode: 'RECORD_ID_CONFLICT' }),
    ], [draft(id(90), S)])
    expect(s).toMatchObject({ total: 6, acknowledged: 1, waiting: 1, needsConfirm: 2, rejected: 1, conflict: 1, drafts: 1 })
    expect(s.attention.map((a) => a.recordId)).toEqual([id(2), id(3), id(4), id(5), id(6)])
    expect(s.attention[0]).toMatchObject({ code: 'D-02', uploadStatus: 'pending' })
  })

  test('할 일 문구: 다시 보낼 수 있는 것과 다시 보내지 않는 것을 구분하고, 어디에도 지우라고 하지 않는다', () => {
    expect(deviceAction(record(1))).toMatch(/대기 기록 지금 전송/)
    expect(deviceAction(record(1, { uploadStatus: 'confirmationPending' }))).toMatch(/강제 재전송/)
    const rejected = deviceAction(record(1, { uploadStatus: 'rejected', lastErrorCode: 'SESSION_NOT_ALLOWED' }))
    expect(rejected).toMatch(/다시 보내지 않습니다/)
    expect(rejected).toMatch(/SESSION_NOT_ALLOWED/)
    expect(rejected).toMatch(/연구용 묶음/)
    expect(deviceAction(record(1, { uploadStatus: 'conflict' }))).toMatch(/다시 보내지 않습니다/)
    for (const st of ['pending', 'confirmationPending', 'rejected', 'conflict'] as const) expect(deviceAction(record(1, { uploadStatus: st }))).not.toMatch(/지우|삭제/)
  })

  test('이전 판 전송 오류로만 거절된 기록은 다시 보낼 수 있다고 안내한다', () => {
    const p = payload(1)
    const withHole = { ...p, stepEvents: [{ ...p.stepEvents[0]!, reasonCode: undefined }] } as RecordPayload
    expect(deviceAction({ ...record(1, { uploadStatus: 'rejected', lastErrorCode: 'INVALID_PAYLOAD' }), payload: withHole })).toMatch(/대기 기록 지금 전송/)
  })
})

describe('세션 대조', () => {
  test('기기 접수 확인 + 서버에 같은 내용 = 일치', async () => {
    const r = await run([acked(1)], [await receipt(1)])
    expect(verdictOf(r, 1)).toBe('matched')
    expect(r.counts).toMatchObject({ matched: 1, notReceived: 0 })
    expect(r.needsAction).toBe(0)
  })

  test('기기는 대기·확인 필요인데 서버에 같은 내용이 있으면 회수할 필요 없음, 재전송하면 기기 표시도 맞춰진다', async () => {
    const r = await run([record(1, { uploadStatus: 'confirmationPending', lastErrorCode: 'TIMEOUT' })], [await receipt(1)])
    expect(verdictOf(r, 1)).toBe('serverHasSame')
    expect(r.rows[0]!.action).toMatch(/강제 재전송/)
    expect(r.rows[0]!.receiptId).toBe('R-1')
  })

  test('기기는 대기·거절인데 서버에 없으면 미접수 = 회수 대상', async () => {
    const r = await run([record(1), record(2, { uploadStatus: 'rejected', lastErrorCode: 'SESSION_NOT_ALLOWED' })], [])
    expect(verdictOf(r, 1)).toBe('notReceived')
    expect(verdictOf(r, 2)).toBe('notReceived')
    expect(r.rows.find((x) => x.recordId === id(2))!.action).toMatch(/연구용 묶음/)
    expect(r.counts.notReceived).toBe(2)
    expect(r.needsAction).toBe(2)
  })

  test('같은 번호인데 내용이 다르면 불일치, 덮어쓰지 말라고 안내한다', async () => {
    const r = await run([record(1)], [await receipt(1, { payload_hash: 'b'.repeat(64) })])
    expect(verdictOf(r, 1)).toBe('mismatch')
    expect(r.rows[0]!.action).toMatch(/연구자/)
  })

  test('기기는 접수 확인이지만 접수번호가 서버와 다르면 불일치', async () => {
    const r = await run([acked(1, 'R-OTHER')], [await receipt(1)])
    expect(verdictOf(r, 1)).toBe('mismatch')
  })

  test('기기는 접수 확인인데 서버에 없으면 따로 표시한다', async () => {
    const r = await run([acked(1)], [])
    expect(verdictOf(r, 1)).toBe('missingOnServer')
    expect(r.needsAction).toBe(1)
  })

  test('해시를 낼 수 없는 원본(NaN)도 대조를 멈추지 않는다', async () => {
    const bad = record(1, {}, { activeTimeMs: Number.NaN } as Partial<RecordPayload>)
    const r = await run([bad, record(2)], [await receipt(1)])
    expect(verdictOf(r, 1)).toBe('mismatch')
    expect(verdictOf(r, 2)).toBe('notReceived')
  })

  test('저장 전 빈 칸이 있는 기록은 서버가 받은 모양으로 해시해 일치로 본다', async () => {
    const p = payload(1)
    const hole = { ...acked(1), payload: { ...p, stepEvents: [{ ...p.stepEvents[0]!, reasonCode: undefined }, ...p.stepEvents.slice(1)] } as RecordPayload }
    const r = await run([hole], [await receipt(1, { payload_hash: await payloadHash(JSON.parse(JSON.stringify(hole.payload))) })])
    expect(verdictOf(r, 1)).toBe('matched')
  })

  test('서버에만 있는 기록은 문제로 세지 않고 다른 기기 것일 수 있다고 따로 둔다', async () => {
    const r = await run([], [await receipt(7)])
    expect(r.rows).toEqual([])
    expect(r.serverOnly.map((x) => x.record_id)).toEqual([id(7)])
    expect(r.needsAction).toBe(0)
    expect(r.serverCount).toBe(1)
  })

  test('다른 세션의 기기 기록·초안은 대조에서 빼고 건수만 알린다', async () => {
    const r = await run([record(1), record(2, {}, { sessionCode: 'OTHER' } as Partial<RecordPayload>)], [], [draft(id(90), S), draft(id(91), 'OTHER')])
    expect(r.rows.map((x) => x.recordId)).toEqual([id(1)])
    expect(r.otherSessionRecords).toBe(1)
    expect(r.drafts).toBe(1)
  })

  test('익명 코드별 접수 건수: 명단과 눈으로 맞춰 볼 수 있게 코드순으로 준다', async () => {
    const r = await run([], [await receipt(2), await receipt(1), await receipt(3, { anonymous_student_code: 'D-01' })])
    expect(r.receivedByCode).toEqual([{ code: 'D-01', count: 2 }, { code: 'D-02', count: 1 }])
  })
})

describe('대조표 CSV', () => {
  test('기기 기록과 서버에만 있는 기록을 모두 싣고 머리글이 고정이다', async () => {
    const r = await run([record(1), acked(2)], [await receipt(2), await receipt(7)])
    const lines = reconcileToCsv(r).replace(/^﻿/, '').trim().split('\r\n')
    expect(lines[0]).toBe('recordId,anonymousStudentCode,taskId,completedAt,deviceUploadStatus,lastErrorCode,verdict,serverReceiptId,serverAcceptedAt,action')
    expect(lines).toHaveLength(4)
    expect(lines.find((l) => l.startsWith(id(7)))).toMatch(/serverOnly/)
    expect(lines.find((l) => l.startsWith(id(1)))).toMatch(/notReceived/)
  })
})

describe('서버 조회를 끝까지 읽기(1000줄 상한 대응)', () => {
  const cfg = { url: 'https://x', anonKey: 'k' }
  const auth = { accessToken: 't', expiresAt: 0, email: 'e' }
  const paged = <T,>(all: T[], urls: string[]) => (async (u: string, init?: RequestInit) => {
    urls.push(u)
    expect(init?.method ?? 'GET').toBe('GET')
    const offset = Number(/offset=(\d+)/.exec(u)?.[1] ?? 0)
    return new Response(JSON.stringify(all.slice(offset, offset + 2)), { status: 200 })
  }) as unknown as typeof fetch

  test('대화 기록: 서버가 조금씩 줘도 끝까지 읽고, 같은 시각에도 순서가 흔들리지 않게 번호를 함께 정렬한다', async () => {
    const urls: string[] = []
    const all = Array.from({ length: 5 }, (_, i) => ({ chat_id: `c${i}` })) as unknown as ChatLogRecord[]
    const rows = await listChatLogs(cfg, auth, 'A&B', paged(all, urls))
    expect(rows.map((r) => r.chat_id)).toEqual(all.map((r) => r.chat_id))
    expect(urls[0]).toMatch(/session_code=eq\.A%26B/)
    expect(urls[0]).toMatch(/order=created_at\.asc,chat_id\.asc/)
    expect(urls.join()).not.toMatch(/limit=5000/)
  })

  test('중간에 실패하면 일부만 돌려주지 않고 오류를 낸다', async () => {
    let calls = 0
    const f = (async () => (++calls === 1 ? new Response(JSON.stringify([{ record_id: 'r' }]), { status: 200 }) : new Response('{}', { status: 500 }))) as unknown as typeof fetch
    await expect(listAllServerRecords(cfg, auth, 'S', f)).rejects.toThrow()
  })

  test('대조용 접수 조회: 원본 내용(payload_json)을 받지 않고 끝까지 읽는다', async () => {
    const urls: string[] = []
    const all = Array.from({ length: 3 }, (_, i) => ({ record_id: `r${i}` })) as unknown as ServerReceipt[]
    expect((await listServerReceipts(cfg, auth, 'S', paged(all, urls))).length).toBe(3)
    expect(urls[0]).toMatch(/select=record_id,receipt_id,accepted_at,payload_hash,anonymous_student_code/)
    expect(urls[0]).not.toMatch(/payload_json/)
    expect(urls[0]).toMatch(/order=accepted_at\.asc,record_id\.asc/)
  })

  test('옛 5000 상한 조회가 남아 있지 않다', () => {
    const src = fs.readFileSync('src/teacher/serverAdmin.ts', 'utf8')
    expect(src).not.toMatch(/limit=5000/)
    expect(src).not.toMatch(/export const listServerRecords/)
  })

  test('내려받기 파일 이름에 건수와 한국 날짜가 들어간다', () => {
    const late = new Date('2026-11-09T16:00:00.000Z') // 한국은 11월 10일 01:00
    expect(kstDate(late)).toBe('2026-11-10')
    expect(exportFileName('server-records', 'DEMO-ONLY', 1234, late)).toBe('server-records-DEMO-ONLY-2026-11-10-1234건.csv')
  })
})

describe('화면', () => {
  test('기기 요약: 건수와 할 일이 보이고 지우기 버튼이 없다', () => {
    const html = renderToStaticMarkup(createElement(DeviceSummaryView, { summary: summarizeDevice([acked(1), record(2)], [draft(id(90), S)]) }))
    expect(html).toMatch(/접수 확인/)
    expect(html).toMatch(/D-02/)
    expect(html).toMatch(/대기 기록 지금 전송/)
    expect(html).toMatch(/끝내지 않은 수행/)
    expect(html).not.toMatch(/삭제|지우기/)
  })

  test('기기 요약: 모두 접수 확인이면 할 일이 없다고 말한다', () => {
    const html = renderToStaticMarkup(createElement(DeviceSummaryView, { summary: summarizeDevice([acked(1)], []) }))
    expect(html).toMatch(/보낼 기록이 없습니다/)
  })

  test('대조 결과: 이 기기만 대조한다는 한계를 말하고, 끝까지 읽은 서버 건수와 회수 대상을 보여 준다', async () => {
    const result = await run([record(1), acked(2)], [await receipt(2), await receipt(7)])
    const html = renderToStaticMarkup(createElement(ReconcileView, { result, onDownload: () => {} }))
    expect(html).toMatch(/이 기기/)
    expect(html).toMatch(/기기마다/)
    expect(html).toMatch(/서버 기록 2건/)
    expect(html).toMatch(/D-01/)
    expect(html).toMatch(/다른 기기/)
  })

  test('연결: 수업 후 탭에 기기 요약, 서버 세션별 대조 버튼, 전체 읽기 CSV', () => {
    const t = fs.readFileSync('src/screens/TeacherPanel.tsx', 'utf8')
    expect(t).toMatch(/<DeviceRecordCheck /)
    expect(t).toMatch(/<ServerAfter s=\{server\} repo=\{repo\} \/>/)
    const s = fs.readFileSync('src/screens/ServerAdmin.tsx', 'utf8')
    expect(s).toMatch(/이 기기와 대조/)
    expect(s).toMatch(/listServerReceipts\(cfg, auth, x\.session_code\)/)
    expect(s).toMatch(/saveAll\('server-records'/)
    expect(s).toMatch(/saveAll\('chat-logs'/)
    expect(s).toMatch(/exportFileName\(kind, code, rows\.length/)
    expect(s).not.toMatch(/listServerRecords/)
  })

  test('학생 결과 화면에는 대조표를 두지 않는다', () => {
    expect(fs.readFileSync('src/screens/ResultScreen.tsx', 'utf8')).not.toMatch(/reconcile|RecordCheck/)
  })
})
