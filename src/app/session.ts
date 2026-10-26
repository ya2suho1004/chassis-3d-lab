// 화면용 세션 로직 — 익명 코드 형식, demo 세션 생성, 안내문·피드백 조회
// 2단계 전반부: 저장·전송 없음. 모든 수행은 runPurpose=demo, researchUseApproved=false.
import lv1 from '../data/tasks/task.braking-force.case-lv1.json'
import lv2 from '../data/tasks/task.braking-force.case-lv2.json'
import snapshots from '../data/session/demo-snapshots.json'
import type { SessionContext } from '../domain/record'
import type { DifficultyMode, TaskRun } from '../domain/taskEngine'
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

/**
 * 시연 세션 만들기 — 선택(사례·도움 방식·수업 시점·진입 방향)에 맞는 불변 스냅샷(src/data/session/demo-snapshots.json, 계약 session.snapshot 1.0.0)을 고정한다.
 * 스냅샷의 versions·승인이 record에 그대로 들어가며, 수신점은 같은 목록(DemoSnapshots.gs)과 대조한다(docs/17 §4, Codex 검토 B2).
 * 과제 전체는 pending(U1 보류)이므로 taskApproved=false. 목록에 없는 조합은 만들지 않는다.
 */
export function createDemoSession(opts: { studentCode: string; sessionCode: string; attemptRole: SessionContext['attemptRole']; usagePhase: SessionContext['usagePhase']; vehicleEntryDirection?: 'north' | 'south' | null; task?: ApprovedTask; difficultyMode?: DifficultyMode }): SessionContext {
  const task = opts.task ?? (lv1 as ApprovedTask)
  const mode = opts.difficultyMode ?? 'guided'
  const dir = opts.vehicleEntryDirection ?? null
  const snap = snapshots.find((s) => s.sessionCode === opts.sessionCode && s.versions.taskDefinitionVersion === task.taskDefinitionVersion && s.difficultyMode === mode && s.usagePhase === opts.usagePhase && s.sessionConfiguration.vehicleEntryDirection === dir)
  if (!snap) throw new Error(`SNAPSHOT_NOT_FOUND: ${opts.sessionCode}/${task.taskDefinitionVersion}/${mode}/${opts.usagePhase}/${dir}`)
  return {
    recordId: crypto.randomUUID(),
    anonymousStudentCode: opts.studentCode,
    classConditionCode: snap.classConditionCode,
    sessionCode: snap.sessionCode,
    sessionSnapshotId: snap.sessionSnapshotId,
    attemptRole: opts.attemptRole,
    retryOfRecordId: null,
    retryCount: 0,
    runPurpose: 'demo',
    usagePhase: opts.usagePhase,
    configurationApproval: { ...snap.configurationApproval },
    displayMode: 'threeD',
    versions: {
      layoutVersion: snap.versions.layoutVersion,
      judgeEngineVersion: snap.versions.judgeEngineVersion,
      sessionConfigVersion: snap.versions.sessionConfigVersion,
      researchProtocolVersion: snap.versions.researchProtocolVersion,
      feedbackPolicyVersion: snap.versions.feedbackPolicyVersion,
    },
    clientAppVersion: APP_VERSION,
    startedAtIso: new Date().toISOString(),
    vehicleEntryDirection: dir,
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
