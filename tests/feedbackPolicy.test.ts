import { describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createTaskRun, submitResponse } from '../src/domain/taskEngine'
import { answerFeedbackAllowed, isSafetyFeedback } from '../src/domain/feedbackPolicy'
import type { ApprovedTask } from '../src/domain/types'

const task = lv1 as ApprovedTask
let n = 0
const aid = () => `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

describe('피드백 노출 정책 (task.feedbackPolicy, 제안 상태)', () => {
  test('안내 모드에서는 정답 관련 피드백을 바로 보여 준다', () => {
    const r = createTaskRun(task, { difficultyMode: 'guided' })
    expect(answerFeedbackAllowed(r)).toBe(true)
  })

  test('무안내 모드에서는 필수 응답 6개의 최초 답이 모두 저장되기 전에는 정답 관련 피드백을 막는다', () => {
    let r = createTaskRun(task, { difficultyMode: 'unguided' })
    expect(answerFeedbackAllowed(r)).toBe(false)
    for (const [id, v] of [['left', '240'], ['right', '200'], ['axleWeight', '600'], ['deviation', '6.6'], ['sum', '73.3']] as const) r = submitResponse(r, id, v, aid()).run
    expect(answerFeedbackAllowed(r)).toBe(false)
    r = submitResponse(r, 'vehicleCondition', 'pass', aid()).run
    expect(answerFeedbackAllowed(r)).toBe(true)
  })

  test('안전 피드백은 모드와 관계없이 즉시다', () => {
    expect(isSafetyFeedback('blocked_ppe')).toBe(true)
    expect(isSafetyFeedback('blocked_safety_accel')).toBe(true)
    expect(isSafetyFeedback('wrong_calc')).toBe(false)
    expect(isSafetyFeedback('blocked_order')).toBe(false)
  })
})
