// 기록 창 안 내용(설계 2026-11-10 §4): 단계마다 계기와 그 단계 칸만, 계산 단계는 내가 적은 값
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { recordInputId } from '../src/app/focusResponse'
import { itemOpen, markFor, recordItems } from '../src/app/recordSteps'
import type { TaskRun } from '../src/domain/taskEngine'
import { STRAIGHT, steeredRig } from '../src/scene/turningRig'
import type { FieldIo } from '../src/screens/RecordFields'
import { RecordSheet, type BrakeGauge } from '../src/screens/RecordSheet'
import { dialCaption, TurningDialPicture } from '../src/screens/TurningDialPicture'
import { answer, brakeToEnter, brakeToOff, brakeToPress, turn, turnToReturn, turnToSteer } from './helpers/recordRuns'

const io = (run: TaskRun, hold = true): FieldIo => ({ value: () => '', change: () => {}, submit: () => {}, mark: (id) => markFor(run, id), open: (id) => itemOpen(run, id, hold), idOf: recordInputId })
const gauge: BrakeGauge = { axle: '600 kg', lr: 'L 240   R 200  (kg)', hold: true, measuring: false }
type SheetProps = Parameters<typeof RecordSheet>[0]
const sheet = (run: TaskRun, stepId: string, over: Partial<SheetProps> = {}) =>
  renderToStaticMarkup(createElement(RecordSheet, { run, stepId, io: io(run), gauge, needles: STRAIGHT, reviewing: false, canReview: false, onToggleReview: () => {}, note: '', onNote: () => {}, ...over }))
const ids = (h: string) => [...h.matchAll(/id="rec-([A-Za-z]+)"/g)].map((m) => m[1])

const textOutsideSvg = (h: string) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ')

describe('기록 창 내용', () => {
  test('축중: 표시창과 축중 칸만', () => {
    const h = sheet(brakeToEnter(), 'axle')
    expect(h).toContain('AXLE Load')
    expect(h).toContain('600 kg')
    expect(ids(h)).toEqual(['axleWeight'])
  })
  test('좌·우 제동력: 숫자가 올라가는 동안은 측정 중이고 칸이 닫힌다', () => {
    const r = brakeToPress()
    const h = sheet(r, 'read', { io: io(r, false), gauge: { ...gauge, hold: false, measuring: true } })
    expect(ids(h)).toEqual(['left', 'right'])
    expect(h).toContain('측정 중')
    expect(h).toMatch(/id="rec-left"[^>]*disabled=""/)
    expect(sheet(r, 'read')).toContain('최대값 고정')
  })
  test('계산·판정: 실제 값이 아니라 내가 적은 값을 보인다', () => {
    const h = sheet(answer(brakeToOff(), 'axleWeight', '610'), 'calc')
    expect(h).toContain('내가 적은 값: 축중 610 · 좌 240 · 우 200 (kg)')
    expect(ids(h)).toEqual(['deviation', 'sum', 'vehicleCondition'])
    expect(h.match(/name="rec-verdict"/g)?.length).toBe(2)
    expect(h).toContain('정비 및 조치할 사항')
  })
  test('조향각: 바퀴마다 눈금 그림과 칸, 다시 보기 버튼은 넘겨받은 조건일 때만', () => {
    const r = turnToSteer()
    const h = sheet(r, 'read', { needles: steeredRig(turn) })
    expect(h.match(/class="tt-dial"/g)?.length).toBe(2)
    expect(ids(h)).toEqual(['leftAngle', 'rightAngle'])
    expect(h).not.toContain('측정 당시 눈금 다시 보기')
    expect(sheet(r, 'read', { canReview: true })).toContain('측정 당시 눈금 다시 보기')
    expect(sheet(r, 'read', { canReview: true, reviewing: true })).toContain('측정 당시(핸들을 끝까지 돌렸을 때)')
  })
  test('반경·판정: 작업지시서·내가 적은 조향각·sin 표', () => {
    const h = sheet(turnToReturn('guided', '34', '30'), 'record')
    expect(h).toContain('작업지시서: 좌회전 · 축거 L 2.7 m · r 0.1 m')
    expect(h).toContain('내가 적은 조향각: 좌 34° · 우 30°')
    expect(h).toContain('sin 30° = 0.5')
    expect(ids(h)).toEqual(['radius', 'vehicleCondition'])
  })
})

describe('연구 규칙 지킴(§4·§5)', () => {
  test('계산: 좌·우도 내가 적은 값이고, 실제 값 계기는 없다', () => {
    const h = sheet(answer(answer(answer(brakeToOff(), 'axleWeight', '610'), 'left', '245'), 'right', '205'), 'calc')
    expect(h).toContain('내가 적은 값: 축중 610 · 좌 245 · 우 205 (kg)')
    expect(h).not.toContain('AXLE Load')
    expect(h).not.toContain('BRAKE')
    expect(h).not.toMatch(/\b(600|240|200)\b/)
  })
  test('조향각: 그림 밖 글자·aria-label에 숫자가 없고, 바퀴마다 제 바늘', () => {
    const rig = steeredRig(turn)
    const h = sheet(turnToSteer(), 'read', { needles: rig })
    expect(textOutsideSvg(h)).not.toMatch(/\d/)
    expect(h).not.toMatch(/aria-label="[^"]*\d/)
    for (const side of ['left', 'right'] as const)
      expect(h).toContain(renderToStaticMarkup(createElement(TurningDialPicture, { side, deg: side === 'left' ? rig.leftDeg : rig.rightDeg, caption: dialCaption(side, false) })))
  })
  test('반경: 두 조향각 모두 내가 적은 값, 산출 근거·창 라디오 이름', () => {
    const h = sheet(turnToReturn('guided', '34', '31'), 'record')
    expect(h).toContain('내가 적은 조향각: 좌 34° · 우 31°')
    expect(h).toContain('산출 근거')
    expect(h.match(/name="rec-verdict"/g)?.length).toBe(2)
  })
  test('안내 없음: 최초 답이 다 모이기 전에는 칸 옆에 저장만, ✓·✗는 없다(안내 있음은 같은 값에 ✗)', () => {
    const h = sheet(answer(brakeToEnter('unguided'), 'axleWeight', '610'), 'axle')
    expect(h).toMatch(/<span class="mark\s*">저장<\/span>/)
    expect(h).not.toMatch(/<span class="mark (ok|bad)">/)
    expect(h).not.toMatch(/[✓✗]/)
    expect(sheet(answer(brakeToEnter(), 'axleWeight', '610'), 'axle')).toContain('<span class="mark bad">✗</span>')
  })
  test('창의 칸은 엔진 정의와 같다(§2)', () => {
    const cases: Array<[TaskRun, string]> = [[brakeToEnter(), 'axle'], [brakeToPress(), 'read'], [brakeToOff(), 'calc'], [turnToSteer(), 'read'], [turnToReturn('guided', '35', '30'), 'record']]
    for (const [r, s] of cases) expect(ids(sheet(r, s))).toEqual([...recordItems(r.task, s)])
  })
  test('기록 단계가 아니거나 모르는 단계면 그리지 않는다', () => {
    expect(sheet(brakeToEnter(), 'ppe')).toBe('')
    expect(sheet(brakeToEnter(), 'nope')).toBe('')
  })
})
