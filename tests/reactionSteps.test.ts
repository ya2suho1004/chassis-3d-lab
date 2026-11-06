// 반응 규칙이 기대는 단계 이름이 과제 자료에 실제로 있는지(코드 검토 Task 2)
import { describe, expect, it } from 'vitest'
import { listTasks } from '../src/app/session'

describe('reactions가 쓰는 단계 이름', () => {
  it("모든 과제에 'ppe', 최소회전반경 과제에 'steer'", () => {
    for (const t of listTasks()) {
      const ids = t.steps.map((s) => s.stepId)
      expect(ids).toContain('ppe')
      if (t.taskId === 'min-turning-radius') expect(ids).toContain('steer')
    }
  })
})
