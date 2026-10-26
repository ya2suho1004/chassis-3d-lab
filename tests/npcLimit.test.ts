// Codex B3-b: 이벤트 한도에서 NPC 검사 횟수와 npcInspected 사건이 어긋나지 않아야 한다
import { describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createTaskRun, requestHint, EVENT_LIMIT } from '../src/domain/taskEngine'
import { inspectPerformance } from '../src/domain/npcInspection'
import type { ApprovedTask } from '../src/domain/types'

let n = 0
const aid = () => `60000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

describe('이벤트 한도와 NPC 검사', () => {
  test('한도에 닿으면 검사 횟수를 올리지 않고 recorded=false로 돌려준다', () => {
    let run = createTaskRun(lv1 as ApprovedTask, { difficultyMode: 'guided' })
    for (let i = 0; i < EVENT_LIMIT; i++) run = requestHint(run, aid()).run
    expect(run.events).toHaveLength(EVENT_LIMIT)
    const r = inspectPerformance(run)
    expect(r.recorded).toBe(false)
    expect(r.run.npcInspectionCount).toBe(0)
    expect(r.run.events).toHaveLength(EVENT_LIMIT)
    expect(r.run.events.filter((e) => e.type === 'npcInspected')).toHaveLength(r.run.npcInspectionCount)
  })
  test('여유가 있으면 횟수와 사건이 함께 1 오른다', () => {
    const r = inspectPerformance(createTaskRun(lv1 as ApprovedTask, { difficultyMode: 'guided' }))
    expect(r.recorded).toBe(true); expect(r.run.npcInspectionCount).toBe(1); expect(r.run.events.filter((e) => e.type === 'npcInspected')).toHaveLength(1)
  })
})
