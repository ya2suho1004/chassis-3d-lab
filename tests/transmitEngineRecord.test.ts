// 전송 거절 버그 회귀 시험(2026-11-09 발견).
// 엔진이 만든 사건에 값이 undefined인 칸이 있으면(정답의 reasonCode 등) IndexedDB가 그 칸을 보존하고,
// 전송 전 해시 계산(canonicalize)이 예외를 던져 서버로 가기도 전에 INVALID_PAYLOAD로 거절되었다.
// 그래서 이 파일은 '엔진 → IndexedDB → 대기열 → 실제 수신 본체(handleSubmit)'를 끝까지 잇는다. 네트워크 없음, 합성 코드만.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import turn1 from '../src/data/tasks/task.min-turning-radius.case-lv1.json'
import { createDemoSession } from '../src/app/session'
import { canonicalize, payloadHash, stripUndefinedKeys } from '../src/delivery/jcs'
import { processOutbox } from '../src/delivery/outbox'
import { inspectPerformance } from '../src/domain/npcInspection'
import { buildRecordPayload, type RecordPayload } from '../src/domain/record'
import { attempt, createTaskRun, markFeedbackShown, requestHint, submitResponse, type TaskRun } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'
import { openRepository, type Repository } from '../src/records/repository'
import { handleSubmit, parseConfig, type NewRow, type SubmitStore } from '../supabase/functions/_shared/submitCore'

const NOW = new Date('2026-11-09T05:00:00.000Z')
let n = 0
const aid = () => `50000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const task = turn1 as unknown as ApprovedTask

function keysWithUndefined(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => keysWithUndefined(v, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => (v === undefined ? [`${path}.${k}`] : keysWithUndefined(v, `${path}.${k}`)))
  }
  return []
}

/** 끝까지 수행한 기록: 정답·오답·형식 오류·도움 요청·피드백 표시가 모두 들어 있다 */
function completedRun(): TaskRun {
  let run = createTaskRun(task, { difficultyMode: 'unguided', displayMode: 'threeD' })
  const step = (s: string) => { run = attempt(run, { type: 'step', stepId: s }, aid()).run }
  const ans = (i: string, v: string) => { run = submitResponse(run, i, v, aid()).run }
  for (const s of ['ppe', 'engineOff', 'turntable', 'direction', 'steer']) step(s)
  ans('leftAngle', '각도') // 형식 오류: 단계 없는 actionBlocked
  run = requestHint(run, aid()).run
  run = markFeedbackShown(run, 'hint', 'hint_general').run // 항목 없는 feedbackShown
  ans('leftAngle', '35'); ans('rightAngle', '30'); step('read'); step('return')
  ans('radius', '4.8'); ans('radius', '5.5'); ans('vehicleCondition', 'pass'); step('record')
  run = inspectPerformance(run).run
  run = requestHint(run, aid()).run // 끝난 뒤 도움 요청: 다음 단계가 없다
  return run
}

function payloadOf(run: TaskRun): RecordPayload {
  const session = createDemoSession({ studentCode: 'D-02', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', vehicleEntryDirection: null, task, difficultyMode: 'unguided' })
  return buildRecordPayload(run, session, { completedAtIso: new Date(run.startedAtMs + 60000).toISOString(), completionStatus: 'completed' })
}

/** 이전 판 앱이 저장한 기록과 같은 모양: 사건에 값이 undefined인 칸이 남아 있다 */
function legacyPayload(): RecordPayload {
  const p = payloadOf(completedRun())
  const stepEvents = p.stepEvents.map((e) => {
    if (e.type === 'answerSubmitted' && e.reasonCode === undefined) return { ...e, reasonCode: undefined }
    if (e.type === 'actionBlocked') return { ...e, stepId: undefined }
    return e
  })
  return { ...p, stepEvents } as RecordPayload
}

function realServer() {
  const rows: NewRow[] = []
  const store: SubmitStore = {
    async findByRecordId(rid) { return rows.filter((r) => r.recordId === rid) },
    async insertIfAbsent(row) { if (rows.some((r) => r.recordId === row.recordId)) return 'exists'; rows.push(row); return 'inserted' },
    async countRows() { return rows.length },
  }
  let u = 0
  const fetch = (async (_url: string, init: RequestInit) => {
    const ack = await handleSubmit('text/plain;charset=UTF-8', init.body as string, {
      store,
      config: () => parseConfig('2027-12-31T00:00:00Z', '50'),
      now: () => NOW.getTime(),
      uuid: () => `receipt-${++u}`,
    })
    return new Response(JSON.stringify(ack), { status: 200 })
  }) as unknown as typeof globalThis.fetch
  return { rows, deps: { fetch, endpointUrl: 'https://fake.invalid/submit', now: () => NOW } }
}

let repo: Repository
beforeEach(async () => { indexedDB = new IDBFactory(); repo = await openRepository() })

describe('엔진이 만드는 사건', () => {
  test('값이 없는 칸을 만들지 않는다(정답·형식 오류·도움 요청·피드백 표시)', () => {
    const run = completedRun()
    expect(run.events.some((e) => e.type === 'answerSubmitted')).toBe(true)
    expect(keysWithUndefined(run.events)).toEqual([])
  })
})

describe('엔진 → IndexedDB → 대기열 → 실제 수신 본체', () => {
  test('정답이 있는 완료 기록이 서버에 접수되고, 서버와 이 기기의 해시가 같다', async () => {
    const { rows, deps } = realServer()
    const p = payloadOf(completedRun())
    await repo.freezeRecord(p)
    expect(await processOutbox(repo, deps)).toEqual([{ recordId: p.recordId, outcome: 'acknowledged', code: null }])
    expect(rows).toHaveLength(1)
    const stored = await repo.loadRecord(p.recordId)
    expect(stored?.envelope).toMatchObject({ uploadStatus: 'acknowledged', payloadHash: rows[0]!.payloadHash, lastErrorCode: null })
    expect(rows[0]!.payloadHash).toBe(await payloadHash(JSON.parse(JSON.stringify(p))))
  })

  test('이전 판이 저장한 기록(빈 칸 있음)도 그대로 보낼 수 있고, 빈 칸 없는 기록과 해시 규칙이 같다', async () => {
    const { rows, deps } = realServer()
    const p = legacyPayload()
    expect(keysWithUndefined(p).length).toBeGreaterThan(0)
    await repo.freezeRecord(p)
    expect((await processOutbox(repo, deps))[0]).toMatchObject({ outcome: 'acknowledged' })
    expect(rows[0]!.payloadHash).toBe(await payloadHash(JSON.parse(JSON.stringify(p))))
  })
})

describe('이 버그로 이미 거절된 기록 되살리기', () => {
  const rejectedLegacy = async () => {
    const p = legacyPayload()
    await repo.freezeRecord(p)
    await repo.updateEnvelope(p.recordId, { uploadStatus: 'rejected', lastErrorCode: 'INVALID_PAYLOAD', uploadAttemptCount: 2, nextRetryAt: null })
    return p
  }

  test('보통 전송 한 번으로 같은 번호·같은 원본이 접수되고, 저장된 원본은 고치지 않는다', async () => {
    const { rows, deps } = realServer()
    const p = await rejectedLegacy()
    const before = await repo.loadRecord(p.recordId)
    expect((await processOutbox(repo, deps))[0]).toEqual({ recordId: p.recordId, outcome: 'acknowledged', code: null })
    const after = await repo.loadRecord(p.recordId)
    expect(rows.map((r) => r.recordId)).toEqual([p.recordId])
    expect(after?.envelope).toMatchObject({ uploadStatus: 'acknowledged', lastErrorCode: null, uploadAttemptCount: 3 })
    expect(after?.payload).toStrictEqual(before?.payload)
    expect(keysWithUndefined(after?.payload).length).toBeGreaterThan(0)
  })

  test('되살린 뒤 네트워크가 끊기면 다시 거절로 돌아가지 않고 재확인 대기가 된다', async () => {
    const p = await rejectedLegacy()
    const deps = { fetch: (async () => { throw new Error('offline') }) as unknown as typeof fetch, endpointUrl: 'https://fake.invalid/submit', now: () => NOW }
    expect((await processOutbox(repo, deps))[0]).toMatchObject({ outcome: 'confirmationPending', code: 'NETWORK_ERROR' })
    expect((await repo.loadRecord(p.recordId))?.envelope.uploadStatus).toBe('confirmationPending')
  })

  test('빈 칸이 없는 거절 기록(서버가 거절한 것)은 전과 같이 건너뛴다, 강제 재전송이어도', async () => {
    const { rows, deps } = realServer()
    const p = payloadOf(completedRun())
    await repo.freezeRecord(p)
    await repo.updateEnvelope(p.recordId, { uploadStatus: 'rejected', lastErrorCode: 'INVALID_PAYLOAD' })
    expect((await processOutbox(repo, deps, { force: true }))[0]).toMatchObject({ outcome: 'skipped' })
    expect(rows).toHaveLength(0)
  })

  test('빈 칸이 있어도 다른 이유의 거절(세션 불허)은 되살리지 않는다', async () => {
    const { rows, deps } = realServer()
    const p = legacyPayload()
    await repo.freezeRecord(p)
    await repo.updateEnvelope(p.recordId, { uploadStatus: 'rejected', lastErrorCode: 'SESSION_NOT_ALLOWED' })
    expect((await processOutbox(repo, deps, { force: true }))[0]).toMatchObject({ outcome: 'skipped' })
    expect(rows).toHaveLength(0)
  })

  test('빈 칸 말고 진짜 잘못이 있는 기록(NaN)은 되살리지 않는다', async () => {
    const { rows, deps } = realServer()
    const p = { ...legacyPayload(), activeTimeMs: Number.NaN } as RecordPayload
    await repo.freezeRecord(p)
    await repo.updateEnvelope(p.recordId, { uploadStatus: 'rejected', lastErrorCode: 'INVALID_PAYLOAD' })
    expect((await processOutbox(repo, deps, { force: true }))[0]).toMatchObject({ outcome: 'skipped' })
    expect(rows).toHaveLength(0)
  })
})

describe('진짜 잘못은 전송 전에 계속 거절한다', () => {
  test('NaN이 있으면 빈 칸을 정리한 뒤에도 INVALID_PAYLOAD, 서버로 가지 않는다', async () => {
    const { rows, deps } = realServer()
    const p = { ...payloadOf(completedRun()), activeTimeMs: Number.NaN } as RecordPayload
    await repo.freezeRecord(p)
    expect((await processOutbox(repo, deps))[0]).toEqual({ recordId: p.recordId, outcome: 'rejected', code: 'INVALID_PAYLOAD' })
    expect(rows).toHaveLength(0)
  })
})

describe('stripUndefinedKeys', () => {
  test('객체의 undefined 칸만 지우고 null·0·빈 문자열·순서는 그대로 둔다, 원본은 건드리지 않는다', () => {
    const input = { b: undefined, a: null, c: 0, d: '', e: [{ x: undefined, y: false }], f: { g: undefined } }
    const out = stripUndefinedKeys(input)
    expect(JSON.stringify(out)).toBe('{"a":null,"c":0,"d":"","e":[{"y":false}],"f":{}}')
    expect(Object.keys(input)).toContain('b')
    expect(canonicalize(out)).toBe(canonicalize(JSON.parse(JSON.stringify(input))))
  })

  test('배열 안의 undefined는 지우지 않는다(자리가 밀리므로 그대로 거절되게 둔다)', () => {
    expect(() => canonicalize(stripUndefinedKeys([1, undefined]))).toThrow()
  })
})
