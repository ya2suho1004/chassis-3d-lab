import { describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import lv2 from '../src/data/tasks/task.braking-force.case-lv2.json'
import { createResponseSheet, submitAnswer, summarizeResponses } from '../src/domain/grading'
import type { ApprovedTask } from '../src/domain/types'

const task1 = lv1 as ApprovedTask
const task2 = lv2 as ApprovedTask

describe('응답 채점 — 기본', () => {
  test('필수 응답 6항목(판독 3·계산 2·판정 1)이 시트에 만들어지고 모두 미응답(null)이다', () => {
    const s = createResponseSheet(task1)
    expect(s.items.map((i) => i.itemId)).toEqual(['left', 'right', 'axleWeight', 'deviation', 'sum', 'vehicleCondition'])
    expect(s.items.every((i) => i.firstInput === null && i.firstCorrect === null)).toBe(true)
    expect(s.vehicleVerdict).toBe('pass')
  })

  test('판독값을 제시값과 같게 입력하면 정답', () => {
    const { sheet, result } = submitAnswer(createResponseSheet(task1), 'left', '240')
    expect(result.correct).toBe(true)
    expect(sheet.items.find((i) => i.itemId === 'left')?.firstInput).toBe('240')
  })

  test('판독값은 정수만 허용(교사 확정) — 240.0은 오답이 아니라 형식 오류', () => {
    const { result } = submitAnswer(createResponseSheet(task1), 'left', '240.0')
    expect(result.correct).toBeNull()
    expect(result.reasonCode).toBe('FORMAT_INTEGER_REQUIRED')
  })

  test('계산값은 절사 기재값과 비교한다: 편차 6.6 정답, 6.7 오답', () => {
    const a = submitAnswer(createResponseSheet(task1), 'deviation', '6.6')
    expect(a.result.correct).toBe(true)
    const b = submitAnswer(createResponseSheet(task1), 'deviation', '6.7')
    expect(b.result.correct).toBe(false)
  })

  test('빈 입력은 오답이 아니라 미응답', () => {
    const { sheet, result } = submitAnswer(createResponseSheet(task1), 'sum', '   ')
    expect(result.correct).toBeNull()
    expect(sheet.items.find((i) => i.itemId === 'sum')?.firstInput).toBeNull()
  })
})

describe('응답 채점 — 최초/최종 답 분리', () => {
  test('최초 오답 뒤 정답으로 고쳐도 최초 답은 유지되고 최종 답만 바뀐다', () => {
    let s = createResponseSheet(task2) // 불량 사례
    s = submitAnswer(s, 'vehicleCondition', 'pass').sheet
    s = submitAnswer(s, 'vehicleCondition', 'fail').sheet
    const j = s.items.find((i) => i.itemId === 'vehicleCondition')!
    expect(j.firstAnswer).toBe('pass')
    expect(j.firstCorrect).toBe(false)
    expect(j.finalAnswer).toBe('fail')
    expect(j.finalCorrect).toBe(true)
  })

  test('judgmentCorrect: 판정 항목 미응답이면 null, 최초 오답이면 false, 최초 정답이면 true', () => {
    const empty = summarizeResponses(createResponseSheet(task2))
    expect(empty.judgmentCorrect).toBeNull()
    const wrong = summarizeResponses(submitAnswer(createResponseSheet(task2), 'vehicleCondition', 'pass').sheet)
    expect(wrong.judgmentCorrect).toBe(false)
    const right = summarizeResponses(submitAnswer(createResponseSheet(task2), 'vehicleCondition', 'fail').sheet)
    expect(right.judgmentCorrect).toBe(true)
  })

  test('보완 정답은 judgmentCorrect를 true로 덮어쓰지 않는다', () => {
    let s = createResponseSheet(task2)
    s = submitAnswer(s, 'vehicleCondition', 'pass').sheet
    s = submitAnswer(s, 'vehicleCondition', 'fail').sheet
    const sum = summarizeResponses(s)
    expect(sum.judgmentCorrect).toBe(false)
    expect(sum.finalJudgmentCorrect).toBe(true)
  })

  test('정답률 분모는 필수 항목 6개로 고정되고 미응답 수를 함께 센다', () => {
    let s = createResponseSheet(task1)
    for (const [id, v] of [['left', '240'], ['right', '200'], ['axleWeight', '600'], ['deviation', '6.6']] as const) s = submitAnswer(s, id, v).sheet
    const sum = summarizeResponses(s)
    expect(sum.requiredCount).toBe(6)
    expect(sum.firstCorrectCount).toBe(4)
    expect(sum.unansweredFirstCount).toBe(2)
  })

  test('기록 형식으로 내보내면 판독·계산·판정이 분리되고 제시값·기준값이 포함된다', () => {
    const s = submitAnswer(createResponseSheet(task1), 'sum', '73.3').sheet
    const out = summarizeResponses(s)
    expect(out.measurementInputs).toHaveLength(3)
    expect(out.measurementInputs[0]).toMatchObject({ itemId: 'left', unit: 'kg', presentedValue: 240, firstInput: null })
    expect(out.calculationAnswers.find((c) => c.itemId === 'sum')).toMatchObject({ unit: '%', computedReferenceValue: 73.3, firstInput: '73.3', firstCorrect: true, finalInput: '73.3', finalCorrect: true })
    expect(out.judgmentAnswers[0]).toMatchObject({ itemId: 'vehicleCondition', firstAnswer: null })
  })
})
