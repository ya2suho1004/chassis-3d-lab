import { describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { validateStudentCode, entryKindFor, ENTRY_TEXT, createDemoSession, guidanceFor, feedbackFor, listTasks } from '../src/app/session'
import { createTaskRun, attempt } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'

const task = lv1 as ApprovedTask

// 학번 입장(설계 2026-11-14-student-number-and-class-link §3-1): 리허설은 가상 코드 D-xx, 그 밖은 학번 네 자리
describe('세션 — 입장 코드', () => {
  test('세션 종류로 입장 방식을 정한다: 리허설은 가상 코드, 시연·연구·모르는 세션은 학번', () => {
    expect(entryKindFor('DEMO-ONLY')).toBe('studentNumber')
    for (const s of ['CLS-L12', 'CLS-L5']) expect(entryKindFor(s)).toBe('studentNumber')
    for (const s of ['REH-L12', 'REH-L5', 'REH-USAB']) expect(entryKindFor(s)).toBe('virtualCode')
    expect(entryKindFor('EXP-L12')).toBe('studentNumber')
    expect(entryKindFor('없는세션')).toBe('studentNumber')
  })

  test('학번: 학년 1~3 + 반 1~9 + 번호 01~99 네 자리', () => {
    for (const ok of ['1101', '2211', '3999', '1901', '3110']) expect(validateStudentCode(ok, 'DEMO-ONLY')).toEqual({ ok: true, code: ok })
    expect(validateStudentCode(' 2211 ', 'DEMO-ONLY')).toEqual({ ok: true, code: '2211' })
    for (const bad of ['0101', '4101', '9999', '2011', '2200', '1100', '221', '22110', '22-11', 'A-01', 'D-01', '２２１１', '홍길동', '', '   '])
      expect(validateStudentCode(bad, 'DEMO-ONLY').ok, bad).toBe(false)
  })

  test('세션을 주지 않으면 시연 세션 규칙(학번)', () => {
    expect(validateStudentCode('2211')).toEqual({ ok: true, code: '2211' })
    expect(validateStudentCode('A-01').ok).toBe(false)
  })

  test('리허설: 가상 코드 D-두 자리만(서버가 받는 범위와 같다), 소문자는 대문자로', () => {
    expect(validateStudentCode('D-01', 'REH-L12')).toEqual({ ok: true, code: 'D-01' })
    expect(validateStudentCode('d-07', 'REH-L5')).toEqual({ ok: true, code: 'D-07' })
    expect(validateStudentCode('D-99', 'REH-USAB')).toEqual({ ok: true, code: 'D-99' })
    for (const bad of ['2211', 'A-01', 'D-1', 'D-001', 'D01', 'ㅇ-01', '']) expect(validateStudentCode(bad, 'REH-L12').ok, bad).toBe(false)
  })

  test('오류 글은 방식마다 다르고 예를 보인다', () => {
    const n = validateStudentCode('A-01', 'DEMO-ONLY'), v = validateStudentCode('2211', 'REH-L12')
    expect(n.ok ? '' : n.reason).toBe(ENTRY_TEXT.studentNumber.error)
    expect(v.ok ? '' : v.reason).toBe(ENTRY_TEXT.virtualCode.error)
    expect(ENTRY_TEXT.studentNumber.error).toMatch(/네 자리/)
    expect(ENTRY_TEXT.studentNumber.error).toMatch(/2211/)
    expect(ENTRY_TEXT.virtualCode.error).toMatch(/D-01/)
    // 학생에게 보이는 글에서 '익명 코드'라는 말은 쓰지 않는다(학번은 익명이 아님)
    for (const t of Object.values(ENTRY_TEXT)) expect(JSON.stringify(t)).not.toMatch(/익명|가명/)
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

  test('과제 목록은 제동력 사례 2개 + 최소회전반경 사례 2개를 주고, 규칙은 교사 승인·과제 전체는 pending이다', () => {
    const list = listTasks()
    expect(list.map((t) => t.measurement.caseId)).toEqual(['case-rear-ok-240-200-600', 'case-rear-deviation-250-190-600', 'case-left-35-30-2.7', 'case-right-32-36-2.7'])
    expect(list.map((t) => t.taskId)).toEqual(['braking-force', 'braking-force', 'min-turning-radius', 'min-turning-radius'])
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
