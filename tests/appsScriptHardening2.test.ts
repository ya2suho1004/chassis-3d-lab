// Codex 회신 B(2026-10-26) 남은 P2 — B3-a·B3-c·B4 날짜·B5 접수시각·스냅샷 이력·시험 코드 범위
import { describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createTaskRun, attempt } from '../src/domain/taskEngine'
import { buildRecordPayload } from '../src/domain/record'
import { createDemoSession } from '../src/app/session'
import type { ApprovedTask } from '../src/domain/types'
import { loadGs, fakeUtilities } from './helpers/gs'
import { fakeSheetServices } from './helpers/gsServices'

const PROPS = { SHEET_ID: 'SHEET-TEST', TAB_NAME: 'canonical', ACCEPT_UNTIL: '2027-12-31T00:00:00Z', MAX_NEW_ROWS: '50', LOCK_WAIT_MS: '10000' }
const FILES = ['Jcs.gs', 'JsonStrict.gs', 'Validate.gs', 'Schemas.gs', 'DemoSnapshots.gs', 'Code.gs']
function server(props: Record<string, string> = PROPS) {
  const svc = fakeSheetServices({ props })
  const gs = loadGs(FILES, { ...svc, Utilities: { ...fakeUtilities, _n: 0 } })
  const post = (body: string) => JSON.parse(gs.doPost({ postData: { contents: body, type: 'text/plain;charset=UTF-8', length: body.length } }).text)
  return { gs, svc, post }
}
const reqOf = (p: unknown) => JSON.stringify({ protocolVersion: '1', payload: p })
const P = demo.payload
let n = 0
const aid = () => `40000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const task = lv1 as ApprovedTask
/** 앱 경로로 만든 기록(허용 스냅샷·D-xx 코드) */
function appPayload(code = 'D-01') {
  const session = createDemoSession({ studentCode: code, sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', vehicleEntryDirection: null, task, difficultyMode: 'guided' })
  let run = createTaskRun(task, { difficultyMode: 'guided', displayMode: 'threeD' })
  run = attempt(run, { type: 'step', stepId: 'ppe' }, aid()).run
  return buildRecordPayload(run, session, { completedAtIso: new Date(run.startedAtMs + 5000).toISOString(), completionStatus: 'aborted' })
}

describe('B3-a 시간 검사는 timeQuality별', () => {
  test('uncertain이면 벽시계 비교를 하지 않고 수락, continuous면 활성시간>벽시계+1 거절', () => {
    const { post } = server()
    const unc: any = JSON.parse(JSON.stringify(P)); unc.timing.timeQuality = 'uncertain'; unc.durationSeconds = 30; unc.completedAt = '2000-01-01T00:00:05Z'; unc.recordId = '00000000-0000-4000-8000-000000000011'
    expect(post(reqOf(unc)).ok).toBe(true)
    const cont: any = JSON.parse(JSON.stringify(P)); cont.durationSeconds = 30; cont.completedAt = '2000-01-01T00:00:05Z'; cont.recordId = '00000000-0000-4000-8000-000000000012'
    expect(post(reqOf(cont))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
})

describe('B3-c 판정 정오 등식과 off 하위 행동 순서', () => {
  test('judgmentCorrect는 판정 항목 최초 정오에서 나와야 한다', () => {
    const { post } = server()
    const base: any = JSON.parse(JSON.stringify(P))
    base.judgmentAnswers = [{ itemId: 'vehicleCondition', firstAnswer: 'pass', firstCorrect: false, finalAnswer: 'pass', finalCorrect: false }]
    base.judgmentCorrect = true
    expect(post(reqOf(base))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    base.judgmentCorrect = false; base.recordId = '00000000-0000-4000-8000-000000000013'
    expect(post(reqOf(base)).ok).toBe(true)
  })
  test('등록되지 않은 stepId(off:warp)·하위 행동 없는 off 완료·선행(read) 없는 off 순서는 거절(정상 전체 이력 수락은 hardening3)', () => {
    const { post } = server()
    const ev = (p: any, stepId: string) => ({ eventId: `50000000-0000-4000-8000-${String(p.stepEvents.length + 1).padStart(12, '0')}`, sequence: p.stepEvents.length + 1, elapsedMs: (p.stepEvents.at(-1)?.elapsedMs ?? 0) + 1, type: 'stepCompleted', stepId })
    const warp = appPayload('D-02') as any; warp.stepEvents.push(ev(warp, 'off:warp'))
    expect(post(reqOf(warp))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    const early = appPayload('D-03') as any; early.stepEvents.push(ev(early, 'off')); early.stepEvents.push(ev(early, 'off:motorOff'))
    expect(post(reqOf(early))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    const noPrereq = appPayload('D-04') as any; for (const id of ['off:motorOff', 'off:liftUp', 'off:exitVehicle', 'off']) noPrereq.stepEvents.push(ev(noPrereq, id))
    expect(post(reqOf(noPrereq))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' }) // ppe 뒤 바로 off: read 등 선행 없음(C-P2-2)
  })
})

describe('B4 ACCEPT_UNTIL은 실제 달력 날짜·UTC 형식이어야 한다', () => {
  for (const [v, ok] of [['9999', false], ['2099-02-31T00:00:00Z', false], ['2099-02-28T00:00:00+09:00', false], ['2099-02-28T00:00:00Z', true]] as Array<[string, boolean]>) {
    test(`${v} → 신규 접수 ${ok ? '허용' : '차단'}`, () => {
      const { post } = server({ ...PROPS, ACCEPT_UNTIL: v })
      const r = post(reqOf(P))
      if (ok) expect(r.ok).toBe(true); else expect(r).toMatchObject({ ok: false, code: 'SESSION_NOT_ALLOWED' })
    })
  }
})

describe('B5 저장된 acceptedAt은 존재하는 UTC 시각이어야 회수한다', () => {
  test('2026-02-31 → CANONICAL_STORE_INVALID', () => {
    const { svc, post } = server()
    post(reqOf(P))
    svc.rows[1]![2] = '2026-02-31T00:00:00Z'
    expect(post(reqOf(P))).toMatchObject({ ok: false, code: 'CANONICAL_STORE_INVALID' })
  })
})

describe('스냅샷 이력: retired 스냅샷은 기존 receipt 회수만, 신규 접수 불가', () => {
  test('active→retired 전환 뒤 같은 원본은 duplicate, 새 ID는 SESSION_NOT_ALLOWED', () => {
    const { gs, post } = server()
    const p = appPayload('D-05') as any
    const first = post(reqOf(p)); expect(first.ok).toBe(true)
    gs.ALLOWED_SNAPSHOTS[p.sessionSnapshotId].status = 'retired'
    expect(post(reqOf(p))).toEqual({ ...first, duplicate: true })
    expect(post(reqOf({ ...p, recordId: '00000000-0000-4000-8000-000000000021' }))).toMatchObject({ ok: false, code: 'SESSION_NOT_ALLOWED' })
  })
})

describe('시험 코드 범위(설계 15 §2): 시험 배포는 합성 D-xx 코드만 받는다', () => {
  test('A-01은 SESSION_NOT_ALLOWED, D-01은 접수', () => {
    const { post } = server()
    expect(post(reqOf(appPayload('A-01')))).toMatchObject({ ok: false, code: 'SESSION_NOT_ALLOWED' })
    expect(post(reqOf(appPayload('D-01'))).ok).toBe(true)
  })
})
