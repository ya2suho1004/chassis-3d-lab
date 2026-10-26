// Codex 회신 D(2026-10-27) 잔여 P2: 옛 초안 시간 품질·off 직후 연결/선행 상속·윤초 호환·원장 예약 ID·검증 정책 이관
import { describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createTaskRun, attempt, submitResponse, serializeRun, rehydrateRun, type RunSnapshot } from '../src/domain/taskEngine'
import { buildRecordPayload } from '../src/domain/record'
import { createDemoSession } from '../src/app/session'
import type { ApprovedTask } from '../src/domain/types'
import { loadGs, fakeUtilities } from './helpers/gs'
import { fakeSheetServices } from './helpers/gsServices'
import { mergeLedger, idOf, SNAPSHOT_RULE_VERSION } from '../scripts/snapshotLib.mjs'

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
const aid = () => `a0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const depsAt = (t: number) => ({ now: () => t, newId: aid })
const session = () => createDemoSession({ studentCode: 'D-09', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', vehicleEntryDirection: null, task, difficultyMode: 'guided' })
const finish = (run: ReturnType<typeof createTaskRun>) => buildRecordPayload(run, session(), { completedAtIso: new Date(run.startedAtMs + 5000).toISOString(), completionStatus: 'aborted' })
function throughRead() {
  let s = createTaskRun(task, { difficultyMode: 'guided', displayMode: 'threeD' })
  s = attempt(s, { type: 'step', stepId: 'ppe' }, aid()).run
  s = attempt(s, { type: 'confirmSafety', conditionId: 's-engine' }, aid()).run
  for (const id of ['tire', 'equip', 'enter']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = submitResponse(s, 'axleWeight', '600', aid()).run
  for (const id of ['axle', 'mode']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = attempt(s, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run
  for (const id of ['lower', 'motor', 'press']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = submitResponse(s, 'left', '240', aid()).run; s = submitResponse(s, 'right', '200', aid()).run
  return attempt(s, { type: 'step', stepId: 'read' }, aid()).run
}
const ev = (p: any, type: string, stepId?: string) => ({ eventId: `b0000000-0000-4000-8000-${String(p.stepEvents.length + 1).padStart(12, '0')}`, sequence: p.stepEvents.length + 1, elapsedMs: (p.stepEvents.at(-1)?.elapsedMs ?? 0) + 1, type, ...(stepId ? { stepId } : {}) })

describe('C-P2-1 저장 시각 근거가 없는 옛 초안은 보수적으로 uncertain', () => {
  test('serializedAtWallMs 없는 스냅샷 → uncertain, 있으면(순방향) resumed', () => {
    const t0 = Date.parse('2026-10-27T00:00:00Z')
    const run = attempt(createTaskRun(task, { difficultyMode: 'guided' }, depsAt(t0)), { type: 'step', stepId: 'ppe' }, aid()).run
    const snap = serializeRun(run)
    const { serializedAtWallMs: _w, ...legacy } = snap
    expect(rehydrateRun(legacy as RunSnapshot, depsAt(t0 + 1000)).timeQuality).toBe('uncertain')
    expect(rehydrateRun(snap, depsAt(t0 + 1000)).timeQuality).toBe('resumed')
  })
})

describe('C-P2-2 off 하위 행동의 선행 상속과 parent 직후 연결', () => {
  test('exitVehicle 바로 다음 사건이 parent off가 아니면 거절(사이에 hintRequested), 엔진 정상 이력은 수락', () => {
    const { post } = server()
    const good = finish((() => { let s = throughRead(); s = attempt(s, { type: 'subStep', stepId: 'off', action: 'motorOff' }, aid()).run; s = attempt(s, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run; s = attempt(s, { type: 'subStep', stepId: 'off', action: 'liftUp' }, aid()).run; return attempt(s, { type: 'subStep', stepId: 'off', action: 'exitVehicle' }, aid()).run })())
    expect(post(reqOf(good)).ok).toBe(true)
    const gap = JSON.parse(JSON.stringify(good)); const idx = gap.stepEvents.findIndex((e: any) => e.stepId === 'off' && e.type === 'stepCompleted')
    const off = gap.stepEvents.splice(idx, 1)[0]
    gap.stepEvents.push({ ...ev(gap, 'hintRequested'), sequence: gap.stepEvents.length + 1 }); gap.hintCount = (gap.hintCount ?? 0) + 1
    gap.stepEvents.push({ ...off, sequence: gap.stepEvents.length + 1, elapsedMs: gap.stepEvents.at(-1).elapsedMs + 1 })
    gap.recordId = '00000000-0000-4000-8000-000000000041'
    expect(post(reqOf(gap))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
  test('read 전에 시작한 off 하위 행동(그 뒤 정상 ppe…read→off)은 거절', () => {
    const { post } = server()
    const base = finish(createTaskRun(task, { difficultyMode: 'guided', displayMode: 'threeD' })) as any
    for (const id of ['off:motorOff', 'off:liftUp', 'off:exitVehicle']) base.stepEvents.push(ev(base, 'stepCompleted', id))
    for (const id of ['ppe', 'tire', 'equip', 'enter', 'axle', 'mode', 'lower', 'motor', 'press', 'read', 'off']) base.stepEvents.push(ev(base, 'stepCompleted', id))
    expect(post(reqOf(base))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
})

describe('C-P2-3 윤초는 공식 계약(ajv-formats)과 같은 범위로 다룬다', () => {
  test('23:59:60Z·offset 윤초는 수락, 12:34:60Z는 거절, 시각 순서 비교도 동작', () => {
    const { post } = server()
    const mk = (started: string, completed: string, id: string) => { const p: any = JSON.parse(JSON.stringify(P)); p.startedAt = started; p.completedAt = completed; p.durationSeconds = 0; p.recordId = id; return p }
    expect(post(reqOf(mk('2016-12-31T23:59:59Z', '2016-12-31T23:59:60Z', '00000000-0000-4000-8000-000000000051'))).ok).toBe(true)
    expect(post(reqOf(mk('2017-01-01T08:59:59+09:00', '2017-01-01T08:59:60+09:00', '00000000-0000-4000-8000-000000000052'))).ok).toBe(true)
    expect(post(reqOf(mk('2016-12-31T12:34:59Z', '2016-12-31T12:34:60Z', '00000000-0000-4000-8000-000000000053')))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(post(reqOf(mk('2016-12-31T23:59:60Z', '2016-12-31T23:59:59Z', '00000000-0000-4000-8000-000000000054')))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' }) // 완료가 시작보다 이전(continuous)
  })
})

describe('C-P2-4·5 원장 병합: 예약 ID는 원장 전체에, 검증 범위는 필드별 독립 비교, 누락 필드 보강은 명시 이관만', () => {
  const body = (over: Record<string, unknown> = {}) => ({ schemaVersion: '1.0.0', sessionCode: 'DEMO-ONLY', classConditionCode: 'DEMO', taskId: 'braking-force', runPurpose: 'demo', displayMode: 'threeD', difficultyMode: 'guided', usagePhase: 'preview', configurationApproval: { taskApproved: false, rulesetApproved: true, layoutConfirmed: false, researchUseApproved: false }, versions: { taskDefinitionVersion: 'T', rulesetVersion: 'R', measurementSetVersion: 'M', layoutVersion: 'L', judgeEngineVersion: 'J', sessionConfigVersion: 'S', researchProtocolVersion: 'unapproved', feedbackPolicyVersion: 'F' }, sessionConfiguration: { vehicleEntryDirection: null }, ...over })
  const snap = (over: Record<string, unknown> = {}) => { const b = body(over); const { schemaVersion, ...rest } = b; return { schemaVersion, sessionSnapshotId: idOf(b), ...rest } }
  const scope = { allowedStepIds: ['ppe', 'off'], stepPrerequisites: { ppe: [], off: ['ppe'] } }
  test('원장에만 있는 예약 ID(fixture)도 병합 전에 실패한다', () => {
    const a = snap()
    const l = { ruleVersion: SNAPSHOT_RULE_VERSION, entries: [{ snapshot: a, ...scope, status: 'retired' as const, firstGeneratedOn: 'x', retiredOn: 'y' }] }
    expect(() => mergeLedger(l, [], '2026-10-27', [a.sessionSnapshotId])).toThrow(/RESERVED_ID/)
  })
  test('stepPrerequisites가 없던 과거 항목이라도 allowedStepIds 변경은 실패하고, 누락 필드 보강은 migration 기록 없이는 실패한다', () => {
    const a = snap()
    const old = { ruleVersion: SNAPSHOT_RULE_VERSION, entries: [{ snapshot: a, allowedStepIds: ['ppe', 'off'], status: 'active' as const, firstGeneratedOn: 'x', retiredOn: null } as any] }
    expect(() => mergeLedger(old, [{ snapshot: a, allowedStepIds: ['different'], stepPrerequisites: scope.stepPrerequisites }], '2026-10-27')).toThrow(/LEDGER_SCOPE_MISMATCH/)
    expect(() => mergeLedger(old, [{ snapshot: a, ...scope }], '2026-10-27')).toThrow(/LEDGER_SCOPE_UPGRADE_REQUIRED/)
    const migrated = mergeLedger(old, [{ snapshot: a, ...scope }], '2026-10-27', [], { scopeUpgrade: { reason: 'dev set, no deployment/receipts', fields: ['stepPrerequisites'] } })
    expect(migrated.entries[0]!.stepPrerequisites).toEqual(scope.stepPrerequisites)
    expect(migrated.migrations?.[0]).toMatchObject({ date: '2026-10-27', fields: ['stepPrerequisites'], ids: [a.sessionSnapshotId] })
  })
})
