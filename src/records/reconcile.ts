// 수업 종료 접수 대조(C2, 설계 05 §12) — 이 기기 기록과 서버 접수를 맞춰 회수할 기록을 찾는다. 순수 로직.
// 새로 모으는 자료 없음. 이 모듈은 아무것도 지우거나 보내지 않는다. 미접수 원본의 보관·삭제 시점은 연구자·기관 절차가 정한다.
import { payloadHash, stripUndefinedKeys } from '../delivery/jcs'
import { resendableRejected } from '../delivery/submit'
import { csvCell } from './csv'
import type { Draft, StoredRecord } from './repository'
import type { UploadStatus } from './types'

export interface ServerReceipt { record_id: string; receipt_id: string; accepted_at: string; payload_hash: string; anonymous_student_code: string }

export const UPLOAD_STATUS_LABEL: Record<UploadStatus, string> = { pending: '전송 대기', uploading: '접수 확인 필요', confirmationPending: '접수 확인 필요', acknowledged: '접수 확인됨', rejected: '거절', conflict: '충돌' }

const KEEP = '연구용 묶음(ZIP)으로 보관하고 연구자가 확인하세요.'

/** 접수 확인 전 기록에 교사가 할 일. 어느 경우에도 지우라고 하지 않는다. */
export function deviceAction(rec: StoredRecord): string {
  const { uploadStatus, lastErrorCode } = rec.envelope
  if (uploadStatus === 'pending' || resendableRejected(rec)) return '‘대기 기록 지금 전송’을 누르세요.'
  if (uploadStatus === 'confirmationPending' || uploadStatus === 'uploading') return '서버 저장 여부를 아직 모릅니다. ‘강제 재전송’으로 같은 번호를 다시 확인하세요.'
  if (uploadStatus === 'conflict') return `같은 번호로 다른 내용이 이미 접수되어 다시 보내지 않습니다. ${KEEP}`
  if (uploadStatus === 'rejected') return `거절된 기록은 다시 보내지 않습니다${lastErrorCode ? `(사유 ${lastErrorCode})` : ''}. ${KEEP}`
  return ''
}

export interface AttentionItem { recordId: string; code: string; uploadStatus: UploadStatus; action: string }
export interface DeviceSummary { total: number; acknowledged: number; waiting: number; needsConfirm: number; rejected: number; conflict: number; drafts: number; attention: AttentionItem[] }

export function summarizeDevice(records: StoredRecord[], drafts: Draft[]): DeviceSummary {
  const count = (...st: UploadStatus[]) => records.filter((r) => st.includes(r.envelope.uploadStatus)).length
  return {
    total: records.length, acknowledged: count('acknowledged'), waiting: count('pending'), needsConfirm: count('confirmationPending', 'uploading'), rejected: count('rejected'), conflict: count('conflict'), drafts: drafts.length,
    attention: records.filter((r) => r.envelope.uploadStatus !== 'acknowledged').map((r) => ({ recordId: r.recordId, code: r.payload.anonymousStudentCode, uploadStatus: r.envelope.uploadStatus, action: deviceAction(r) })),
  }
}

export type Verdict = 'matched' | 'serverHasSame' | 'notReceived' | 'mismatch' | 'missingOnServer'
export const VERDICT_LABEL: Record<Verdict, string> = { matched: '일치', serverHasSame: '서버에 같은 내용 있음', notReceived: '미접수', mismatch: '서버 내용과 다름', missingOnServer: '서버에 없음' }

export interface ReconcileRow { recordId: string; code: string; taskId: string; completedAt: string | null; uploadStatus: UploadStatus; lastErrorCode: string | null; verdict: Verdict; receiptId: string | null; acceptedAt: string | null; action: string }
export interface ReconcileResult {
  sessionCode: string
  rows: ReconcileRow[]
  counts: Record<Verdict, number>
  /** 회수·확인이 필요한 건수(미접수·불일치·서버에 없음). '서버에 같은 내용 있음'은 자료가 있으므로 넣지 않는다 */
  needsAction: number
  serverCount: number
  /** 이 기기에 없고 서버에만 있는 기록. 다른 기기에서 보낸 것일 수 있어 문제로 세지 않는다 */
  serverOnly: ServerReceipt[]
  receivedByCode: Array<{ code: string; count: number }>
  otherSessionRecords: number
  drafts: number
}

/** 서버가 받는 JSON 모양으로 해시한다. 진짜 잘못이 있는 원본은 null(대조는 멈추지 않는다) */
const localHash = (rec: StoredRecord): Promise<string | null> => payloadHash(stripUndefinedKeys(rec.payload)).catch(() => null)

function judge(rec: StoredRecord, hash: string | null, server: ServerReceipt | undefined): { verdict: Verdict; action: string } {
  const env = rec.envelope
  const acked = env.uploadStatus === 'acknowledged'
  if (!server) {
    return acked
      ? { verdict: 'missingOnServer', action: `기기는 접수 확인으로 표시했지만 이 세션의 서버 기록에 없습니다. ${KEEP}` }
      : { verdict: 'notReceived', action: deviceAction(rec) }
  }
  if (hash !== server.payload_hash || (acked && env.receiptId !== server.receipt_id)) return { verdict: 'mismatch', action: `같은 번호인데 서버 내용과 다릅니다. 덮어쓰지 않습니다. ${KEEP}` }
  if (acked) return { verdict: 'matched', action: '' }
  const canResend = env.uploadStatus !== 'rejected' && env.uploadStatus !== 'conflict'
  return { verdict: 'serverHasSame', action: canResend ? '서버에 같은 내용이 있어 회수할 필요가 없습니다. ‘강제 재전송’을 누르면 기기 표시도 접수 확인으로 바뀝니다.' : '서버에 같은 내용이 있어 회수할 필요가 없습니다.' }
}

export async function reconcileSession(input: { sessionCode: string; records: StoredRecord[]; drafts: Draft[]; receipts: ServerReceipt[] }): Promise<ReconcileResult> {
  const { sessionCode, records, drafts, receipts } = input
  const mine = records.filter((r) => r.payload.sessionCode === sessionCode)
  const byId = new Map(receipts.map((r) => [r.record_id, r]))
  const rows: ReconcileRow[] = []
  for (const rec of mine) {
    const server = byId.get(rec.recordId)
    const { verdict, action } = judge(rec, await localHash(rec), server)
    rows.push({ recordId: rec.recordId, code: rec.payload.anonymousStudentCode, taskId: rec.payload.taskId, completedAt: rec.payload.completedAt, uploadStatus: rec.envelope.uploadStatus, lastErrorCode: rec.envelope.lastErrorCode, verdict, receiptId: server?.receipt_id ?? null, acceptedAt: server?.accepted_at ?? null, action })
  }
  const counts: Record<Verdict, number> = { matched: 0, serverHasSame: 0, notReceived: 0, mismatch: 0, missingOnServer: 0 }
  for (const r of rows) counts[r.verdict]++
  const onDevice = new Set(mine.map((r) => r.recordId))
  const perCode = new Map<string, number>()
  for (const r of receipts) perCode.set(r.anonymous_student_code, (perCode.get(r.anonymous_student_code) ?? 0) + 1)
  return {
    sessionCode, rows, counts,
    needsAction: counts.notReceived + counts.mismatch + counts.missingOnServer,
    serverCount: receipts.length,
    serverOnly: receipts.filter((r) => !onDevice.has(r.record_id)),
    receivedByCode: [...perCode].map(([code, count]) => ({ code, count })).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
    otherSessionRecords: records.length - mine.length,
    drafts: drafts.filter((d) => d.session.sessionCode === sessionCode).length,
  }
}

const CSV_HEADER = ['recordId', 'anonymousStudentCode', 'taskId', 'completedAt', 'deviceUploadStatus', 'lastErrorCode', 'verdict', 'serverReceiptId', 'serverAcceptedAt', 'action']

export function reconcileToCsv(result: ReconcileResult): string {
  const lines = [CSV_HEADER.join(',')]
  for (const r of result.rows) lines.push([r.recordId, r.code, r.taskId, r.completedAt, r.uploadStatus, r.lastErrorCode, r.verdict, r.receiptId, r.acceptedAt, r.action].map(csvCell).join(','))
  for (const s of result.serverOnly) lines.push([s.record_id, s.anonymous_student_code, null, null, null, null, 'serverOnly', s.receipt_id, s.accepted_at, '이 기기에 없는 기록입니다. 다른 기기에서 보낸 것일 수 있습니다.'].map(csvCell).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}
