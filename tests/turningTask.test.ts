// 최소회전반경 과제: 채점 기준값, 엔진 단계·안전 차단, 기록 1.2.0
import { describe, expect, it } from 'vitest'
import lv1Raw from '../src/data/tasks/task.min-turning-radius.case-lv1.json'
import lv2Raw from '../src/data/tasks/task.min-turning-radius.case-lv2.json'
import { createResponseSheet, submitAnswer } from '../src/domain/grading'
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
  it('R은 학생 값도 소수 첫째 자리 절사 뒤 비교, 안쪽 바퀴로 계산한 값은 오답', () => {
    const s = createResponseSheet(lv2)
    expect(submitAnswer(s, 'radius', '5.19').result.correct).toBe(true)
    expect(submitAnswer(s, 'radius', '5.1').result.correct).toBe(true)
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
