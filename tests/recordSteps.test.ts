// 기록 창 규칙(설계 2026-11-10 §2·§3·§5·§7·§8): 칸·이름·열림·복원·표시·다시 보기·창 크기·스크롤
import { describe, expect, test } from 'vitest'
import { canReviewDial, itemOpen, markFor, missingText, recordItems, recordLabel, recordStepOf, recordWindowBox, restoreInputs, scrollDelta } from '../src/app/recordSteps'
import { createResponseSheet } from '../src/domain/grading'
import { answer, brake, brakeToEnter, brakeToOff, brakeToPress, turn, turnToReturn, turnToSteer } from './helpers/recordRuns'

describe('기록 단계·칸·이름', () => {
  test('기록 단계에만 이름이 있다', () => {
    expect(recordLabel(brake, 'axle')).toBe('축중 기록')
    expect(recordLabel(brake, 'read')).toBe('좌·우 제동력 기록')
    expect(recordLabel(brake, 'calc')).toBe('계산·판정 기록')
    expect(recordLabel(turn, 'read')).toBe('조향각 기록')
    expect(recordLabel(turn, 'record')).toBe('반경·판정 기록')
    expect(recordLabel(brake, 'press')).toBeNull()
    expect(recordLabel(turn, 'steer')).toBeNull()
  })
  test('칸과 칸이 속한 단계', () => {
    expect(recordItems(brake, 'calc')).toEqual(['deviation', 'sum', 'vehicleCondition'])
    expect(recordItems(brake, 'motor')).toEqual([])
    expect(recordStepOf(brake, 'right')).toBe('read')
    expect(recordStepOf(brake, 'vehicleCondition')).toBe('calc')
    expect(recordStepOf(turn, 'vehicleCondition')).toBe('record')
    expect(recordStepOf(turn, 'axleWeight')).toBeNull()
  })
})

describe('칸이 열리는 때', () => {
  test('선행 단계가 끝나야 열린다', () => {
    const r = brakeToEnter()
    expect(itemOpen(r, 'axleWeight', false)).toBe(true)
    expect(itemOpen(r, 'left', true)).toBe(false)
    expect(itemOpen(r, 'deviation', true)).toBe(false)
    const t = turnToSteer()
    expect(itemOpen(t, 'leftAngle', false)).toBe(true)
    expect(itemOpen(t, 'radius', false)).toBe(false)
  })
  test('계산 칸은 차량 빼기 뒤, 반경 칸은 직진 복귀 뒤에 열린다', () => {
    const r = brakeToOff()
    for (const id of ['deviation', 'sum', 'vehicleCondition']) expect(itemOpen(r, id, false)).toBe(true)
    const t = turnToReturn('guided', '35', '30')
    for (const id of ['radius', 'vehicleCondition']) expect(itemOpen(t, id, false)).toBe(true)
  })
  test('제동력 좌·우는 페달 뒤에도 최대값이 고정돼야 열린다', () => {
    const r = brakeToPress()
    expect(itemOpen(r, 'left', false)).toBe(false)
    expect(itemOpen(r, 'right', true)).toBe(true)
  })
})

describe('값 복원·칸 표시', () => {
  test('안내 없음: 마지막 최초 답이 저장되는 순간 ✓·✗로 바뀐다(판정 칸 포함)', () => {
    const sheet = createResponseSheet(brake)
    const refOf = (id: string) => String(sheet.items.find((i) => i.itemId === id)!.referenceValue)
    let r = answer(answer(brakeToOff('unguided'), 'deviation', '99.9'), 'sum', refOf('sum'))
    expect(markFor(r, 'deviation')).toEqual({ text: '저장', cls: '' })
    expect(markFor(r, 'vehicleCondition')).toEqual({ text: '', cls: '' })
    r = answer(r, 'vehicleCondition', sheet.vehicleVerdict!)
    expect(markFor(r, 'deviation')).toEqual({ text: '✗', cls: 'bad' })
    expect(markFor(r, 'sum')).toEqual({ text: '✓', cls: 'ok' })
    expect(markFor(r, 'vehicleCondition')).toEqual({ text: '✓', cls: 'ok' })
    expect(markFor(r, 'axleWeight')).toEqual({ text: '✓', cls: 'ok' })
  })
  test('제출한 최종 답만 채우고, 판정은 고른 값으로 채운다', () => {
    expect(restoreInputs(answer(answer(brakeToEnter(), 'axleWeight', '610'), 'axleWeight', '600'))).toEqual({ axleWeight: '600' })
    const t = answer(turnToReturn('guided', '35', '30'), 'vehicleCondition', 'pass')
    expect(restoreInputs(t)).toEqual({ leftAngle: '35', rightAngle: '30', vehicleCondition: 'pass' })
  })
  test('형식이 틀린 입력은 복원하지 않는다', () => {
    expect(restoreInputs(answer(brakeToEnter(), 'axleWeight', '6백'))).toEqual({})
  })
  test('안내 있음은 ✓·✗, 안내 없음은 최초 답이 다 모이기 전까지 저장만', () => {
    const g = answer(brakeToEnter('guided'), 'axleWeight', '610')
    expect(markFor(g, 'axleWeight')).toEqual({ text: '✗', cls: 'bad' })
    expect(markFor(g, 'left')).toEqual({ text: '', cls: '' })
    expect(markFor(answer(brakeToEnter('unguided'), 'axleWeight', '610'), 'axleWeight')).toEqual({ text: '저장', cls: '' })
  })
})

describe('측정 당시 눈금 다시 보기', () => {
  test('안내 없음은 최초 답이 다 모이기 전에는 없고, 각도 오답이 드러나면 생기고, 고쳐 맞히면 없어진다', () => {
    let t = turnToReturn('unguided', '34', '30')
    expect(canReviewDial(t)).toBe(false)
    t = answer(answer(t, 'radius', '5.5'), 'vehicleCondition', 'pass')
    expect(canReviewDial(t)).toBe(true)
    expect(canReviewDial(answer(t, 'leftAngle', '35'))).toBe(false)
  })
  test('직진 복귀 전이거나 각도가 맞거나 제동력이면 없다', () => {
    expect(canReviewDial(answer(turnToSteer('guided'), 'leftAngle', '34'))).toBe(false)
    expect(canReviewDial(turnToReturn('guided', '35', '30'))).toBe(false)
    expect(canReviewDial(turnToReturn('guided', '34', '30'))).toBe(true)
    expect(canReviewDial(brakeToEnter())).toBe(false)
  })
})

describe('창 크기·스크롤·빠진 칸 문구', () => {
  test('보이는 화면을 따르고, 없으면 innerHeight', () => {
    expect(recordWindowBox({ height: 400, offsetTop: 0 }, 800)).toEqual({ top: 8, maxHeight: 384 })
    expect(recordWindowBox({ height: 380.4, offsetTop: 120.2 }, 800)).toEqual({ top: 128, maxHeight: 364 })
    expect(recordWindowBox(null, 700)).toEqual({ top: 8, maxHeight: 684 })
    expect(recordWindowBox({ height: 100, offsetTop: 0 }, 800).maxHeight).toBe(160)
  })
  test('줄이 창 안에 다 보이게 움직일 양(줄이 창보다 크면 줄의 위를 맞춘다)', () => {
    const body = { top: 100, bottom: 400 }
    expect(scrollDelta(body, { top: 150, bottom: 250 })).toBe(0)
    expect(scrollDelta(body, { top: 60, bottom: 120 })).toBe(-48)
    expect(scrollDelta(body, { top: 350, bottom: 450 })).toBe(58)
    expect(scrollDelta(body, { top: 300, bottom: 800 })).toBe(192)
  })
  test('입력을 누르지 않은 칸은 그것을 알린다', () => {
    expect(missingText('축중', false)).toBe('축중 입력이 필요합니다.')
    expect(missingText('축중', true)).toBe('축중 칸 옆 입력을 눌러야 저장됩니다.')
  })
})
