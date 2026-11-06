// tests/workLog.test.ts — 정비 일지(설계 §4 결과 화면)
import { describe, expect, it } from 'vitest'
import { listTasks } from '../src/app/session'
import { createTaskRun, submitResponse } from '../src/domain/taskEngine'
import { summarizeResponses } from '../src/domain/grading'
import { workLogGroups } from '../src/app/workLog'

const turning = listTasks().find((t) => t.taskId === 'min-turning-radius' && t.measurement.caseId === 'case-left-35-30-2.7')!

describe('workLogGroups', () => {
  it('최소회전반경 사례 1 — 측정·계산·판정 세 묶음, 최종 답과 한글 이름', () => {
    let run = createTaskRun(turning, { difficultyMode: 'guided' })
    for (const [id, v] of [['leftAngle', '35'], ['rightAngle', '30'], ['radius', '5.5'], ['vehicleCondition', 'pass']] as const)
      run = submitResponse(run, id, v, `a-${id}`).run
    const g = workLogGroups(summarizeResponses(run.responses))
    expect(g.map((x) => x.title)).toEqual(['측정', '계산', '판정'])
    expect(g[0]!.lines).toEqual(['좌측 바퀴 조향각 35°', '우측 바퀴 조향각 30°'])
    expect(g[1]!.lines).toEqual(['최소회전반경(m) 5.5'])
    expect(g[2]!.lines).toEqual(['판정 양호'])
  })
  it('아직 안 쓴 칸은 —', () => {
    const g = workLogGroups(summarizeResponses(createTaskRun(turning, { difficultyMode: 'guided' }).responses))
    expect(g[0]!.lines[0]).toBe('좌측 바퀴 조향각 —')
    expect(g[2]!.lines[0]).toBe('판정 —')
  })
})
