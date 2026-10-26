// Codex 회신 C: C-P2-2(선행 그래프·parent 중복) · C-P2-3(record 날짜 달력 유효성)
import { describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createTaskRun, attempt, submitResponse } from '../src/domain/taskEngine'
import { buildRecordPayload } from '../src/domain/record'
import { createDemoSession } from '../src/app/session'
import type { ApprovedTask } from '../src/domain/types'
import { loadGs, fakeUtilities } from './helpers/gs'
import { fakeSheetServices } from './helpers/gsServices'

const PROPS = { SHEET_ID: 'SHEET-TEST', TAB_NAME: 'canonical', ACCEPT_UNTIL: '2027-12-31T00:00:00Z', MAX_NEW_ROWS: '50', LOCK_WAIT_MS: '10000' }
const FILES = ['Jcs.gs', 'JsonStrict.gs', 'Validate.gs', 'Schemas.gs', 'DemoSnapshots.gs', 'Code.gs']
function server() {
  const svc = fakeSheetServices({ props: PROPS })
  const gs = loadGs(FILES, { ...svc, Utilities: { ...fakeUtilities, _n: 0 } })
  const post = (body: string) => JSON.parse(gs.doPost({ postData: { contents: body, type: 'text/plain;charset=UTF-8', length: body.length } }).text)
  return { gs, svc, post }
}
const reqOf = (p: unknown) => JSON.stringify({ protocolVersion: '1', payload: p })
const P = demo.payload
const task = lv1 as ApprovedTask
let n = 0
const aid = () => `80000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const session = () => createDemoSession({ studentCode: 'D-07', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', vehicleEntryDirection: null, task, difficultyMode: 'guided' })
const finish = (run: ReturnType<typeof createTaskRun>) => buildRecordPayload(run, session(), { completedAtIso: new Date(run.startedAtMs + 5000).toISOString(), completionStatus: 'aborted' })
function throughOff() {
  let s = createTaskRun(task, { difficultyMode: 'guided', displayMode: 'threeD' })
  s = attempt(s, { type: 'step', stepId: 'ppe' }, aid()).run
  s = attempt(s, { type: 'confirmSafety', conditionId: 's-engine' }, aid()).run
  for (const id of ['tire', 'equip', 'enter']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = submitResponse(s, 'axleWeight', '600', aid()).run
  for (const id of ['axle', 'mode']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = attempt(s, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run
  for (const id of ['lower', 'motor', 'press']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = submitResponse(s, 'left', '240', aid()).run; s = submitResponse(s, 'right', '200', aid()).run
  s = attempt(s, { type: 'step', stepId: 'read' }, aid()).run
  s = attempt(s, { type: 'subStep', stepId: 'off', action: 'motorOff' }, aid()).run
  s = attempt(s, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run
  s = attempt(s, { type: 'subStep', stepId: 'off', action: 'liftUp' }, aid()).run
  s = attempt(s, { type: 'subStep', stepId: 'off', action: 'exitVehicle' }, aid()).run
  expect(s.completedSteps).toContain('off')
  return s
}
const ev = (p: any, stepId: string) => ({ eventId: `90000000-0000-4000-8000-${String(p.stepEvents.length + 1).padStart(12, '0')}`, sequence: p.stepEvents.length + 1, elapsedMs: (p.stepEvents.at(-1)?.elapsedMs ?? 0) + 1, type: 'stepCompleted', stepId })

describe('C-P2-2 parent 단계의 선행 그래프와 중복', () => {
  test('엔진이 만든 정상 이력(ppe…read, off 하위 3개, off)은 접수된다', () => {
    const { post } = server()
    expect(post(reqOf(finish(throughOff()))).ok).toBe(true)
  })
  test('calc 단독, read 없는 off, parent 중복은 INVALID_PAYLOAD', () => {
    const { post, svc } = server()
    const base = finish(createTaskRun(task, { difficultyMode: 'guided', displayMode: 'threeD' })) as any
    const calcOnly = JSON.parse(JSON.stringify(base)); calcOnly.stepEvents.push(ev(calcOnly, 'calc'))
    expect(post(reqOf(calcOnly))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    const noRead = JSON.parse(JSON.stringify(base)); noRead.stepEvents.push(ev(noRead, 'ppe')); for (const id of ['off:motorOff', 'off:liftUp', 'off:exitVehicle', 'off']) noRead.stepEvents.push(ev(noRead, id))
    expect(post(reqOf(noRead))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    const dup = JSON.parse(JSON.stringify(base)); dup.stepEvents.push(ev(dup, 'ppe')); dup.stepEvents.push(ev(dup, 'ppe'))
    expect(post(reqOf(dup))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(svc.rows).toHaveLength(1)
  })
  test('중단 기록의 부분 이력(ppe→tire까지)은 허용된다', () => {
    const { post } = server()
    let s = createTaskRun(task, { difficultyMode: 'guided', displayMode: 'threeD' })
    s = attempt(s, { type: 'step', stepId: 'ppe' }, aid()).run
    s = attempt(s, { type: 'confirmSafety', conditionId: 's-engine' }, aid()).run
    s = attempt(s, { type: 'step', stepId: 'tire' }, aid()).run
    expect(post(reqOf(finish(s))).ok).toBe(true)
  })
})

describe('C-P2-3 record의 startedAt/completedAt은 실제 달력 날짜여야 한다', () => {
  test('2000-02-31은 거절, 윤일 2000-02-29·오프셋·소문자 z는 허용', () => {
    const { post } = server()
    const bad: any = JSON.parse(JSON.stringify(P)); bad.startedAt = '2000-02-31T00:00:00Z'; bad.completedAt = '2000-02-31T00:00:10Z'; bad.durationSeconds = 10
    expect(post(reqOf(bad))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    const leap: any = JSON.parse(JSON.stringify(P)); leap.startedAt = '2000-02-29T00:00:00Z'; leap.completedAt = '2000-02-29T00:00:10Z'; leap.durationSeconds = 10; leap.recordId = '00000000-0000-4000-8000-000000000031'
    expect(post(reqOf(leap)).ok).toBe(true)
    const offs: any = JSON.parse(JSON.stringify(P)); offs.startedAt = '2000-01-01T09:00:00+09:00'; offs.completedAt = '2000-01-01t00:00:10.5z'; offs.durationSeconds = 10; offs.recordId = '00000000-0000-4000-8000-000000000032'
    expect(post(reqOf(offs)).ok).toBe(true)
    const noLeap: any = JSON.parse(JSON.stringify(P)); noLeap.startedAt = '2001-02-29T00:00:00Z'; noLeap.completedAt = '2001-03-01T00:00:00Z'; noLeap.recordId = '00000000-0000-4000-8000-000000000033'
    expect(post(reqOf(noLeap))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
})
