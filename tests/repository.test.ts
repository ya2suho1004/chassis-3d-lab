import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createTaskRun, attempt, serializeRun } from '../src/domain/taskEngine'
import { buildRecordPayload } from '../src/domain/record'
import { createDemoSession } from '../src/app/session'
import { openRepository, type Repository } from '../src/records/repository'
import type { ApprovedTask } from '../src/domain/types'

const task = lv1 as ApprovedTask
let n = 0
const aid = () => `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

let repo: Repository
beforeEach(async () => {
  indexedDB = new IDBFactory() // 테스트마다 빈 DB
  repo = await openRepository()
})

function draftFor(code = 'A-01') {
  const session = createDemoSession({ studentCode: code, sessionCode: 'DEMO-ONLY', attemptRole: 'practice' })
  const run = createTaskRun(task, { difficultyMode: 'guided' })
  return { session, run }
}

describe('저장소 — 초안', () => {
  test('초안을 저장하면 transaction 완료 뒤 같은 recordId로 읽힌다', async () => {
    const { session, run } = draftFor()
    const r = await repo.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run), savedAt: '2026-10-21T13:00:00Z' })
    expect(r.status).toBe('saved')
    const loaded = await repo.loadDraft(session.recordId)
    expect(loaded?.session.anonymousStudentCode).toBe('A-01')
    expect(loaded?.snapshot.completedSteps).toEqual([])
  })

  test('같은 recordId로 다시 저장하면 덮어쓰고(새 ID 없음) 최신 상태가 읽힌다', async () => {
    const { session, run } = draftFor()
    await repo.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run), savedAt: 't1' })
    const run2 = attempt(run, { type: 'step', stepId: 'ppe' }, aid()).run
    await repo.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run2), savedAt: 't2' })
    expect((await repo.listDrafts()).length).toBe(1)
    expect((await repo.loadDraft(session.recordId))?.snapshot.completedSteps).toEqual(['ppe'])
  })

  test('저장 실패는 예외가 아니라 failed 상태로 돌려준다', async () => {
    const broken = await openRepository({ failWrites: true })
    const { session, run } = draftFor()
    const r = await broken.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run), savedAt: 't' })
    expect(r.status).toBe('failed')
    expect(r.errorCode).toBeTruthy()
  })
})

describe('저장소 — 확정 기록과 대기열', () => {
  test('확정은 payload와 envelope를 한 트랜잭션에 저장하고 초안을 지운다', async () => {
    const { session, run } = draftFor()
    await repo.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run), savedAt: 't' })
    const payload = buildRecordPayload(run, session, { completedAtIso: '2026-10-21T13:05:00Z', completionStatus: 'aborted' })
    const r = await repo.freezeRecord(payload)
    expect(r.status).toBe('saved')
    expect(await repo.loadDraft(session.recordId)).toBeNull()
    const stored = await repo.loadRecord(session.recordId)
    expect(stored?.payload.recordId).toBe(session.recordId)
    expect(stored?.envelope).toMatchObject({ recordId: session.recordId, localSaveStatus: 'saved', uploadStatus: 'pending', receiptId: null, uploadAttemptCount: 0 })
  })

  test('같은 recordId를 두 번 확정하면 두 번째는 거절되고 첫 내용이 남는다', async () => {
    const { session, run } = draftFor()
    const payload = buildRecordPayload(run, session, { completedAtIso: 't1', completionStatus: 'aborted' })
    await repo.freezeRecord(payload)
    const again = await repo.freezeRecord({ ...payload, completedAt: 't2' })
    expect(again.status).toBe('failed')
    expect(again.errorCode).toBe('ALREADY_FROZEN')
    expect((await repo.loadRecord(session.recordId))?.payload.completedAt).toBe('t1')
  })

  test('다음 학생 시작(현재 포인터 초기화)은 이전 학생의 미접수 기록을 지우지 않는다', async () => {
    const a = draftFor('A-01')
    await repo.freezeRecord(buildRecordPayload(a.run, a.session, { completedAtIso: 't', completionStatus: 'aborted' }))
    repo.setCurrentRecordId(a.session.recordId)
    repo.clearCurrent()
    expect(repo.getCurrentRecordId()).toBeNull()
    const outbox = await repo.listOutbox()
    expect(outbox.map((o) => o.payload.anonymousStudentCode)).toEqual(['A-01'])
    expect(outbox[0]!.envelope.uploadStatus).toBe('pending')
  })

  test('대기열은 접수 확인(acknowledged)된 기록을 제외한다', async () => {
    const a = draftFor('A-01')
    await repo.freezeRecord(buildRecordPayload(a.run, a.session, { completedAtIso: 't', completionStatus: 'aborted' }))
    await repo.updateEnvelope(a.session.recordId, { uploadStatus: 'acknowledged', receiptId: 'R-1', uploadedAt: 't', payloadHash: 'a'.repeat(64) })
    expect(await repo.listOutbox()).toEqual([])
    expect((await repo.listRecords()).length).toBe(1)
  })
})
