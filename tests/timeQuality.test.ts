// Codex 회신 C-P2-1: 복원 시 벽시계가 뒤로 갔으면 producer가 timeQuality=uncertain으로 표시한다
import { describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createTaskRun, attempt, serializeRun, rehydrateRun } from '../src/domain/taskEngine'
import { buildRecordPayload } from '../src/domain/record'
import { createDemoSession } from '../src/app/session'
import type { ApprovedTask } from '../src/domain/types'

const task = lv1 as ApprovedTask
let n = 0
const aid = () => `70000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const depsAt = (t: number) => ({ now: () => t, newId: aid })

describe('복원과 시간 품질', () => {
  test('저장 시각보다 이른 벽시계로 복원하면 uncertain, 정상이면 resumed', () => {
    const t0 = Date.parse('2026-10-27T00:01:00Z')
    let run = createTaskRun(task, { difficultyMode: 'guided' }, depsAt(t0))
    run = attempt(run, { type: 'step', stepId: 'ppe' }, aid()).run
    const snap = serializeRun(run)
    expect(snap.serializedAtWallMs).toBe(t0)
    const back = rehydrateRun(snap, depsAt(t0 - 50_000)) // 시계가 50초 뒤로
    expect(back.timeQuality).toBe('uncertain')
    const ok = rehydrateRun(snap, depsAt(t0 + 5_000))
    expect(ok.timeQuality).toBe('resumed')
  })
  test('완료 시각이 세션 시작보다 이르면 기록의 timeQuality는 uncertain이 된다(원본 시각은 고치지 않음)', () => {
    const session = createDemoSession({ studentCode: 'D-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', task, difficultyMode: 'guided' })
    const run = createTaskRun(task, { difficultyMode: 'guided' })
    const earlier = new Date(Date.parse(session.startedAtIso) - 60_000).toISOString()
    const p = buildRecordPayload(run, session, { completedAtIso: earlier, completionStatus: 'aborted' })
    expect(p.timing.timeQuality).toBe('uncertain')
    expect(p.completedAt).toBe(earlier); expect(p.startedAt).toBe(session.startedAtIso)
    const normal = buildRecordPayload(run, session, { completedAtIso: new Date(Date.parse(session.startedAtIso) + 1000).toISOString(), completionStatus: 'aborted' })
    expect(normal.timing.timeQuality).toBe('continuous')
  })
})
