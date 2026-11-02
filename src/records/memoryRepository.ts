// 비기록 모드 저장소(설계 docs/superpowers/specs/2026-11-02-no-record-mode-design.md)
// IndexedDB 저장소와 같은 Repository 규칙(확정 1회·초안 삭제·전송 대기 목록)을 메모리 Map으로만 지킨다.
// IndexedDB·localStorage·네트워크에 아무것도 쓰지 않는다. 탭을 닫거나 새로고침하면 사라진다.
import type { DeliveryEnvelope } from './types'
import type { Draft, Repository, StoredRecord } from './repository'

/** 비기록 수행의 익명 코드 자리 표시값. 저장·전송되지 않는다 */
export const NO_RECORD_CODE = 'NR-00'

export function openMemoryRepository(): Repository {
  const drafts = new Map<string, Draft>()
  const records = new Map<string, StoredRecord>()
  let current: string | null = null

  return {
    async saveDraft(d) {
      drafts.set(d.recordId, structuredClone(d))
      return { status: 'saved' }
    },
    async loadDraft(recordId) {
      const d = drafts.get(recordId)
      return d ? structuredClone(d) : null
    },
    async listDrafts() {
      return [...drafts.values()].map((d) => structuredClone(d))
    },
    async deleteDraft(recordId) {
      drafts.delete(recordId)
      return { status: 'saved' }
    },
    async freezeRecord(payload, frozenAtIso = new Date().toISOString()) {
      if (records.has(payload.recordId)) return { status: 'failed', errorCode: 'ALREADY_FROZEN' }
      const envelope: DeliveryEnvelope = {
        recordId: payload.recordId,
        localSaveStatus: 'saved',
        uploadStatus: 'pending',
        uploadedAt: null,
        receiptId: null,
        payloadHash: null,
        uploadAttemptCount: 0,
        lastErrorCode: null,
        nextRetryAt: null,
      }
      records.set(payload.recordId, { recordId: payload.recordId, payload: structuredClone(payload), envelope, frozenAt: frozenAtIso })
      drafts.delete(payload.recordId)
      return { status: 'saved' }
    },
    async loadRecord(recordId) {
      const r = records.get(recordId)
      return r ? structuredClone(r) : null
    },
    async listRecords() {
      return [...records.values()].map((r) => structuredClone(r))
    },
    async listOutbox() {
      return [...records.values()].filter((r) => r.envelope.uploadStatus !== 'acknowledged').map((r) => structuredClone(r))
    },
    async updateEnvelope(recordId, patch) {
      const cur = records.get(recordId)
      if (!cur) return { status: 'failed', errorCode: 'RECORD_NOT_FOUND' }
      records.set(recordId, { ...cur, envelope: { ...cur.envelope, ...patch, recordId } })
      return { status: 'saved' }
    },
    getCurrentRecordId: () => current,
    setCurrentRecordId(id) { current = id },
    clearCurrent() { current = null },
  }
}
