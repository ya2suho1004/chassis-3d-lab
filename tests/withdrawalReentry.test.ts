// H2 참여 철회: 절차서(docs/research/withdrawal/)가 기대는 동작을 합성 자료로 확인한다.
// 기기 대기열 → 실제 수신 본체(handleSubmit)를 잇고 서버 줄을 지운 뒤, 무엇이 다시 들어오는지 본다. 네트워크 없음.
// '알려진 위험'으로 표시한 시험은 바람직한 동작이 아니라 지금 동작을 고정한다. 절차서가 이 위험을 막는 순서를 따르게 한다.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import fs from 'node:fs'
import { beforeEach, describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createDemoSession } from '../src/app/session'
import { listChatTurns, saveChatTurn } from '../src/chat/chatStore'
import { processOutbox } from '../src/delivery/outbox'
import { buildRecordPayload } from '../src/domain/record'
import { createTaskRun } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'
import { reconcileSession } from '../src/records/reconcile'
import { openRepository, type Repository } from '../src/records/repository'
import { handleSubmit, parseConfig, type NewRow, type SubmitStore } from '../supabase/functions/_shared/submitCore'

const NOW = new Date('2026-11-09T05:00:00.000Z')
const task = lv1 as unknown as ApprovedTask

beforeEach(() => { indexedDB = new IDBFactory() })

function fakeServer(acceptUntil = '2027-12-31T00:00:00Z') {
  const rows: NewRow[] = []
  const store: SubmitStore = {
    async findByRecordId(rid) { return rows.filter((r) => r.recordId === rid) },
    async insertIfAbsent(row) { if (rows.some((r) => r.recordId === row.recordId)) return 'exists'; rows.push(row); return 'inserted' },
    async countRows() { return rows.length },
  }
  let u = 0
  let requests = 0
  let loseNextAck = false
  const fetch = (async (_url: string, init: RequestInit) => {
    requests++
    const ack = await handleSubmit('text/plain;charset=UTF-8', init.body as string, {
      store,
      config: () => parseConfig(acceptUntil, '50'),
      now: () => NOW.getTime(),
      uuid: () => `90000000-0000-4000-8000-${String(++u).padStart(12, '0')}`,
    })
    if (loseNextAck) { loseNextAck = false; throw new TypeError('응답 유실') } // 서버는 저장했지만 기기는 응답을 받지 못함
    return new Response(JSON.stringify(ack), { status: 200 })
  }) as unknown as typeof globalThis.fetch
  /** 절차서의 서버 삭제: 세션 + 익명 코드로 지운다 */
  const withdraw = (code: string, session = 'DEMO-ONLY') => {
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.anonymousStudentCode === code && rows[i]!.sessionCode === session) rows.splice(i, 1)
  }
  return { rows, fetch, withdraw, requests: () => requests, loseNextAck: () => { loseNextAck = true }, deps: { fetch, endpointUrl: 'https://receiver.test/submit', now: () => NOW } }
}

async function finishRun(repo: Repository, code: string) {
  const session = createDemoSession({ studentCode: code, sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', vehicleEntryDirection: null, task, difficultyMode: 'guided' })
  const run = createTaskRun(task, { difficultyMode: 'guided' })
  const payload = buildRecordPayload(run, session, { completedAtIso: NOW.toISOString(), completionStatus: 'aborted' })
  expect((await repo.freezeRecord(payload)).status).toBe('saved')
  return payload
}

describe('접수 확인까지 끝난 기록', () => {
  test('서버에서 지운 뒤 교사가 전송·강제 재전송을 눌러도 다시 가지 않는다', async () => {
    const s = fakeServer()
    const repo = await openRepository()
    await finishRun(repo, 'D-11')
    expect((await processOutbox(repo, s.deps))[0]?.outcome).toBe('acknowledged')
    const sent = s.requests()
    s.withdraw('D-11')
    expect(s.rows.length).toBe(0)
    expect(await processOutbox(repo, s.deps)).toEqual([])
    expect(await processOutbox(repo, s.deps, { force: true })).toEqual([])
    expect(s.requests()).toBe(sent)
    expect(s.rows.length).toBe(0)
  })

  test('이 기기에 남아 있으면 대조에서 서버에 없음으로 나오고, 다시 보내라고 하지 않는다', async () => {
    const s = fakeServer()
    const repo = await openRepository()
    await finishRun(repo, 'D-11')
    await processOutbox(repo, s.deps)
    s.withdraw('D-11')
    const r = await reconcileSession({ sessionCode: 'DEMO-ONLY', records: await repo.listRecords(), drafts: [], receipts: [] })
    expect(r.rows[0]?.verdict).toBe('missingOnServer')
    expect(r.rows[0]?.action).not.toMatch(/전송/)
  })
})

describe('알려진 위험: 재유입', () => {
  test('접수 확인 전 기록이 기기에 남아 있으면 서버에서 지워도 전송 버튼으로 다시 들어온다', async () => {
    const s = fakeServer()
    const repo = await openRepository()
    const p = await finishRun(repo, 'D-11')
    s.loseNextAck()
    expect((await processOutbox(repo, s.deps))[0]?.outcome).toBe('confirmationPending')
    expect(s.rows.length).toBe(1) // 서버에는 들어갔지만 기기는 확인을 받지 못한 상태
    const firstReceipt = s.rows[0]!.receiptId
    s.withdraw('D-11')
    const r = await processOutbox(repo, s.deps, { force: true })
    expect(r[0]?.outcome).toBe('acknowledged')
    expect(s.rows.map((x) => x.recordId)).toEqual([p.recordId])
    expect(s.rows[0]!.receiptId).not.toBe(firstReceipt)
  })

  test('전송 버튼은 코드를 가려 보내지 않는다: 철회자의 미접수 기록도 다른 학생 기록과 함께 간다', async () => {
    const s = fakeServer()
    const repo = await openRepository()
    await finishRun(repo, 'D-11')
    await finishRun(repo, 'D-12')
    await processOutbox(repo, s.deps)
    expect(s.rows.map((x) => x.anonymousStudentCode).sort()).toEqual(['D-11', 'D-12'])
  })

  test('철회한 코드를 다시 쓰면 서버가 막지 않는다', async () => {
    const s = fakeServer()
    const repo = await openRepository()
    await finishRun(repo, 'D-11')
    await processOutbox(repo, s.deps)
    s.withdraw('D-11')
    await finishRun(repo, 'D-11')
    await processOutbox(repo, s.deps)
    expect(s.rows.map((x) => x.anonymousStudentCode)).toEqual(['D-11'])
  })
})

describe('재유입을 막는 조치', () => {
  test('접수 기간이 지나면 남은 기록을 보내도 새로 들어오지 않는다', async () => {
    const s = fakeServer('2026-11-01T00:00:00Z')
    const repo = await openRepository()
    await finishRun(repo, 'D-11')
    const r = await processOutbox(repo, s.deps, { force: true })
    expect(r[0]?.code).toBe('SESSION_NOT_ALLOWED')
    expect(s.rows.length).toBe(0)
  })

  test('기기 저장소를 비우면 보낼 것이 없고 대화 사본도 사라진다', async () => {
    const s = fakeServer()
    const repo = await openRepository()
    await finishRun(repo, 'D-11')
    await saveChatTurn({ id: 'c1', createdAt: NOW.toISOString(), sessionCode: 'DEMO-ONLY', anonymousStudentCode: 'D-11', recordId: null, stepId: null, difficultyMode: 'guided', turnIndex: 0, question: '합성 질문', answer: null, serverLogged: false, chatId: null, errorCode: null })
    expect((await listChatTurns()).length).toBe(1)

    indexedDB = new IDBFactory() // 사이트 데이터 삭제와 같은 결과: 두 저장소가 모두 빈다
    const after = await openRepository()
    expect(await processOutbox(after, s.deps, { force: true })).toEqual([])
    expect(s.requests()).toBe(0)
    expect(await listChatTurns()).toEqual([])
  })

  test('기기의 대화 사본에는 가리기 전 질문이 있으므로 수행 기록과 따로 처리해야 한다', () => {
    const src = fs.readFileSync('src/chat/chatStore.ts', 'utf8')
    expect(src).toMatch(/CHAT_DB_NAME = 'chassis-3d-lab-chat'/)
    expect(fs.readFileSync('src/records/repository.ts', 'utf8')).toMatch(/DB_NAME = 'chassis-3d-lab'/)
    expect(src).not.toMatch(/delete/)
  })
})

describe('전송은 교사 조작으로만', () => {
  test('대기열 처리를 부르는 곳은 교사 화면뿐이다(자동 재전송으로 재유입되지 않음)', () => {
    const screens = ['src/App.tsx', 'src/screens/StartScreen.tsx', 'src/screens/LabScreen.tsx', 'src/screens/TaskScreen.tsx', 'src/screens/ResultScreen.tsx', 'src/screens/ResumeScreen.tsx']
    for (const f of screens) expect(fs.readFileSync(f, 'utf8')).not.toMatch(/processOutbox/)
    expect(fs.readFileSync('src/screens/TeacherPanel.tsx', 'utf8')).toMatch(/processOutbox\(/)
  })
})

describe('서버 삭제 스크립트', () => {
  const del = fs.readFileSync('docs/research/withdrawal/2_서버삭제.sql', 'utf8')
  const preview = fs.readFileSync('docs/research/withdrawal/1_미리보기.sql', 'utf8')
  const migration = fs.readFileSync('supabase/migrations/20261028120000_init_records_chat_sessions.sql', 'utf8')
  const code = (sql: string) => sql.replace(/--.*$/gm, '')

  test('삭제는 두 표에 대해서만, 세션과 익명 코드를 함께 지정해서 한다', () => {
    const stmts = code(del).match(/delete\s+from[^;]+;/gi) ?? []
    expect(stmts.length).toBe(2)
    expect(stmts.join()).toMatch(/public\.chat_logs/)
    expect(stmts.join()).toMatch(/public\.records/)
    for (const s of stmts) {
      expect(s).toMatch(/session_code\s*=\s*v_session/)
      expect(s).toMatch(/anonymous_student_code\s*=\s*v_code/)
    }
    expect(code(del)).not.toMatch(/\b(truncate|drop|update)\b/i)
  })

  test('값을 채우지 않거나 미리보기 건수와 다르면 전체를 되돌린다', () => {
    expect(code(del)).toMatch(/v_expected_records\s+constant\s+integer\s*:=\s*-1/)
    expect(code(del)).toMatch(/v_expected_chats\s+constant\s+integer\s*:=\s*-1/)
    expect(code(del)).toMatch(/raise exception/)
    expect(code(del)).toMatch(/^\s*do \$\$/m) // 한 덩어리로 실행: 예외가 나면 모두 되돌아간다
  })

  test('미리보기는 읽기만 하고 질문·답·원본 내용을 꺼내지 않는다', () => {
    expect(code(preview)).not.toMatch(/\b(delete|insert|update|truncate|drop)\b/i)
    expect(code(preview)).not.toMatch(/payload_json|question_masked|answer/)
  })

  test('스크립트의 표·칸 이름이 마이그레이션과 맞는다', () => {
    for (const col of ['record_id', 'accepted_at', 'session_code', 'anonymous_student_code', 'chat_id', 'created_at', 'status']) {
      expect(migration).toContain(col)
      expect(preview).toContain(col)
    }
  })
})
