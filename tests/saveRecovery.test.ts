// D4(2026-11-08 Codex 회의): 저장 실패 뒤 같은 수행을 복구하는 경로.
//  1) 게임 화면에서도 저장 상태가 늘 보이고, 실패하면 그 자리에서 다시 저장한다.
//  2) 확정 저장이 실패하면 결과 화면에서 '같은 원본'을 다시 저장한다(수행 번호·완료 시각 그대로).
//  3) 현재 수행 포인터가 없어도 같은 익명 코드·같은 세션으로 시작하면 남은 초안을 찾아 이어 간다.
// 새로 모으는 자료 없음(이 기기 저장소만 사용, 네트워크 없음).
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import fs from 'node:fs'
import { beforeEach, describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createTaskRun, serializeRun } from '../src/domain/taskEngine'
import { buildRecordPayload } from '../src/domain/record'
import { createDemoSession } from '../src/app/session'
import { openRepository, type Draft } from '../src/records/repository'
import { findDraftForCode, retryFreeze, saveBadge, startOrResume } from '../src/app/saveRecovery'
import type { ApprovedTask } from '../src/domain/types'

const task = lv1 as ApprovedTask

beforeEach(() => {
  indexedDB = new IDBFactory()
})

function payloadFor(code = 'A-01') {
  const session = createDemoSession({ studentCode: code, sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview' })
  const run = createTaskRun(task, { difficultyMode: 'guided' })
  const payload = buildRecordPayload(run, session, { completedAtIso: '2026-11-08T05:00:00.000Z', completionStatus: 'aborted' })
  return { session, run, payload }
}

describe('확정 저장 다시 하기(retryFreeze)', () => {
  test('처음 확정 저장이 실패해도 같은 원본으로 다시 저장되고 초안이 지워진다', async () => {
    const { session, run, payload } = payloadFor()
    const broken = await openRepository({ failWrites: true })
    const repo = await openRepository()
    await repo.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run), savedAt: '2026-11-08T04:59:00.000Z' })
    expect((await broken.freezeRecord(payload)).status).toBe('failed')

    const r = await retryFreeze(repo, payload)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.envelope.localSaveStatus).toBe('saved')
    expect(r.payload).toEqual(payload) // 수행 번호·완료 시각이 처음 만든 것 그대로
    expect(await repo.loadDraft(session.recordId)).toBeNull()
    expect((await repo.listRecords()).length).toBe(1)
  })

  test('여전히 실패하면 예외 없이 오류 코드를 돌려준다', async () => {
    const { payload } = payloadFor()
    const broken = await openRepository({ failWrites: true })
    expect(await retryFreeze(broken, payload)).toEqual({ ok: false, errorCode: 'SIMULATED_WRITE_FAILURE' })
  })

  test('이미 확정돼 있으면(실패로 보였지만 실제로는 저장된 경우) 저장된 원본을 그대로 쓴다', async () => {
    const { payload } = payloadFor()
    const repo = await openRepository()
    await repo.freezeRecord(payload)
    const again = await retryFreeze(repo, { ...payload, completedAt: '2026-11-08T05:00:09.000Z' } as typeof payload)
    expect(again.ok).toBe(true)
    if (again.ok) expect(again.payload).toEqual(payload)
    expect((await repo.listRecords()).length).toBe(1) // 두 번 저장하지 않는다
  })
})

describe('포인터 없이 남은 초안 찾기(findDraftForCode)', () => {
  const d = (code: string, sessionCode: string, savedAt: string, recordId: string) => ({ recordId, savedAt, session: { anonymousStudentCode: code, sessionCode } }) as unknown as Draft

  test('같은 익명 코드·같은 세션의 초안 중 가장 최근 것을 고른다', () => {
    const list = [d('A-01', 'DEMO-ONLY', '2026-11-08T01:00:00Z', 'old'), d('A-01', 'DEMO-ONLY', '2026-11-08T02:00:00Z', 'new'), d('A-02', 'DEMO-ONLY', '2026-11-08T03:00:00Z', 'other')]
    expect(findDraftForCode(list, 'A-01', 'DEMO-ONLY')?.recordId).toBe('new')
  })

  test('코드나 세션이 다르면 고르지 않는다(다른 반·다른 학생 초안을 보여 주지 않음)', () => {
    const list = [d('A-01', 'CLASS-B', '2026-11-08T02:00:00Z', 'b'), d('A-02', 'DEMO-ONLY', '2026-11-08T02:00:00Z', 'x')]
    expect(findDraftForCode(list, 'A-01', 'DEMO-ONLY')).toBeNull()
    expect(findDraftForCode([], 'A-01', 'DEMO-ONLY')).toBeNull()
  })
})

describe('시작 버튼 갈림길(startOrResume) — 독립 검토 3번', () => {
  async function repoWithDraft() {
    const { session, run } = payloadFor('A-01')
    const repo = await openRepository()
    await repo.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run), savedAt: '2026-11-08T04:59:00.000Z' })
    return { repo, session }
  }

  test('남은 초안이 없으면 바로 새 수행을 시작한다', async () => {
    const repo = await openRepository()
    let begun = 0
    await startOrResume({ listDrafts: () => repo.listDrafts(), code: 'A-01', sessionCode: 'DEMO-ONLY', begin: async () => { begun++ }, onFound: () => { throw new Error('초안이 없는데 복구 화면으로 감') } })
    expect(begun).toBe(1)
  })

  test('남은 초안이 있으면 새 수행을 시작하지 않고 복구 화면에 넘긴다', async () => {
    const { repo, session } = await repoWithDraft()
    let begun = 0
    let foundId: string | null = null
    await startOrResume({ listDrafts: () => repo.listDrafts(), code: 'A-01', sessionCode: 'DEMO-ONLY', begin: async () => { begun++ }, onFound: (d) => { foundId = d.recordId } })
    expect(foundId).toBe(session.recordId)
    expect(begun).toBe(0)
  })

  test('복구 화면의 새 수행 시작은 초안을 다시 찾지 않고 곧바로 시작하며, 초안은 그대로 남는다', async () => {
    const { repo, session } = await repoWithDraft()
    let begun = 0
    let lookups = 0
    let startFresh: (() => Promise<void>) | null = null
    const listDrafts = () => { lookups++; return repo.listDrafts() }
    await startOrResume({ listDrafts, code: 'A-01', sessionCode: 'DEMO-ONLY', begin: async () => { begun++ }, onFound: (_, fresh) => { startFresh = fresh } })
    expect(lookups).toBe(1)
    await startFresh!()
    expect(begun).toBe(1)
    expect(lookups).toBe(1) // 다시 찾으면 복구 화면으로 되돌아간다(고친 결함)
    expect((await repo.loadDraft(session.recordId))?.recordId).toBe(session.recordId)
  })
})

describe('저장 상태 표시(saveBadge)', () => {
  test('저장됨·저장 중·저장 실패, 기록 없이 하기는 표시하지 않는다', () => {
    expect(saveBadge('saved', false)).toEqual({ text: '저장됨', tone: 'ok' })
    expect(saveBadge('saving', false)).toEqual({ text: '저장 중…', tone: 'busy' })
    expect(saveBadge('failed', false)).toEqual({ text: '저장 실패', tone: 'bad' })
    expect(saveBadge('failed', true)).toBeNull()
  })
})

describe('화면 연결', () => {
  const read = (p: string) => fs.readFileSync(p, 'utf8')

  test('TaskScreen은 저장 상태와 다시 저장을 게임 화면에 넘기고, 패널에도 다시 저장 버튼을 둔다', () => {
    const src = read('src/screens/TaskScreen.tsx')
    expect(src).toMatch(/saveStatus,\s*retrySave/)
    expect(src).toMatch(/onClick=\{retrySave\}/)
  })

  test('게임 화면 상단 배지에 저장 상태가 늘 보이고, 실패하면 다시 저장 버튼이 된다', () => {
    const src = read('src/screens/LabScreen.tsx')
    expect(src).toMatch(/saveBadge\(ctx\.saveStatus, noRecord\)/)
    expect(src).toMatch(/ctx\.retrySave/)
  })

  test('결과 화면: 확정 저장 실패 시 다시 저장, 저장 전 다음 학생은 한 번 더 확인', () => {
    const src = read('src/screens/ResultScreen.tsx')
    expect(src).toMatch(/onRetrySave/)
    expect(src).toMatch(/다시 저장/)
    expect(src).toMatch(/confirmLeave/)
    const app = read('src/App.tsx')
    expect(app).toMatch(/retryFreeze\(repo!?, screen\.frozenPayload!?\)/)
  })

  test('시작 화면은 같은 코드·세션의 남은 초안을 찾아 이어서 하기로 보낸다(초안은 지우지 않고 둘 수 있음)', () => {
    const start = read('src/screens/StartScreen.tsx')
    expect(start).toMatch(/startOrResume\(\{ listDrafts: \(\) => repo\.listDrafts\(\), code: v\.code, sessionCode,/)
    const app = read('src/App.tsx')
    expect(app).toMatch(/setCurrentRecordId\(screen\.draft\.recordId\)/)
    expect(app).toMatch(/keepDraft/)
  })

  test('코드로 찾은 초안의 새 수행 시작은 시작 화면으로 돌아가지 않고 그 자리에서 시작한다(독립 검토 3번)', () => {
    const start = read('src/screens/StartScreen.tsx')
    expect(start).toMatch(/startOrResume\(/)
    expect(start).toMatch(/onFound: noRecord \? undefined : onFoundDraft/) // 기록 없이 하기는 초안을 찾지 않는다
    const app = read('src/App.tsx')
    expect(app).toMatch(/await screen\.startFresh\(\)/)
    expect(app).not.toMatch(/if \(screen\.keepDraft\) return setScreen/)
    expect(app).toMatch(/keepDraft=\{!!screen\.startFresh\}/)
  })
})

describe('화면 전환 뒤에도 저장 실패 표시 유지', () => {
  test('LabScreen이 저장 상태를 들고 있다가 새로 붙는 과제 패널(게임·기본 화면 모두)에 넘긴다', () => {
    const src = fs.readFileSync('src/screens/LabScreen.tsx', 'utf8')
    expect(src.match(/initialSaveStatus=\{saveStatusRef\.current\} onSaveStatus=\{onSaveStatus\}/g)?.length).toBe(2)
    const task = fs.readFileSync('src/screens/TaskScreen.tsx', 'utf8')
    expect(task).toMatch(/useState<SaveState>\(initialSaveStatus\)/)
  })

  test('저장 중에 화면이 바뀌면 새 패널이 지금 상태를 다시 저장해 결과를 받는다(독립 검토 4번)', () => {
    const task = fs.readFileSync('src/screens/TaskScreen.tsx', 'utf8')
    expect(task).toMatch(/if \(initialSaveStatus === 'saving'\) retrySave\(\)/)
  })
})
