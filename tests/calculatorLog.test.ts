// 계산기 기록(설계 docs/superpowers/specs/2026-11-11-calculator-design.md §3) — 수행 상태에 쌓는 계산 기록
import { describe, expect, test } from 'vitest'
import brake from '../src/data/tasks/task.braking-force.case-lv1.json'
import turn from '../src/data/tasks/task.min-turning-radius.case-lv1.json'
import { CALCULATOR_LOG_LIMIT, calculatorKindOf, calculatorStepOf, createTaskRun, logCalculation, pauseRun, rehydrateRun, serializeRun, type RunSnapshot } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'

let n = 0
const clockAt = (start: number) => {
  let t = start
  return {
    deps: { now: () => t, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` },
    tick: (ms: number) => { t += ms },
    back: (ms: number) => { t -= ms },
  }
}
const ok = (expression: string, result: string) => ({ expression, result, error: null })
const B = brake as unknown as ApprovedTask
const T = turn as unknown as ApprovedTask

describe('계산기 기록(§3)', () => {
  test('과제마다 계산기 종류와 기록 단계가 정해져 있다', () => {
    expect(calculatorKindOf(B)).toBe('basic')
    expect(calculatorStepOf(B)).toBe('calc')
    expect(calculatorKindOf(T)).toBe('scientific')
    expect(calculatorStepOf(T)).toBe('record')
  })
  test('새 수행은 빈 기록으로 시작하고, = 한 번에 한 줄을 순번·경과 시간과 함께 남긴다(사건·오류 수는 그대로)', () => {
    const c = clockAt(1_000_000)
    let run = createTaskRun(B, { difficultyMode: 'guided' }, c.deps)
    expect(run.calculatorLog).toEqual([])
    expect(run.calculatorLogTruncated).toBe(false)
    c.tick(5000)
    run = logCalculation(run, ok('240-200/600*100', '6.666666667'))
    c.tick(2000)
    run = logCalculation(run, { expression: '5/0', result: null, error: 'divideByZero' })
    expect(run.calculatorLog).toEqual([
      { sequence: 1, elapsedMs: 5000, stepId: 'calc', kind: 'basic', expression: '240-200/600*100', result: '6.666666667' },
      { sequence: 2, elapsedMs: 7000, stepId: 'calc', kind: 'basic', expression: '5/0', error: 'divideByZero' },
    ])
    expect(run.events.filter((e) => e.type !== 'taskStarted')).toEqual([])
    expect(run.errorCount).toBe(0)
  })
  test('최소회전반경은 공학용·record 단계로 남는다', () => {
    const run = logCalculation(createTaskRun(T, { difficultyMode: 'unguided' }, clockAt(0).deps), ok('2.7/sin(32)+0.1', '5.19511577'))
    expect(run.calculatorLog[0]).toMatchObject({ stepId: 'record', kind: 'scientific', expression: '2.7/sin(32)+0.1', result: '5.19511577' })
  })
  test(`${CALCULATOR_LOG_LIMIT}줄을 넘으면 더 적지 않고 넘침만 표시한다`, () => {
    let run = createTaskRun(B, { difficultyMode: 'guided' }, clockAt(0).deps)
    for (let i = 0; i < CALCULATOR_LOG_LIMIT + 5; i++) run = logCalculation(run, ok(`${i}+1`, String(i + 1)))
    expect(run.calculatorLog).toHaveLength(CALCULATOR_LOG_LIMIT)
    expect(run.calculatorLog[CALCULATOR_LOG_LIMIT - 1]!.sequence).toBe(CALCULATOR_LOG_LIMIT)
    expect(run.calculatorLogTruncated).toBe(true)
  })
  test('멈춤 중에는 남기지 않는다', () => {
    const run = pauseRun(createTaskRun(B, { difficultyMode: 'guided' }, clockAt(0).deps), 'manual').run
    expect(logCalculation(run, ok('1+1', '2')).calculatorLog).toEqual([])
  })
  test('식은 80자, 결과는 24자까지만 남긴다', () => {
    const run = logCalculation(createTaskRun(B, { difficultyMode: 'guided' }, clockAt(0).deps), ok('1'.repeat(100), '9'.repeat(30)))
    expect(run.calculatorLog[0]!.expression).toHaveLength(80)
    expect(run.calculatorLog[0]!.result).toHaveLength(24)
  })
  test('경과 시간은 거꾸로 가지 않는다(시계가 뒤로 가도)', () => {
    const c = clockAt(10_000)
    let run = createTaskRun(B, { difficultyMode: 'guided' }, c.deps)
    c.tick(3000); run = logCalculation(run, ok('1+1', '2'))
    c.back(2000); run = logCalculation(run, ok('2+2', '4'))
    expect(run.calculatorLog.map((e) => e.elapsedMs)).toEqual([3000, 3000])
  })
  test('초안 저장·복원: 기록이 이어지고 복원 시계는 마지막 계산 뒤에서 이어 간다. 예전 초안(칸 없음)은 빈 기록으로 읽는다', () => {
    const c = clockAt(0)
    let run = createTaskRun(B, { difficultyMode: 'guided' }, c.deps)
    c.tick(9000); run = logCalculation(run, ok('1+1', '2'))
    const snap = serializeRun(run)
    expect(snap.lastElapsedMs).toBe(9000)
    const back = rehydrateRun(snap, clockAt(500_000).deps)
    expect(back.calculatorLog).toHaveLength(1)
    expect(back.events[back.events.length - 1]!.elapsedMs).toBe(9000)
    const { calculatorLog: _l, calculatorLogTruncated: _t, ...old } = snap
    const legacy = rehydrateRun(old as unknown as RunSnapshot, clockAt(0).deps)
    expect(legacy.calculatorLog).toEqual([])
    expect(legacy.calculatorLogTruncated).toBe(false)
  })
})
