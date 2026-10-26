import { describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import lv2 from '../src/data/tasks/task.braking-force.case-lv2.json'
import { createTaskRun, attempt, submitResponse } from '../src/domain/taskEngine'
import { inspectPerformance } from '../src/domain/npcInspection'
import type { ApprovedTask } from '../src/domain/types'

const task1 = lv1 as ApprovedTask
const task2 = lv2 as ApprovedTask
let n = 0
const aid = () => `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}` // actionId는 계약상 UUID
const deps = { now: () => Date.now(), newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }

function completeProcedure(task: ApprovedTask) {
  let s = createTaskRun(task, { difficultyMode: 'unguided' }, deps)
  s = attempt(s, { type: 'step', stepId: 'ppe' }, aid()).run
  s = attempt(s, { type: 'confirmSafety', conditionId: 's-engine' }, aid()).run
  for (const id of ['tire', 'equip', 'enter']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = submitResponse(s, 'axleWeight', String(task.measurement.axleWeight), aid()).run
  for (const id of ['axle', 'mode']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = attempt(s, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run
  for (const id of ['lower', 'motor', 'press']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = submitResponse(s, 'left', String(task.measurement.left), aid()).run
  s = submitResponse(s, 'right', String(task.measurement.right), aid()).run
  s = attempt(s, { type: 'step', stepId: 'read' }, aid()).run
  s = attempt(s, { type: 'subStep', stepId: 'off', action: 'motorOff' }, aid()).run
  s = attempt(s, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run
  s = attempt(s, { type: 'subStep', stepId: 'off', action: 'liftUp' }, aid()).run
  s = attempt(s, { type: 'subStep', stepId: 'off', action: 'exitVehicle' }, aid()).run
  return s
}

describe('NPC 검사 — 최종 수행 검사(차량 판정·학생 정오와 별개)', () => {
  test('절차·판독·계산·판정이 모두 끝나고 최종 답이 맞으면 통과', () => {
    let s = completeProcedure(task1)
    s = submitResponse(s, 'deviation', '6.6', aid()).run
    s = submitResponse(s, 'sum', '73.3', aid()).run
    s = submitResponse(s, 'vehicleCondition', 'pass', aid()).run
    s = attempt(s, { type: 'step', stepId: 'calc' }, aid()).run
    const r = inspectPerformance(s)
    expect(r.result).toBe('passed')
    expect(r.issues).toEqual([])
    expect(r.run.npcInspectionCount).toBe(1)
    expect(r.run.events.at(-1)?.type).toBe('npcInspected')
  })

  test('불량 차량을 정확히 불량으로 판정한 학생은 통과한다', () => {
    let s = completeProcedure(task2)
    s = submitResponse(s, 'deviation', '10.0', aid()).run
    s = submitResponse(s, 'sum', '73.3', aid()).run
    s = submitResponse(s, 'vehicleCondition', 'fail', aid()).run
    s = attempt(s, { type: 'step', stepId: 'calc' }, aid()).run
    expect(inspectPerformance(s).result).toBe('passed')
    expect(s.responses.vehicleVerdict).toBe('fail')
  })

  test('최초 오답 뒤 보완 정답이면 통과하되 최초 정오는 그대로 남는다', () => {
    let s = completeProcedure(task2)
    s = submitResponse(s, 'deviation', '10.0', aid()).run
    s = submitResponse(s, 'sum', '73.3', aid()).run
    s = submitResponse(s, 'vehicleCondition', 'pass', aid()).run
    s = attempt(s, { type: 'step', stepId: 'calc' }, aid()).run
    const first = inspectPerformance(s)
    expect(first.result).toBe('needsCorrection')
    expect(first.issues).toEqual([{ kind: 'response', itemId: 'vehicleCondition', reasonCode: 'FINAL_INCORRECT' }])
    let s2 = submitResponse(first.run, 'vehicleCondition', 'fail', aid()).run
    const second = inspectPerformance(s2)
    expect(second.result).toBe('passed')
    expect(second.run.npcInspectionCount).toBe(2)
    const j = second.run.responses.items.find((i) => i.itemId === 'vehicleCondition')!
    expect(j.firstCorrect).toBe(false)
    expect(j.finalCorrect).toBe(true)
  })

  test('단계가 남아 있으면 보완 필요이고 남은 단계를 알려 준다', () => {
    const s = completeProcedure(task1)
    const r = inspectPerformance(s)
    expect(r.result).toBe('needsCorrection')
    expect(r.issues).toContainEqual({ kind: 'step', stepId: 'calc', reasonCode: 'STEP_NOT_COMPLETED' })
  })

  test('미응답 항목은 오답과 구분해 보고한다', () => {
    let s = completeProcedure(task1)
    s = submitResponse(s, 'deviation', '6.6', aid()).run
    const r = inspectPerformance(s)
    expect(r.issues).toContainEqual({ kind: 'response', itemId: 'sum', reasonCode: 'UNANSWERED' })
    expect(r.issues).toContainEqual({ kind: 'response', itemId: 'vehicleCondition', reasonCode: 'UNANSWERED' })
  })

  test('검사는 이전 오류·안전 위반 횟수를 지우지 않는다', () => {
    let s = createTaskRun(task1, { difficultyMode: 'guided' }, deps)
    s = attempt(s, { type: 'step', stepId: 'tire' }, aid()).run // 안전 위반 1
    const r = inspectPerformance(s)
    expect(r.run.safetyViolationCount).toBe(1)
  })
})
