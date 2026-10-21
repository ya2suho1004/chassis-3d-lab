// IndexedDB 저장소 — 초안(draft)·확정 기록(record: payload + envelope)·현재 수행 포인터
// 원칙(docs/design/docs/05 §5, 02 §8):
//  - '저장됨'은 request 성공이 아니라 transaction complete를 뜻한다.
//  - recordId는 수행 시작 때 한 번 발급. 같은 ID 재저장은 덮어쓰기(초안), 확정은 1회만(ALREADY_FROZEN).
//  - 확정 payload와 envelope는 같은 readwrite 트랜잭션에 쓰고 초안을 지운다.
//  - 저장 실패는 예외 대신 {status:'failed', errorCode}로 돌려 화면이 '저장 실패'를 표시하게 한다.
//  - 네트워크 작업은 이 모듈에 없다. '다음 학생'은 현재 포인터만 지우고 대기열(outbox)은 보존한다.
//  - 현재 포인터는 localStorage(비민감 UI 설정)에 둔다.
import type { RecordPayload, SessionContext } from '../domain/record'
import type { RunSnapshot } from '../domain/taskEngine'
import type { DeliveryEnvelope } from './types'

export const DB_NAME = 'chassis-3d-lab'
export const DB_VERSION = 1
const DRAFTS = 'drafts'
const RECORDS = 'records'
const CURRENT_KEY = 'chassis-3d-lab:currentRecordId'

export interface Draft {
  recordId: string
  session: SessionContext
  snapshot: RunSnapshot
  savedAt: string
}

export interface StoredRecord {
  recordId: string
  payload: RecordPayload
  envelope: DeliveryEnvelope
  frozenAt: string
}

export type SaveResult = { status: 'saved' | 'failed'; errorCode?: string; message?: string }

export interface Repository {
  saveDraft(d: Draft): Promise<SaveResult>
  loadDraft(recordId: string): Promise<Draft | null>
  listDrafts(): Promise<Draft[]>
  deleteDraft(recordId: string): Promise<SaveResult>
  freezeRecord(payload: RecordPayload, frozenAtIso?: string): Promise<SaveResult>
  loadRecord(recordId: string): Promise<StoredRecord | null>
  listRecords(): Promise<StoredRecord[]>
  listOutbox(): Promise<StoredRecord[]>
  updateEnvelope(recordId: string, patch: Partial<DeliveryEnvelope>): Promise<SaveResult>
  getCurrentRecordId(): string | null
  setCurrentRecordId(id: string): void
  clearCurrent(): void
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error('IDB_REQUEST_ERROR'))
  })
}

/** 트랜잭션이 complete 될 때만 resolve. abort/error는 reject. */
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('IDB_TX_ABORTED'))
    tx.onerror = () => reject(tx.error ?? new Error('IDB_TX_ERROR'))
  })
}

function failed(e: unknown, fallback: string): SaveResult {
  const err = e as { name?: string; message?: string } | null
  return { status: 'failed', errorCode: err?.name && err.name !== 'Error' ? err.name : fallback, message: err?.message }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: 'recordId' })
      if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS, { keyPath: 'recordId' })
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error('IDB_OPEN_ERROR'))
    r.onblocked = () => reject(new Error('IDB_OPEN_BLOCKED'))
  })
}

function readCurrent(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

export async function openRepository(opts: { failWrites?: boolean } = {}): Promise<Repository> {
  const db = await openDb()
  const guard = () => {
    if (opts.failWrites) throw Object.assign(new Error('simulated write failure'), { name: 'SIMULATED_WRITE_FAILURE' })
  }

  const listRecords = async (): Promise<StoredRecord[]> => {
    const tx = db.transaction(RECORDS, 'readonly')
    return (await req(tx.objectStore(RECORDS).getAll())) as StoredRecord[]
  }

  return {
    async saveDraft(d) {
      try {
        guard()
        const tx = db.transaction(DRAFTS, 'readwrite')
        tx.objectStore(DRAFTS).put(d)
        await done(tx)
        return { status: 'saved' }
      } catch (e) {
        return failed(e, 'DRAFT_SAVE_FAILED')
      }
    },
    async loadDraft(recordId) {
      const tx = db.transaction(DRAFTS, 'readonly')
      const v = await req(tx.objectStore(DRAFTS).get(recordId))
      return (v as Draft | undefined) ?? null
    },
    async listDrafts() {
      const tx = db.transaction(DRAFTS, 'readonly')
      return (await req(tx.objectStore(DRAFTS).getAll())) as Draft[]
    },
    async deleteDraft(recordId) {
      try {
        guard()
        const tx = db.transaction(DRAFTS, 'readwrite')
        tx.objectStore(DRAFTS).delete(recordId)
        await done(tx)
        return { status: 'saved' }
      } catch (e) {
        return failed(e, 'DRAFT_DELETE_FAILED')
      }
    },
    async freezeRecord(payload, frozenAtIso = new Date().toISOString()) {
      try {
        guard()
        const tx = db.transaction([RECORDS, DRAFTS], 'readwrite')
        const records = tx.objectStore(RECORDS)
        const existing = (await req(records.get(payload.recordId))) as StoredRecord | undefined
        if (existing) {
          tx.abort()
          return { status: 'failed', errorCode: 'ALREADY_FROZEN' }
        }
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
        records.add({ recordId: payload.recordId, payload, envelope, frozenAt: frozenAtIso } satisfies StoredRecord)
        tx.objectStore(DRAFTS).delete(payload.recordId)
        await done(tx)
        return { status: 'saved' }
      } catch (e) {
        return failed(e, 'FREEZE_FAILED')
      }
    },
    async loadRecord(recordId) {
      const tx = db.transaction(RECORDS, 'readonly')
      const v = await req(tx.objectStore(RECORDS).get(recordId))
      return (v as StoredRecord | undefined) ?? null
    },
    listRecords,
    async listOutbox() {
      return (await listRecords()).filter((r) => r.envelope.uploadStatus !== 'acknowledged')
    },
    async updateEnvelope(recordId, patch) {
      try {
        guard()
        const tx = db.transaction(RECORDS, 'readwrite')
        const store = tx.objectStore(RECORDS)
        const cur = (await req(store.get(recordId))) as StoredRecord | undefined
        if (!cur) {
          tx.abort()
          return { status: 'failed', errorCode: 'RECORD_NOT_FOUND' }
        }
        // payload는 불변. envelope만 갱신한다.
        store.put({ ...cur, envelope: { ...cur.envelope, ...patch, recordId } })
        await done(tx)
        return { status: 'saved' }
      } catch (e) {
        return failed(e, 'ENVELOPE_UPDATE_FAILED')
      }
    },
    getCurrentRecordId: readCurrent,
    setCurrentRecordId(id) {
      try {
        localStorage.setItem(CURRENT_KEY, id)
      } catch {
        /* 비민감 포인터. 실패해도 초안은 DB에 있다 */
      }
    },
    clearCurrent() {
      try {
        localStorage.removeItem(CURRENT_KEY)
      } catch {
        /* ignore */
      }
    },
  }
}
