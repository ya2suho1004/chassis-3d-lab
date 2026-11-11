// 최소회전반경 과제: 채점 기준값, 엔진 단계·안전 차단, 기록 1.3.0
import { describe, expect, it } from 'vitest'
import Ajv from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import schema130 from '../docs/design/contracts/record.schema.v1.3.0.json'
import { buildRecordPayload } from '../src/domain/record'
import { inspectPerformance } from '../src/domain/npcInspection'
import { createDemoSession } from '../src/app/session'
import lv1Raw from '../src/data/tasks/task.min-turning-radius.case-lv1.json'
import lv2Raw from '../src/data/tasks/task.min-turning-radius.case-lv2.json'
import { createResponseSheet, submitAnswer } from '../src/domain/grading'
import { attempt, createTaskRun, submitResponse, type TaskRun } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'

const lv1 = lv1Raw as unknown as ApprovedTask
const lv2 = lv2Raw as unknown as ApprovedTask
const ref = (t: ApprovedTask, id: string) => createResponseSheet(t).items.find((i) => i.itemId === id)!.referenceValue

describe('최소회전반경 채점', () => {
  it('사례 1: 제시 각 35·30, R 5.5, 양호', () => {
    expect(ref(lv1, 'leftAngle')).toBe(35)
    expect(ref(lv1, 'rightAngle')).toBe(30)
    expect(ref(lv1, 'radius')).toBe(5.5)
    expect(createResponseSheet(lv1).vehicleVerdict).toBe('pass')
  })
  it('사례 2: R 5.1(절사), 양호', () => {
    expect(ref(lv2, 'radius')).toBe(5.1)
    expect(createResponseSheet(lv2).vehicleVerdict).toBe('pass')
  })
  it('R은 학생 값을 다시 절사하지 않는다(5.19는 오답, 5.1·5.10은 정답), 안쪽 바퀴로 계산한 값은 오답', () => {
    const s = createResponseSheet(lv2)
    expect(submitAnswer(s, 'radius', '5.19').result.correct).toBe(false)
    expect(submitAnswer(s, 'radius', '5.1').result.correct).toBe(true)
    expect(submitAnswer(s, 'radius', '5.10').result.correct).toBe(true)
    expect(submitAnswer(s, 'radius', '5.2').result.correct).toBe(false)
    // 안쪽(우측 36°)은 표에 없지만, 좌회전 사례 1에서 안쪽 35°로 계산하면 2.7 ÷ 0.5736 + 0.1 = 4.8
    expect(submitAnswer(createResponseSheet(lv1), 'radius', '4.8').result.correct).toBe(false)
  })
  it('각도는 정수만, 판정은 pass/fail', () => {
    const s = createResponseSheet(lv1)
    expect(submitAnswer(s, 'leftAngle', '35.5').result.reasonCode).toBe('FORMAT_INTEGER_REQUIRED')
    expect(submitAnswer(s, 'rightAngle', '30').result.correct).toBe(true)
    expect(submitAnswer(s, 'vehicleCondition', 'pass').result.correct).toBe(true)
    expect(submitAnswer(s, 'vehicleCondition', 'fail').result.correct).toBe(false)
  })
})

let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const deps = { now: () => 1000, newId: id }
const step = (r: TaskRun, stepId: string) => attempt(r, { type: 'step', stepId }, id())
const answer = (r: TaskRun, itemId: string, v: string) => submitResponse(r, itemId, v, id()).run

describe('최소회전반경 엔진', () => {
  it('보호구·시동 OFF 없이 조향하면 안전 차단으로 센다', () => {
    let r = createTaskRun(lv1, { difficultyMode: 'guided' }, deps)
    let a = step(r, 'steer')
    expect(a.outcome).toBe('blocked')
    expect(a.reasonCode).toBe('SAFETY_s-ppe')
    r = step(a.run, 'ppe').run
    a = step(r, 'steer')
    expect(a.reasonCode).toBe('SAFETY_s-engine')
    expect(a.feedbackKey).toBe('blocked_safety_engine')
    expect(a.run.safetyViolationCount).toBe(2)
  })
  it('순서대로 하면 끝까지, 응답 없으면 판독·기록 단계는 미완료', () => {
    let r = createTaskRun(lv1, { difficultyMode: 'guided' }, deps)
    for (const s of ['ppe', 'engineOff', 'turntable', 'direction', 'steer']) { const a = step(r, s); expect(a.outcome).toBe('completed'); r = a.run }
    expect(step(r, 'read').reasonCode).toBe('NEEDS_RESPONSE_leftAngle')
    r = answer(answer(r, 'leftAngle', '35'), 'rightAngle', '30')
    r = step(r, 'read').run
    r = step(r, 'return').run
    expect(step(r, 'record').reasonCode).toBe('NEEDS_RESPONSE_radius')
    r = answer(answer(r, 'radius', '5.5'), 'vehicleCondition', 'pass')
    const done = step(r, 'record')
    expect(done.outcome).toBe('completed')
    expect(done.run.allStepsCompleted).toBe(true)
    expect(done.run.errorCount).toBe(0)
  })
  it('시동 OFF 전에 측정판 점검을 하면 순서 오류', () => {
    let r = createTaskRun(lv2, { difficultyMode: 'unguided' }, deps)
    r = step(r, 'ppe').run
    const a = step(r, 'turntable')
    expect(a.reasonCode).toBe('ORDER_engineOff')
    expect(a.run.errorCount).toBe(1)
  })
})

describe('최소회전반경 기록 1.3.0', () => {
  it('완료 기록은 1.3.0 계약을 통과하고 계산 단위는 m', () => {
    let r = createTaskRun(lv2, { difficultyMode: 'guided' }, { now: () => Date.now(), newId: id })
    for (const s of ['ppe', 'engineOff', 'turntable', 'direction', 'steer']) r = step(r, s).run
    r = answer(answer(r, 'leftAngle', '32'), 'rightAngle', '36'); r = step(r, 'read').run; r = step(r, 'return').run
    r = answer(answer(r, 'radius', '5.1'), 'vehicleCondition', 'pass'); r = step(r, 'record').run
    r = inspectPerformance(r).run
    const session = createDemoSession({ studentCode: 'D-03', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'review', vehicleEntryDirection: null, task: lv2, difficultyMode: 'guided' })
    const p = buildRecordPayload(r, session, { completedAtIso: new Date(Date.now() + 1000).toISOString(), completionStatus: 'completed' })
    const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv)
    const v = ajv.compile(schema130 as object)
    expect(v(p), JSON.stringify(v.errors?.slice(0, 3))).toBe(true)
    expect(p.calculationAnswers.map((c) => c.unit)).toEqual(['m'])
    expect(p.measurementInputs.map((m) => [m.itemId, m.unit, m.presentedValue])).toEqual([['leftAngle', '°', 32], ['rightAngle', '°', 36]])
    expect(p.vehicleVerdict).toBe('pass')
    expect(p.judgmentCorrect).toBe(true)
  })
})
