// U2·U3·U6 동작 매핑 — docs/design/docs/12 §2-2, 13 §3·§4·§9
import { describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createTaskRun, attempt, submitResponse, serializeRun, rehydrateRun } from '../src/domain/taskEngine'
import { createDemoSession } from '../src/app/session'
import { buildRecordPayload } from '../src/domain/record'
import type { ApprovedTask } from '../src/domain/types'
import rawLayout from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout, vehiclePlacement } from '../src/scene/layoutModel'

const task = lv1 as ApprovedTask
let n = 0
const aid = () => `20000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

function upToRead() {
  let s = createTaskRun(task, { difficultyMode: 'guided' })
  s = attempt(s, { type: 'step', stepId: 'ppe' }, aid()).run
  s = attempt(s, { type: 'confirmSafety', conditionId: 's-engine' }, aid()).run
  for (const id of ['tire', 'equip', 'enter']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = submitResponse(s, 'axleWeight', '600', aid()).run
  s = attempt(s, { type: 'step', stepId: 'axle' }, aid()).run
  s = attempt(s, { type: 'step', stepId: 'mode' }, aid()).run
  s = attempt(s, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run
  for (const id of ['lower', 'motor', 'press']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = submitResponse(s, 'left', '240', aid()).run
  s = submitResponse(s, 'right', '200', aid()).run
  s = attempt(s, { type: 'step', stepId: 'read' }, aid()).run
  expect(s.completedSteps).toContain('read'); expect(s.motorOn).toBe(true)
  return s
}

describe('U3 점검 단계의 시동 OFF 확인(s-engine)', () => {
  test('tire는 s-engine 확인 전에는 SAFETY_s-engine으로 막히고 전용 키 blocked_safety_engine을 돌려준다', () => {
    let s = createTaskRun(task, { difficultyMode: 'guided' })
    s = attempt(s, { type: 'step', stepId: 'ppe' }, aid()).run
    const r = attempt(s, { type: 'step', stepId: 'tire' }, aid())
    expect(r.outcome).toBe('blocked'); expect(r.reasonCode).toBe('SAFETY_s-engine'); expect(r.feedbackKey).toBe('blocked_safety_engine')
    expect(task.feedback['blocked_safety_engine']?.what).toBeTruthy()
    expect(r.run.safetyViolationCount).toBe(1); expect(r.run.errorCount).toBe(0)
  })
  test('s-engine을 확인하면 tire·equip이 진행된다', () => {
    let s = createTaskRun(task, { difficultyMode: 'guided' })
    s = attempt(s, { type: 'step', stepId: 'ppe' }, aid()).run
    s = attempt(s, { type: 'confirmSafety', conditionId: 's-engine' }, aid()).run
    expect(attempt(s, { type: 'step', stepId: 'tire' }, aid()).outcome).toBe('completed')
  })
})

describe('U2 off 단계의 하위 행동: MOTOR OFF → 주변 확인 → 리프트 상승 → 차량 이탈', () => {
  test('off는 한 번의 수행으로 완료되지 않고 첫 하위 행동을 요구한다', () => {
    const s = upToRead()
    const r = attempt(s, { type: 'step', stepId: 'off' }, aid())
    expect(r.outcome).toBe('incomplete'); expect(r.reasonCode).toBe('NEEDS_SUBSTEP_motorOff')
  })
  test('모터가 켜진 채 리프트 상승·차량 이탈은 s-exit(정지 확인 부족)로 막히고, MOTOR OFF 자체는 막지 않는다', () => {
    const s = upToRead()
    const up = attempt(s, { type: 'subStep', stepId: 'off', action: 'liftUp' }, aid())
    expect(up.outcome).toBe('blocked'); expect(up.reasonCode).toBe('SAFETY_s-exit'); expect(up.feedbackKey).toBe('blocked_safety_exit')
    const ex = attempt(s, { type: 'subStep', stepId: 'off', action: 'exitVehicle' }, aid())
    expect(ex.outcome).toBe('blocked'); expect(ex.reasonCode).toBe('SAFETY_s-exit')
    const off = attempt(s, { type: 'subStep', stepId: 'off', action: 'motorOff' }, aid())
    expect(off.outcome).toBe('completed'); expect(off.run.motorOn).toBe(false); expect(off.run.completedSteps).not.toContain('off')
  })
  test('MOTOR OFF 뒤에는 하강 때의 주변 확인을 재사용하지 않는다: s-lift 재확인 전 상승은 SAFETY_s-lift', () => {
    let s = upToRead()
    s = attempt(s, { type: 'subStep', stepId: 'off', action: 'motorOff' }, aid()).run
    expect(s.satisfiedSafety).not.toContain('s-lift')
    const up = attempt(s, { type: 'subStep', stepId: 'off', action: 'liftUp' }, aid())
    expect(up.outcome).toBe('blocked'); expect(up.reasonCode).toBe('SAFETY_s-lift'); expect(up.feedbackKey).toBe('blocked_safety_lift')
    s = attempt(s, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run
    expect(attempt(s, { type: 'subStep', stepId: 'off', action: 'liftUp' }, aid()).outcome).toBe('completed')
  })
  test('상승 전 이탈은 막히고, 상승 뒤 이탈하면 off가 완료되어 다음 단계가 calc가 된다', () => {
    let s = upToRead()
    s = attempt(s, { type: 'subStep', stepId: 'off', action: 'motorOff' }, aid()).run
    s = attempt(s, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run
    const early = attempt(s, { type: 'subStep', stepId: 'off', action: 'exitVehicle' }, aid())
    expect(early.outcome).toBe('blocked'); expect(early.reasonCode).toBe('SAFETY_s-exit')
    s = attempt(s, { type: 'subStep', stepId: 'off', action: 'liftUp' }, aid()).run
    const done = attempt(s, { type: 'subStep', stepId: 'off', action: 'exitVehicle' }, aid())
    expect(done.outcome).toBe('completed')
    expect(done.run.completedSteps).toContain('off'); expect(done.run.nextStepId).toBe('calc')
    expect(done.run.offProgress).toEqual(['motorOff', 'liftUp', 'exitVehicle'])
    const ids = done.run.events.filter((e) => e.type === 'stepCompleted').map((e) => e.stepId)
    expect(ids.slice(-4)).toEqual(['off:motorOff', 'off:liftUp', 'off:exitVehicle', 'off'])
    expect(attempt(done.run, { type: 'subStep', stepId: 'off', action: 'motorOff' }, aid()).outcome).toBe('alreadyCompleted')
  })
  test('하위 행동 진행 상태는 저장·복원 뒤에도 유지된다(모터는 복원 시 정지)', () => {
    let s = upToRead()
    s = attempt(s, { type: 'subStep', stepId: 'off', action: 'motorOff' }, aid()).run
    const back = rehydrateRun(serializeRun(s))
    expect(back.offProgress).toEqual(['motorOff']); expect(back.motorOn).toBe(false)
  })
})

describe('U6 차량 진입 방향은 세션 설정(교사 선택), 기본 null', () => {
  test('createDemoSession은 vehicleEntryDirection을 기본 null로 두고 지정값을 보존하며 record payload(1.1.0)에는 넣지 않는다', () => {
    const a = createDemoSession({ studentCode: 'A-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview' })
    expect(a.vehicleEntryDirection).toBeNull()
    const b = createDemoSession({ studentCode: 'A-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', vehicleEntryDirection: 'south' })
    expect(b.vehicleEntryDirection).toBe('south')
    const run = createTaskRun(task, { difficultyMode: 'guided' })
    const p = buildRecordPayload(run, b, { completedAtIso: '2026-10-26T10:00:00Z', completionStatus: 'aborted' }) as unknown as Record<string, unknown>
    expect('vehicleEntryDirection' in p).toBe(false)
  })
  test('3D 차량 자리는 방향에 따라 롤러 북쪽/남쪽에 놓이고, 미설정이면 북쪽을 가정으로 표시한다', () => {
    const layout = loadSceneLayout(rawLayout)
    const tester = layout.equipment.find((e) => e.id === 'brake-tester-01')!
    const north = vehiclePlacement(layout, 'north'); const south = vehiclePlacement(layout, 'south'); const none = vehiclePlacement(layout, null)
    expect(north.z).toBeLessThan(tester.z); expect(south.z).toBeGreaterThan(tester.z)
    expect(north.assumed).toBe(false); expect(south.assumed).toBe(false); expect(none.assumed).toBe(true); expect(none.z).toBe(north.z)
    expect(Math.abs(north.z - tester.z)).toBeCloseTo(Math.abs(south.z - tester.z), 5)
  })
})
