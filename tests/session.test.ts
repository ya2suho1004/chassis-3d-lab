import { describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { validateStudentCode, createDemoSession, guidanceFor, feedbackFor, listTasks } from '../src/app/session'
import { createTaskRun, attempt } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'

const task = lv1 as ApprovedTask

describe('세션 — 익명 코드', () => {
  test('A-01 형식만 허용한다', () => {
    expect(validateStudentCode('A-01')).toEqual({ ok: true, code: 'A-01' })
    expect(validateStudentCode('b-07')).toEqual({ ok: true, code: 'B-07' })
    expect(validateStudentCode('A01').ok).toBe(false)
    expect(validateStudentCode('홍길동').ok).toBe(false)
    expect(validateStudentCode('').ok).toBe(false)
  })

  test('demo 세션은 runPurpose=demo, 연구사용 미승인, 새 recordId(UUID)를 가진다', () => {
    const s = createDemoSession({ studentCode: 'A-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview' })
    expect(s.runPurpose).toBe('demo')
    expect(s.configurationApproval.researchUseApproved).toBe(false)
    expect(s.configurationApproval.layoutConfirmed).toBe(false)
    expect(s.recordId).toMatch(/^[0-9a-f-]{36}$/)
    expect(s.anonymousStudentCode).toBe('A-01')
    expect(s.usagePhase).toBe('preview')
    expect(s.startedAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test('두 번 만들면 recordId가 다르다', () => {
    const a = createDemoSession({ studentCode: 'A-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview' })
    const b = createDemoSession({ studentCode: 'A-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview' })
    expect(a.recordId).not.toBe(b.recordId)
  })
})

describe('세션 — 안내와 피드백', () => {
  test('안내 모드에서는 다음 단계 안내문이 나오고 무안내에서는 null이다', () => {
    const g = createTaskRun(task, { difficultyMode: 'guided' })
    expect(guidanceFor(g)).toEqual({ stepId: 'ppe', text: task.steps[0]!.instruction })
    const u = createTaskRun(task, { difficultyMode: 'unguided' })
    expect(guidanceFor(u)).toBeNull()
  })

  test('피드백 키로 무엇·왜·어떻게 문구를 찾는다', () => {
    expect(feedbackFor(task, 'blocked_ppe')?.what).toContain('보호구')
    expect(feedbackFor(task, 'no-such-key')).toBeNull()
  })

  test('과제 목록은 사례 2개를 주고, 규칙은 교사 승인·과제 전체는 pending(동작 매핑 미완료)이다', () => {
    const list = listTasks()
    expect(list.map((t) => t.measurement.caseId)).toEqual(['case-rear-ok-240-200-600', 'case-rear-deviation-250-190-600'])
    expect(list.every((t) => t.ruleset.approvalStatus === 'approved')).toBe(true)
    expect(list.every((t) => t.approvalStatus === 'pending')).toBe(true)
  })

  test('학생에게 보이는 제목에는 정답 수치·양호/불량이 없다', () => {
    for (const t of listTasks()) {
      expect(t.title).not.toMatch(/\d{3}/)
      expect(t.title).not.toMatch(/양호|불량/)
    }
  })

  test('안내문은 완료된 단계를 건너뛰고 다음 단계를 가리킨다', () => {
    let r = createTaskRun(task, { difficultyMode: 'guided' })
    r = attempt(r, { type: 'step', stepId: 'ppe' }, '10000000-0000-4000-8000-000000000001').run
    expect(guidanceFor(r)?.stepId).toBe('tire')
  })
})
