// 기록 창(설계 2026-11-10 §2·§3.1): 창이 쓰는 단계별 칸은 엔진 완료 조건과 같아야 하고,
// 창을 여는 근거인 '칸이 비어 단계를 못 끝낸 시도'는 기록을 남기지 않아야 한다.
import { describe, expect, test } from 'vitest'
import brake1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import brake2 from '../src/data/tasks/task.braking-force.case-lv2.json'
import turn1 from '../src/data/tasks/task.min-turning-radius.case-lv1.json'
import turn2 from '../src/data/tasks/task.min-turning-radius.case-lv2.json'
import { attempt, createTaskRun, responseItemsOf, submitResponse, type TaskRun } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'

const tasks = [brake1, brake2, turn1, turn2] as unknown as ApprovedTask[]
let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const deps = { now: () => 1000, newId: id }
const step = (r: TaskRun, stepId: string) => attempt(r, { type: 'step', stepId }, id())

describe('단계의 응답 칸', () => {
  test('네 사례 모두 기록 단계와 칸이 설계 표와 같다', () => {
    for (const t of tasks) {
      const rec = t.steps.filter((s) => responseItemsOf(s).length > 0).map((s) => [s.stepId, responseItemsOf(s)])
      if (t.taskId === 'braking-force') expect(rec).toEqual([['axle', ['axleWeight']], ['read', ['left', 'right']], ['calc', ['deviation', 'sum', 'vehicleCondition']]])
      else expect(rec).toEqual([['read', ['leftAngle', 'rightAngle']], ['record', ['radius', 'vehicleCondition']]])
    }
  })
  test('기록 단계가 아니면 빈 목록', () => {
    expect(responseItemsOf({ completionCondition: 'ppeConfirmed' })).toEqual([])
  })
})

describe('창을 여는 근거', () => {
  test('칸이 비어 못 끝낸 시도는 사건을 남기지 않고, 칸을 채운 뒤 끝내면 제출·완료 순으로 남는다', () => {
    let r = createTaskRun(tasks[0]!, { difficultyMode: 'unguided' }, deps)
    r = step(r, 'ppe').run
    r = attempt(r, { type: 'confirmSafety', conditionId: 's-engine' }, id()).run
    for (const s of ['tire', 'equip', 'enter']) r = step(r, s).run
    const before = r.events.length
    const a = step(r, 'axle')
    expect(a.outcome).toBe('incomplete')
    expect(a.reasonCode).toBe('NEEDS_RESPONSE_axleWeight')
    expect(a.run.events.length).toBe(before)
    expect(a.run.errorCount).toBe(0)
    r = submitResponse(a.run, 'axleWeight', '600', id()).run
    r = step(r, 'axle').run
    expect(r.events.slice(before).map((e) => e.type)).toEqual(['answerSubmitted', 'stepCompleted'])
  })
})
