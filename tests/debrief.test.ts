// tests/debrief.test.ts — 정리 화면의 규칙 정리·공식과 규정값·30초 잠금(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 1-3·1-4·1-5·1-8)
import { afterEach, describe, expect, test, vi } from 'vitest'
import { DEBRIEF_LOCK_SECONDS, DEBRIEF_WITHHELD_LINE, debriefFacts, debriefInputOf, debriefNotes, debriefStats, lockLeft, startLockTimer, type DebriefInput } from '../src/app/debrief'
import { listTasks } from '../src/app/session'
import { createTaskRun, submitResponse, type TaskRun } from '../src/domain/taskEngine'
import { summarizeResponses } from '../src/domain/grading'

const tasks = listTasks()
const brake1 = tasks.find((t) => t.measurement.caseId === 'case-rear-ok-240-200-600')!
const brake2 = tasks.find((t) => t.measurement.caseId === 'case-rear-deviation-250-190-600')!
const turn1 = tasks.find((t) => t.measurement.caseId === 'case-left-35-30-2.7')!
const turn2 = tasks.find((t) => t.measurement.caseId === 'case-right-32-36-2.7')!

let n = 0
const answer = (run: TaskRun, itemId: string, v: string) => submitResponse(run, itemId, v, `a${++n}`).run
/** 제동력 사례 1의 바른 답(좌 240·우 200·축중 600 → 편차 6.6·합 73.3 → 양호) */
const RIGHT1: Record<string, string> = { left: '240', right: '200', axleWeight: '600', deviation: '6.6', sum: '73.3', vehicleCondition: 'pass' }
const allRight = (mode: 'guided' | 'unguided' = 'guided') => {
  let r = createTaskRun(brake1, { difficultyMode: mode })
  for (const [k, v] of Object.entries(RIGHT1)) r = answer(r, k, v)
  return r
}
const flat = (d: { good: string[]; improve: string[]; hard: string[] }) => [...d.good, ...d.improve, ...d.hard].join('\n')

describe('규칙 정리 — 묶음별 문장(1-3)', () => {
  test('모두 처음부터 맞히고, 안전 위반·힌트 없이 한 번에 통과하면 잘한 점만 있다', () => {
    const run = { ...allRight(), npcInspectionCount: 1 }
    const d = debriefNotes(debriefInputOf(run, 'completed'))
    expect(d.withheld).toBe(false)
    expect(d.good).toEqual([
      '판독·계산·판정을 처음부터 모두 맞혔어요.',
      '안전 수칙을 한 번도 어기지 않았어요.',
      '검사를 한 번에 통과했어요.',
      '힌트 없이 끝까지 해냈어요.',
    ])
    expect(d.improve).toEqual(['이번 수행에서 보완할 점은 없었어요.'])
    expect(d.hard).toEqual(['크게 막힌 곳은 없었어요.'])
  })

  test('처음 틀렸다 고친 항목과 끝까지 틀린 항목은 항목 이름만 쓴다', () => {
    let r = createTaskRun(brake1, { difficultyMode: 'guided' })
    r = answer(r, 'left', '240'); r = answer(r, 'right', '200'); r = answer(r, 'axleWeight', '600')
    r = answer(r, 'deviation', '7.0'); r = answer(r, 'deviation', '6.6')
    r = answer(r, 'sum', '70.0')
    r = answer(r, 'vehicleCondition', 'pass')
    const d = debriefNotes(debriefInputOf({ ...r, npcInspectionCount: 2 }, 'completed'))
    expect(d.good).toContain('판독을 처음부터 모두 맞혔어요.')
    expect(d.good).toContain('판정을 처음부터 모두 맞혔어요.')
    expect(d.good.join(' ')).not.toMatch(/계산을 처음부터/)
    expect(d.improve).toContain('처음에 틀렸다가 고친 항목이 있어요: 편차(%).')
    expect(d.improve).toContain('끝까지 맞히지 못한 항목이 있어요: 합(%).')
    expect(d.hard).toContain('가장 자주 막힌 곳은 계산이었어요(2번).')
    expect(d.hard).toContain('검사를 2번 받았어요.')
  })

  test('안전 위반 유형·순서 오류·중단·힌트를 고정 틀에 이름과 횟수만 넣어 쓴다', () => {
    const base = debriefInputOf(allRight(), 'aborted')
    const d = debriefNotes({ ...base, safetyViolationCount: 3, safetyViolationTypes: { 's-ppe': 1, 's-lift': 2 }, errorTypes: { order: 3 }, hintCount: 2, npcInspectionCount: 0 })
    expect(d.improve).toContain('안전 수칙을 놓친 곳이 있어요: 보호구 1번, 리프트 주변 확인 2번.')
    expect(d.improve).toContain('작업 순서가 3번 어긋났어요.')
    expect(d.improve).toContain('과제를 끝까지 마치지 못했어요.')
    expect(d.hard).toContain('가장 자주 막힌 곳은 작업 순서였어요(3번).')
    expect(d.hard).toContain('힌트를 2번 썼어요.')
    expect(d.good).not.toContain('안전 수칙을 한 번도 어기지 않았어요.')
    expect(d.good).not.toContain('검사를 한 번에 통과했어요.')
    expect(d.good).not.toContain('힌트 없이 끝까지 해냈어요.')
  })

  test('해당하는 것이 없는 묶음은 고정 문장 한 줄', () => {
    const run = createTaskRun(brake1, { difficultyMode: 'guided' })
    const d = debriefNotes({ ...debriefInputOf(run, 'aborted'), safetyViolationCount: 1, safetyViolationTypes: { 's-ppe': 1 }, hintCount: 0 })
    expect(d.good).toEqual(['다음에 다시 해 보면 잘한 점이 더 보일 거예요.'])
    expect(d.hard).toEqual(['크게 막힌 곳은 없었어요.'])
  })

  test('같은 입력이면 같은 출력', () => {
    const i = debriefInputOf(allRight(), 'completed')
    expect(debriefNotes(i)).toEqual(debriefNotes(i))
  })
})

describe('값 누출 없음(1-3 넣지 않는 것)', () => {
  /** 이 사례의 측정값·계산 기준값·정답 판정, 그리고 학생이 넣은 값 */
  const leaks = (extra: string[]) => ['240', '200', '600', '6.6', '73.3', '양호', '불량', 'pass', 'fail', ...extra]
  test('사례 값·기준값·정답 판정·학생 입력값이 정리 글에 없다', () => {
    let r = createTaskRun(brake1, { difficultyMode: 'guided' })
    r = answer(r, 'left', '241'); r = answer(r, 'right', '199'); r = answer(r, 'axleWeight', '600')
    r = answer(r, 'deviation', '7.1'); r = answer(r, 'sum', '73.4'); r = answer(r, 'vehicleCondition', 'fail')
    const text = flat(debriefNotes(debriefInputOf({ ...r, npcInspectionCount: 3, hintCount: 4 }, 'completed')))
    for (const v of leaks(['241', '199', '7.1', '73.4'])) expect(text).not.toContain(v)
  })
  test('최소회전반경도 조향각·축거·r·기준 반경 답이 없다', () => {
    let r = createTaskRun(turn1, { difficultyMode: 'guided' })
    r = answer(r, 'leftAngle', '34'); r = answer(r, 'rightAngle', '31'); r = answer(r, 'radius', '5.3'); r = answer(r, 'vehicleCondition', 'fail')
    const sum = summarizeResponses(r.responses)
    const text = flat(debriefNotes(debriefInputOf(r, 'completed')))
    for (const v of ['35', '30', '2.7', '0.1', '34', '31', '5.3', '양호', '불량', String(sum.calculationAnswers[0]?.computedReferenceValue)]) expect(text).not.toContain(v)
  })
  test('입력은 응답 요약의 정오와 횟수만 쓴다 — 입력 형에 값 칸이 있어도 정리 글은 그 값을 읽지 않는다', () => {
    const i: DebriefInput = debriefInputOf(allRight(), 'completed')
    const poisoned: DebriefInput = { ...i, summary: { ...i.summary, measurementInputs: i.summary.measurementInputs.map((m) => ({ ...m, presentedValue: 987654, firstInput: '987654', finalInput: '987654' })) } }
    expect(flat(debriefNotes(poisoned))).not.toContain('987654')
  })
})

describe('공식과 규정값(1-4)', () => {
  test('과제 자료의 계산·판정 설명을 그대로 보인다', () => {
    expect(debriefFacts(brake1)).toEqual([
      { label: '공식', text: brake1.feedback.wrong_calc!.why },
      { label: '판정 기준', text: brake1.feedback.wrong_verdict!.why },
    ])
  })
  test('같은 과제의 사례 1·2에서 글이 같다(사례 값을 쓰지 않는다)', () => {
    expect(debriefFacts(brake1)).toEqual(debriefFacts(brake2))
    expect(debriefFacts(turn1)).toEqual(debriefFacts(turn2))
    const text = JSON.stringify([...debriefFacts(brake1), ...debriefFacts(turn1)])
    for (const v of ['240', '200', '250', '190', '600', '6.6', '73.3', '10.0', 'case-', '2.7']) expect(text).not.toContain(v)
  })
})

describe('안내 없음 규칙(1-5)', () => {
  test('중단 + 안내 없음 + 최초 응답이 다 차지 않음이면 정오에 기대는 문장을 빼고 가림 표시', () => {
    let r = createTaskRun(brake1, { difficultyMode: 'unguided' })
    r = answer(r, 'left', '240'); r = answer(r, 'right', '201')
    const d = debriefNotes(debriefInputOf({ ...r, errorTypes: { reading: 4, order: 1 }, errorCount: 5 }, 'aborted'))
    expect(d.withheld).toBe(true)
    const text = flat(d)
    expect(text).not.toMatch(/처음부터 모두 맞혔어요|고친 항목|맞히지 못한 항목|판독값/)
    expect(d.hard).toContain('가장 자주 막힌 곳은 작업 순서였어요(1번).')
    expect(d.improve).toContain('과제를 끝까지 마치지 못했어요.')
    expect(DEBRIEF_WITHHELD_LINE).toBe('과제를 끝까지 마치면 정리를 볼 수 있어요.')
  })
  test('안내 있음 중단, 안내 없음이라도 최초 응답이 다 찼거나 검사 통과면 가리지 않는다', () => {
    let g = createTaskRun(brake1, { difficultyMode: 'guided' })
    g = answer(g, 'left', '240')
    expect(debriefNotes(debriefInputOf(g, 'aborted')).withheld).toBe(false)
    expect(debriefNotes(debriefInputOf(allRight('unguided'), 'aborted')).withheld).toBe(false)
    expect(debriefNotes(debriefInputOf(allRight('unguided'), 'completed')).withheld).toBe(false)
  })
})

describe('짧은 수치 줄', () => {
  test('걸린 시간·학습 오류·안전 위반·힌트·검사 횟수', () => {
    const run = { ...createTaskRun(brake1, { difficultyMode: 'guided' }), errorCount: 2, safetyViolationCount: 1, hintCount: 3, npcInspectionCount: 2 }
    expect(debriefStats(run, 185)).toEqual(['걸린 시간 3분 5초', '학습 오류 2번', '안전 위반 1번', '힌트 3번', '검사 2번'])
    expect(debriefStats(run, 42)[0]).toBe('걸린 시간 42초')
    expect(debriefStats(run, null)[0]).toBe('걸린 시간 —')
  })
})

describe('30초 잠금', () => {
  afterEach(() => { vi.useRealTimers() })
  test('남은 초: 처음 30, 반올림 위로, 30초가 지나면 0', () => {
    expect(DEBRIEF_LOCK_SECONDS).toBe(30)
    expect(lockLeft(1000, 1000)).toBe(30)
    expect(lockLeft(1000, 3500)).toBe(28)
    expect(lockLeft(1000, 30_999)).toBe(1)
    expect(lockLeft(1000, 31_000)).toBe(0)
    expect(lockLeft(1000, 99_000)).toBe(0)
  })
  test('타이머: 초가 바뀔 때만 알리고, 0이 되면 멈춘다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const seen: number[] = []
    const stop = startLockTimer(Date.now(), (s) => seen.push(s))
    vi.advanceTimersByTime(3000)
    expect(seen).toEqual([29, 28, 27])
    vi.advanceTimersByTime(30_000)
    expect(seen.at(-1)).toBe(0)
    expect(seen.filter((s) => s === 0)).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
    stop()
  })
  test('멈추면 더 알리지 않는다', () => {
    vi.useFakeTimers()
    const seen: number[] = []
    const stop = startLockTimer(Date.now(), (s) => seen.push(s))
    stop()
    vi.advanceTimersByTime(5000)
    expect(seen).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
