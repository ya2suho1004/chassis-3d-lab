import { describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createTaskRun, attempt, pauseRun, resumeRun, rehydrateRun, serializeRun } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'

const task = lv1 as ApprovedTask
let n = 0
const aid = () => `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
let clock = 0
const deps = { now: () => clock, newId: () => `20000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }

describe('일시중지·재개 — 활성 학습시간', () => {
  test('숨김 구간은 경과시간에 더해지지 않는다', () => {
    clock = 0
    let r = createTaskRun(task, { difficultyMode: 'guided' }, deps)
    clock = 10_000
    r = pauseRun(r, 'hidden').run // 10초에 숨김
    clock = 70_000 // 60초 뒤 복귀
    r = resumeRun(r, 'visible').run
    clock = 75_000
    r = attempt(r, { type: 'step', stepId: 'ppe' }, aid()).run
    const last = r.events.at(-1)!
    expect(last.type).toBe('stepCompleted')
    expect(last.elapsedMs).toBe(15_000) // 10초 + 5초, 숨긴 60초 제외
    expect(r.pauseCount).toBe(1)
    expect(r.resumeCount).toBe(1)
    expect(r.events.map((e) => e.type)).toEqual(['taskStarted', 'paused', 'resumed', 'stepCompleted'])
  })

  test('일시중지 중 조작은 거부된다', () => {
    clock = 0
    let r = createTaskRun(task, { difficultyMode: 'guided' }, deps)
    r = pauseRun(r, 'hidden').run
    const res = attempt(r, { type: 'step', stepId: 'ppe' }, aid())
    expect(res.outcome).toBe('paused')
    expect(res.run.completedSteps).toEqual([])
  })

  test('직렬화 → 복원(새로고침)은 같은 상태를 돌려주고 경과시간을 이어 간다', () => {
    clock = 0
    let r = createTaskRun(task, { difficultyMode: 'unguided' }, deps)
    clock = 20_000
    r = attempt(r, { type: 'step', stepId: 'ppe' }, aid()).run // elapsed 20s
    const snap = serializeRun(r)
    expect(typeof JSON.stringify(snap)).toBe('string')
    // 5분 뒤 새 탭에서 복원
    clock = 320_000
    const restored = rehydrateRun(snap, deps)
    expect(restored.completedSteps).toEqual(['ppe'])
    expect(restored.resumeCount).toBe(1)
    expect(restored.timeQuality).toBe('resumed')
    expect(restored.events.at(-1)?.type).toBe('resumed')
    clock = 325_000
    const after = attempt(restored, { type: 'step', stepId: 'tire' }, aid()).run
    expect(after.events.at(-1)?.elapsedMs).toBe(25_000) // 20초 + 5초
  })

  test('복원 시 모터 작동 같은 순간 장비 상태는 안전한 정지 상태로 돌아간다', () => {
    clock = 0
    let r = createTaskRun(task, { difficultyMode: 'guided' }, deps)
    for (const id of ['ppe', 'tire', 'equip', 'enter']) r = attempt(r, { type: 'step', stepId: id }, aid()).run
    r = { ...r, motorOn: true } as typeof r
    const restored = rehydrateRun(serializeRun(r), deps)
    expect(restored.motorOn).toBe(false)
  })
})
