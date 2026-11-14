// 화면용 세션 로직 — 입장 코드 형식(학번·가상 코드), demo 세션 생성, 안내문·피드백 조회
// 2단계 전반부: 저장·전송 없음. 모든 수행은 runPurpose=demo, researchUseApproved=false.
import lv1 from '../data/tasks/task.braking-force.case-lv1.json'
import lv2 from '../data/tasks/task.braking-force.case-lv2.json'
import turn1 from '../data/tasks/task.min-turning-radius.case-lv1.json'
import turn2 from '../data/tasks/task.min-turning-radius.case-lv2.json'
import snapshots from '../data/session/demo-snapshots.json'
import type { SessionContext } from '../domain/record'
import type { DifficultyMode, TaskRun } from '../domain/taskEngine'
import type { ApprovedTask, FeedbackText } from '../domain/types'
import { newUuid } from '../domain/uuid'
import { APP_BASE_VERSION, APP_COMMIT, appVersionString } from './buildInfo'
import { DEFAULT_SESSION_CODE, sessionDef } from './sessions'

/** 기록 clientAppVersion — 기본 판 + 빌드 커밋(H1). 예: 0.3.2-demo+1a2b3c4d5e6f */
export const APP_VERSION = appVersionString(APP_BASE_VERSION, APP_COMMIT)

/**
 * 입장 코드 규칙(설계 docs/superpowers/specs/2026-11-14-student-number-and-class-link-design.md §3-1).
 * - 리허설 세션: 가상 코드 D-두 자리(서버 접수 시험용, 서버가 받는 범위와 같다).
 * - 그 밖(시연, 아직 열리지 않은 연구 세션): 학번 = 학년(1~3) + 반(1~9) + 번호(01~99) 네 자리. 학번은 학생을 알아볼 수 있는 값이다(§5).
 * 연구 세션의 코드 형식은 IRB와 함께 다시 정한다. 기록 필드 이름은 계약 때문에 anonymousStudentCode 그대로다.
 */
export type EntryKind = 'studentNumber' | 'virtualCode'
const STUDENT_NUMBER_RE = /^[1-3][1-9](0[1-9]|[1-9]\d)$/
const VIRTUAL_CODE_RE = /^D-\d{2}$/

export const ENTRY_TEXT: Record<EntryKind, { word: string; label: string; example: string; placeholder: string; error: string; inputMode: 'numeric' | 'text' }> = {
  studentNumber: {
    word: '학번', label: '학번 네 자리', example: '예: 2학년 2반 11번 → 2211', placeholder: '2211',
    error: '학번은 학년·반·번호를 붙인 네 자리 숫자예요. 예: 2학년 2반 11번 → 2211', inputMode: 'numeric',
  },
  virtualCode: {
    word: '가상 코드', label: '가상 코드', example: '예: D-01', placeholder: 'D-01',
    error: '가상 코드는 D-01처럼 써요. 한글 자판이면 영문으로 바꿔 넣으세요.', inputMode: 'text',
  },
}

export function entryKindFor(sessionCode: string): EntryKind {
  return sessionDef(sessionCode)?.kind === 'rehearsal' ? 'virtualCode' : 'studentNumber'
}

export function validateStudentCode(raw: string, sessionCode: string = DEFAULT_SESSION_CODE): { ok: true; code: string } | { ok: false; reason: string } {
  const kind = entryKindFor(sessionCode)
  const code = kind === 'virtualCode' ? raw.trim().toUpperCase() : raw.trim()
  const re = kind === 'virtualCode' ? VIRTUAL_CODE_RE : STUDENT_NUMBER_RE
  if (!re.test(code)) return { ok: false, reason: ENTRY_TEXT[kind].error }
  return { ok: true, code }
}

export function listTasks(): ApprovedTask[] {
  return [lv1 as ApprovedTask, lv2 as ApprovedTask, turn1 as unknown as ApprovedTask, turn2 as unknown as ApprovedTask]
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
    recordId: newUuid(),
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
