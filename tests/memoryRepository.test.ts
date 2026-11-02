// 비기록 모드(설계 docs/superpowers/specs/2026-11-02-no-record-mode-design.md)
// 메모리 저장소는 실제 저장소와 같은 규칙으로 동작하되 IndexedDB·localStorage에 아무것도 쓰지 않는다.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import brake1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import turn1 from '../src/data/tasks/task.min-turning-radius.case-lv1.json'
import { createTaskRun, serializeRun } from '../src/domain/taskEngine'
import { buildRecordPayload } from '../src/domain/record'
import { createDemoSession } from '../src/app/session'
import { NO_RECORD_CODE, openMemoryRepository } from '../src/records/memoryRepository'
import { DB_NAME, openRepository } from '../src/records/repository'
import type { ApprovedTask } from '../src/domain/types'

const store = new Map<string, string>()
beforeEach(() => {
  indexedDB = new IDBFactory()
  store.clear()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
})

function runFor(task: ApprovedTask) {
  const session = createDemoSession({ studentCode: NO_RECORD_CODE, sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', task })
  const run = createTaskRun(task, { difficultyMode: 'guided' })
  return { session, run }
}

describe('메모리 저장소 — 저장소와 같은 규칙', () => {
  test('초안 저장·읽기·목록·삭제', async () => {
    const repo = openMemoryRepository()
    const { session, run } = runFor(brake1 as ApprovedTask)
    expect((await repo.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run), savedAt: 't' })).status).toBe('saved')
    expect((await repo.loadDraft(session.recordId))?.recordId).toBe(session.recordId)
    expect(await repo.listDrafts()).toHaveLength(1)
    await repo.deleteDraft(session.recordId)
    expect(await repo.loadDraft(session.recordId)).toBeNull()
  })

  test('확정하면 초안이 지워지고 기록·전송 대기에 들어가며, 같은 ID 재확정은 ALREADY_FROZEN', async () => {
    const repo = openMemoryRepository()
    const { session, run } = runFor(turn1 as unknown as ApprovedTask)
    await repo.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run), savedAt: 't' })
    const payload = buildRecordPayload(run, session, { completedAtIso: '2026-11-02T10:00:00Z', completionStatus: 'aborted' })
    expect((await repo.freezeRecord(payload)).status).toBe('saved')
    expect(await repo.loadDraft(session.recordId)).toBeNull()
    expect((await repo.loadRecord(session.recordId))?.envelope.localSaveStatus).toBe('saved')
    expect(await repo.listOutbox()).toHaveLength(1)
    expect((await repo.freezeRecord(payload)).errorCode).toBe('ALREADY_FROZEN')
    expect((await repo.updateEnvelope('없는-ID', {})).errorCode).toBe('RECORD_NOT_FOUND')
  })

  test('현재 수행 포인터는 메모리에만 둔다(localStorage 미사용)', () => {
    const repo = openMemoryRepository()
    repo.setCurrentRecordId('abc')
    expect(repo.getCurrentRecordId()).toBe('abc')
    repo.clearCurrent()
    expect(repo.getCurrentRecordId()).toBeNull()
    expect(store.size).toBe(0)
  })

  test('저장소마다 따로다(다음 학생이 앞 학생 기록을 보지 않음)', async () => {
    const a = openMemoryRepository()
    const { session, run } = runFor(brake1 as ApprovedTask)
    await a.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run), savedAt: 't' })
    expect(await openMemoryRepository().listDrafts()).toHaveLength(0)
  })
})

describe('비기록 수행은 실제 저장소에 닿지 않는다', () => {
  test('두 과제를 메모리 저장소로 확정해도 실제 DB·포인터·대화 DB는 비어 있다', async () => {
    for (const task of [brake1 as ApprovedTask, turn1 as unknown as ApprovedTask]) {
      const repo = openMemoryRepository()
      const { session, run } = runFor(task)
      await repo.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run), savedAt: 't' })
      repo.setCurrentRecordId(session.recordId)
      await repo.freezeRecord(buildRecordPayload(run, session, { completedAtIso: '2026-11-02T10:00:00Z', completionStatus: 'aborted' }))
    }
    const dbs = await indexedDB.databases()
    expect(dbs.map((d) => d.name)).not.toContain(DB_NAME)
    expect(dbs.map((d) => d.name)).not.toContain('chassis-3d-lab-chat')
    expect(store.size).toBe(0)
    const real = await openRepository()
    expect(await real.listRecords()).toHaveLength(0)
    expect(await real.listDrafts()).toHaveLength(0)
    expect(real.getCurrentRecordId()).toBeNull()
  })
})
