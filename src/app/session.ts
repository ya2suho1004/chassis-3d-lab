// 화면용 세션 로직 — 익명 코드 형식, demo 세션 생성, 안내문·피드백 조회
// 2단계 전반부: 저장·전송 없음. 모든 수행은 runPurpose=demo, researchUseApproved=false.
import lv1 from '../data/tasks/task.braking-force.case-lv1.json'
import lv2 from '../data/tasks/task.braking-force.case-lv2.json'
import type { SessionContext } from '../domain/record'
import type { TaskRun } from '../domain/taskEngine'
import type { ApprovedTask, FeedbackText } from '../domain/types'

export const APP_VERSION = '0.3.0-demo'

/** 기본 코드 규칙: 학급 글자 1개 + 하이픈 + 두 자리 번호 (예: A-01). 실제 규칙은 세션 설정에서 승인. */
const CODE_RE = /^[A-Z]-\d{2}$/

export function validateStudentCode(raw: string): { ok: true; code: string } | { ok: false; reason: string } {
  const code = raw.trim().toUpperCase()
  if (!CODE_RE.test(code)) return { ok: false, reason: '익명 코드는 A-01 처럼 "학급 글자-두 자리 번호" 형식입니다.' }
  return { ok: true, code }
}

export function listTasks(): ApprovedTask[] {
  return [lv1 as ApprovedTask, lv2 as ApprovedTask]
}

export function createDemoSession(opts: { studentCode: string; sessionCode: string; attemptRole: SessionContext['attemptRole']; usagePhase: SessionContext['usagePhase'] }): SessionContext {
  return {
    recordId: crypto.randomUUID(),
    anonymousStudentCode: opts.studentCode,
    classConditionCode: 'DEMO',
    sessionCode: opts.sessionCode,
    sessionSnapshotId: '00000000-0000-4000-8000-000000000001', // demo 고정 스냅샷(승인 아님)
    attemptRole: opts.attemptRole,
    retryOfRecordId: null,
    retryCount: 0,
    runPurpose: 'demo',
    usagePhase: opts.usagePhase,
    configurationApproval: { taskApproved: true, rulesetApproved: true, layoutConfirmed: false, researchUseApproved: false },
    displayMode: 'diagram',
    versions: {
      layoutVersion: 'surveyed-partial-2026-10-21',
      judgeEngineVersion: '0.1.0',
      sessionConfigVersion: 'unapproved',
      researchProtocolVersion: 'unapproved',
      feedbackPolicyVersion: 'unapproved',
    },
    clientAppVersion: APP_VERSION,
    startedAtIso: new Date().toISOString(),
  }
}

/** 안내 모드에서만 다음 단계 안내문을 준다. 무안내에서는 정답 순서를 공개하지 않는다. */
export function guidanceFor(run: TaskRun): { stepId: string; text: string } | null {
  if (run.difficultyMode !== 'guided') return null
  if (!run.nextStepId) return null
  const step = run.task.steps.find((s) => s.stepId === run.nextStepId)
  return step ? { stepId: step.stepId, text: step.instruction } : null
}

export function feedbackFor(task: ApprovedTask, key: string | null | undefined): FeedbackText | null {
  if (!key) return null
  return task.feedback[key] ?? null
}
