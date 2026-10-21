import { describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import lv2 from '../src/data/tasks/task.braking-force.case-lv2.json'
import { createTaskRun, attempt, submitResponse, requestHint, type TaskRun } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'

const task1 = lv1 as ApprovedTask
const task2 = lv2 as ApprovedTask

// 시계·ID를 주입해 테스트를 결정적으로 만든다
let tick = 0
let n = 0
const deps = () => ({ now: () => (tick += 1000), newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` })
const aid = () => `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}` // actionId는 계약상 UUID

function start(task = task1, mode: 'guided' | 'unguided' = 'guided') {
  tick = 0
  return createTaskRun(task, { difficultyMode: mode }, deps())
}

/** 정상 절차를 끝까지 수행하는 도우미 */
function runHappyPath(task = task1) {
  let s = start(task)
  s = attempt(s, { type: 'step', stepId: 'ppe' }, aid()).run
  s = attempt(s, { type: 'step', stepId: 'tire' }, aid()).run
  s = attempt(s, { type: 'step', stepId: 'equip' }, aid()).run
  s = attempt(s, { type: 'step', stepId: 'enter' }, aid()).run
  s = submitResponse(s, 'axleWeight', String(task.measurement.axleWeight), aid()).run
  s = attempt(s, { type: 'step', stepId: 'axle' }, aid()).run
  s = attempt(s, { type: 'step', stepId: 'mode' }, aid()).run
  s = attempt(s, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run
  s = attempt(s, { type: 'step', stepId: 'lower' }, aid()).run
  s = attempt(s, { type: 'step', stepId: 'motor' }, aid()).run
  s = attempt(s, { type: 'step', stepId: 'press' }, aid()).run
  s = submitResponse(s, 'left', String(task.measurement.left), aid()).run
  s = submitResponse(s, 'right', String(task.measurement.right), aid()).run
  s = attempt(s, { type: 'step', stepId: 'read' }, aid()).run
  s = attempt(s, { type: 'step', stepId: 'off' }, aid()).run
  return s
}

describe('과제 엔진 — 순서와 안전 인터록', () => {
  test('시작 직후 첫 단계는 보호구 착용이고 아직 완료된 단계가 없다', () => {
    const s = start()
    expect(s.nextStepId).toBe('ppe')
    expect(s.completedSteps).toEqual([])
    expect(s.events.map((e) => e.type)).toEqual(['taskStarted'])
  })

  test('보호구 없이 타이어 점검을 하면 안전 차단이고 학습오류로 세지 않는다', () => {
    const r = attempt(start(), { type: 'step', stepId: 'tire' }, aid())
    expect(r.outcome).toBe('blocked')
    expect(r.reasonCode).toBe('SAFETY_s-ppe')
    expect(r.feedbackKey).toBe('blocked_ppe')
    expect(r.run.safetyViolationCount).toBe(1)
    expect(r.run.safetyViolationTypes).toEqual({ 's-ppe': 1 })
    expect(r.run.errorCount).toBe(0)
  })

  test('보호구를 착용한 뒤 선행 단계를 건너뛰면 순서 오류로 센다', () => {
    let s = attempt(start(), { type: 'step', stepId: 'ppe' }, aid()).run
    const r = attempt(s, { type: 'step', stepId: 'enter' }, aid())
    expect(r.outcome).toBe('blocked')
    expect(r.reasonCode).toBe('ORDER_equip') // enter의 직접 선행 단계는 equip
    expect(r.feedbackKey).toBe('blocked_order')
    expect(r.run.errorCount).toBe(1)
    expect(r.run.errorTypes).toEqual({ order: 1 })
    expect(r.run.safetyViolationCount).toBe(0)
  })

  test('같은 actionId로 반복된 차단은 한 번만 센다', () => {
    let s = attempt(start(), { type: 'step', stepId: 'ppe' }, aid()).run
    const id = aid()
    s = attempt(s, { type: 'step', stepId: 'enter' }, id).run
    s = attempt(s, { type: 'step', stepId: 'enter' }, id).run
    expect(s.errorCount).toBe(1)
    s = attempt(s, { type: 'step', stepId: 'enter' }, aid()).run
    expect(s.errorCount).toBe(2)
  })

  test('리프트 하강은 주변 확인(s-lift) 없이는 차단된다', () => {
    let s = start()
    for (const id of ['ppe', 'tire', 'equip', 'enter']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
    s = submitResponse(s, 'axleWeight', '600', aid()).run
    s = attempt(s, { type: 'step', stepId: 'axle' }, aid()).run
    s = attempt(s, { type: 'step', stepId: 'mode' }, aid()).run
    const blocked = attempt(s, { type: 'step', stepId: 'lower' }, aid())
    expect(blocked.outcome).toBe('blocked')
    expect(blocked.reasonCode).toBe('SAFETY_s-lift')
    expect(blocked.feedbackKey).toBe('blocked_safety_lift')
    s = attempt(blocked.run, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run
    expect(attempt(s, { type: 'step', stepId: 'lower' }, aid()).outcome).toBe('completed')
  })

  test('축중을 입력하기 전에는 축중 확인 단계가 끝나지 않는다', () => {
    let s = start()
    for (const id of ['ppe', 'tire', 'equip', 'enter']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
    const r = attempt(s, { type: 'step', stepId: 'axle' }, aid())
    expect(r.outcome).toBe('incomplete')
    expect(r.reasonCode).toBe('NEEDS_RESPONSE_axleWeight')
    expect(r.run.errorCount).toBe(0)
  })

  test('측정 중 가속 페달 조작은 안전 위반으로 차단된다', () => {
    let s = start()
    for (const id of ['ppe', 'tire', 'equip', 'enter']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
    s = submitResponse(s, 'axleWeight', '600', aid()).run
    for (const id of ['axle', 'mode']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
    s = attempt(s, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run
    for (const id of ['lower', 'motor']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
    const r = attempt(s, { type: 'hazard', hazardId: 'accelerate' }, aid())
    expect(r.outcome).toBe('blocked')
    expect(r.reasonCode).toBe('SAFETY_s-accel')
    expect(r.run.safetyViolationTypes).toEqual({ 's-accel': 1 })
  })

  test('롤러 회전 중 차량 이탈 시도는 안전 위반이고, MOTOR OFF 단계 뒤에는 허용된다', () => {
    let s = start()
    for (const id of ['ppe', 'tire', 'equip', 'enter']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
    s = submitResponse(s, 'axleWeight', '600', aid()).run
    for (const id of ['axle', 'mode']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
    s = attempt(s, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run
    for (const id of ['lower', 'motor', 'press']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
    expect(attempt(s, { type: 'hazard', hazardId: 'exitVehicle' }, aid()).reasonCode).toBe('SAFETY_s-exit')
  })

  test('무안내 모드에서도 안전 차단은 그대로다', () => {
    const r = attempt(start(task1, 'unguided'), { type: 'step', stepId: 'tire' }, aid())
    expect(r.outcome).toBe('blocked')
    expect(r.reasonCode).toBe('SAFETY_s-ppe')
  })
})

describe('과제 엔진 — 정상 완료와 기록', () => {
  test('정상 절차를 끝까지 하면 12단계 중 11단계가 완료되고 마지막 계산 단계만 남는다', () => {
    const s = runHappyPath()
    expect(s.completedSteps).toHaveLength(11)
    expect(s.nextStepId).toBe('calc')
    expect(s.errorCount).toBe(0)
    expect(s.safetyViolationCount).toBe(0)
  })

  test('계산·판정 답을 모두 제출하면 마지막 단계가 끝나고 모든 단계 완료 상태가 된다', () => {
    let s = runHappyPath()
    s = submitResponse(s, 'deviation', '6.6', aid()).run
    s = submitResponse(s, 'sum', '73.3', aid()).run
    s = submitResponse(s, 'vehicleCondition', 'pass', aid()).run
    const r = attempt(s, { type: 'step', stepId: 'calc' }, aid())
    expect(r.outcome).toBe('completed')
    expect(r.run.allStepsCompleted).toBe(true)
    expect(r.run.nextStepId).toBeNull()
  })

  test('힌트 요청만 hintCount에 더해진다', () => {
    let s = start()
    s = requestHint(s, aid()).run
    s = requestHint(s, aid()).run
    expect(s.hintCount).toBe(2)
    expect(s.events.filter((e) => e.type === 'hintRequested')).toHaveLength(2)
  })

  test('이벤트는 1부터 순서가 증가하고 경과시간은 주입한 시계를 따른다', () => {
    const s = runHappyPath()
    const seq = s.events.map((e) => e.sequence)
    expect(seq).toEqual(seq.map((_, i) => i + 1))
    expect(s.events[1]!.elapsedMs).toBeGreaterThan(0)
    expect(s.events.every((e) => /^[0-9a-f-]{36}$/.test(e.eventId))).toBe(true)
  })

  test('응답 제출은 answerSubmitted 이벤트와 채점 결과를 남기고, 최초 오답 뒤 보완은 최초 답을 지키지 않는다는 일이 없다', () => {
    let s = runHappyPath(task2)
    s = submitResponse(s, 'vehicleCondition', 'pass', aid()).run
    s = submitResponse(s, 'vehicleCondition', 'fail', aid()).run
    const j = s.responses.items.find((i) => i.itemId === 'vehicleCondition')!
    expect(j.firstAnswer).toBe('pass')
    expect(j.finalAnswer).toBe('fail')
    expect(s.events.filter((e) => e.type === 'answerSubmitted' && e.itemId === 'vehicleCondition')).toHaveLength(2)
  })

  test('의미 이벤트가 200개를 넘으면 조용히 버리지 않고 한도 도달 상태가 된다', () => {
    let s: TaskRun = start()
    let last
    for (let i = 0; i < 210; i++) last = requestHint(s, aid()), (s = last.run)
    expect(s.events.length).toBeLessThanOrEqual(200)
    expect(s.eventLimitReached).toBe(true)
    expect(last!.outcome).toBe('eventLimit')
  })
})
