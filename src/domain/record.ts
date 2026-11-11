// 기록 payload 생성 — docs/design/contracts/record.schema.v1.3.0.json(1.3.0, 2026-11-11부터 두 과제 모두) 형식. 이전 판: record.schema.json(1.1.0)·record.schema.v1.2.0.json
// 원칙(04 §7~8, 05 §4): 확정 연구 내용(recordPayload)만 만든다. 저장·전송 상태(deliveryEnvelope)는 넣지 않는다.
// durationSeconds는 이벤트 경과시간(단조시계)에서 오며 completedAt−startedAt으로 계산하지 않는다.
// researchEligible은 승인 4종·runPurpose=research·completed·NPC passed가 모두 참일 때만 true다.
import { summarizeResponses } from './grading'
import type { CalculatorEntry, DifficultyMode, StepEvent, TaskRun } from './taskEngine'

export type UsagePhase = 'preview' | 'review' | 'other'

export interface SessionContext {
  recordId: string
  anonymousStudentCode: string
  classConditionCode: string
  sessionCode: string
  sessionSnapshotId: string
  attemptRole: 'practice' | 'primary' | 'remediation'
  retryOfRecordId: string | null
  retryCount: number
  runPurpose: 'demo' | 'research'
  /** 수업 시점: 1~2차시 연습(preview) / 5차시 정리(review) / 그 밖의 사용(other). 안내 방식·수행 목적과 별개 축 */
  usagePhase: UsagePhase
  configurationApproval: { taskApproved: boolean; rulesetApproved: boolean; layoutConfirmed: boolean; researchUseApproved: boolean }
  displayMode: 'threeD' | 'diagram'
  versions: { layoutVersion: string; judgeEngineVersion: string; sessionConfigVersion: string; researchProtocolVersion: string; feedbackPolicyVersion: string }
  clientAppVersion: string
  startedAtIso: string
  /** 차량 진입 방향(U6, 설계 13 §9): 교사 세션 설정. 기본 null. 1.1.0 record 계약에 없으므로 payload에 넣지 않는다(Codex 계약 개정 제안) */
  vehicleEntryDirection: 'north' | 'south' | null
}

export interface FinalizeOptions {
  completedAtIso: string
  completionStatus: 'completed' | 'aborted'
  experiencedDisplayModes?: Array<'threeD' | 'diagram'>
  pauseCount?: number
  resumeCount?: number
  timeQuality?: 'continuous' | 'resumed' | 'uncertain'
}

export interface RecordPayload {
  /** 1.3.0(계산기 기록, 2026-11-11): 두 과제 모두. 이전 기록은 제동력 1.1.0, 최소회전반경 1.2.0 */
  schemaVersion: '1.1.0' | '1.2.0' | '1.3.0'
  recordId: string
  anonymousStudentCode: string
  classConditionCode: string
  sessionCode: string
  sessionSnapshotId: string
  taskId: 'braking-force' | 'min-turning-radius'
  difficultyMode: DifficultyMode
  attemptRole: SessionContext['attemptRole']
  retryOfRecordId: string | null
  retryCount: number
  runPurpose: 'demo' | 'research'
  usagePhase: UsagePhase
  researchEligible: boolean
  configurationApproval: SessionContext['configurationApproval']
  displayMode: 'threeD' | 'diagram'
  experiencedDisplayModes: Array<'threeD' | 'diagram'>
  completionStatus: 'completed' | 'aborted'
  startedAt: string
  completedAt: string
  durationSeconds: number
  timing: { pauseCount: number; resumeCount: number; timeQuality: 'continuous' | 'resumed' | 'uncertain' }
  versions: {
    taskDefinitionVersion: string
    rulesetVersion: string
    measurementSetVersion: string
    layoutVersion: string
    judgeEngineVersion: string
    sessionConfigVersion: string
    researchProtocolVersion: string
    feedbackPolicyVersion: string
  }
  stepEvents: StepEvent[]
  errorCount: number
  errorTypes: Record<string, number>
  safetyViolationCount: number
  safetyViolationTypes: Record<string, number>
  hintCount: number
  measurementInputs: ReturnType<typeof summarizeResponses>['measurementInputs']
  calculationAnswers: ReturnType<typeof summarizeResponses>['calculationAnswers']
  vehicleVerdict: 'pass' | 'fail' | null
  judgmentAnswers: ReturnType<typeof summarizeResponses>['judgmentAnswers']
  judgmentCorrect: boolean | null
  npcInspectionResult: 'passed' | 'needsCorrection' | 'notCompleted'
  npcInspectionCount: number
  clientAppVersion: string
  /** 계산기 기록(1.3.0부터, 계산기 설계 §3). 이전 판 기록에는 없다 */
  calculatorLog?: CalculatorEntry[]
  calculatorLogTruncated?: boolean
}

function lastInspection(run: TaskRun): 'passed' | 'needsCorrection' | 'notCompleted' {
  const ev = [...run.events].reverse().find((e) => e.type === 'npcInspected')
  if (!ev) return 'notCompleted'
  return ev.reasonCode === 'PASSED' ? 'passed' : 'needsCorrection'
}

/** 서버·앱의 정본 상한(CANONICAL_MAX_BYTES 32 KiB, src/delivery/submit.ts)보다 1 KiB 작게 잡은 기록 크기 예산.
 *  넘으면 계산기 기록을 뒤에서부터 덜어 내고 넘침을 표시한다(사건 기록이 우선, 계산기 설계 §3.2) */
export const RECORD_BYTES_BUDGET = 31 * 1024
const payloadBytes = (p: RecordPayload) => new TextEncoder().encode(JSON.stringify(p)).length
function fitBudget(p: RecordPayload): RecordPayload {
  if (!p.calculatorLog || p.calculatorLog.length === 0 || payloadBytes(p) <= RECORD_BYTES_BUDGET) return p
  let log = p.calculatorLog
  while (log.length > 0) {
    log = log.slice(0, -1)
    const q: RecordPayload = { ...p, calculatorLog: log, calculatorLogTruncated: true }
    if (payloadBytes(q) <= RECORD_BYTES_BUDGET) return q
  }
  return { ...p, calculatorLog: [], calculatorLogTruncated: true }
}

export function buildRecordPayload(run: TaskRun, session: SessionContext, fin: FinalizeOptions): RecordPayload {
  const approvals = session.configurationApproval
  const allApproved = approvals.taskApproved && approvals.rulesetApproved && approvals.layoutConfirmed && approvals.researchUseApproved
  if (session.runPurpose === 'research' && !allApproved) {
    throw new Error('runPurpose=research 수행은 과제·기준·배치·연구사용 승인이 모두 있어야 한다 (configurationApproval 미충족)')
  }
  const npc = fin.completionStatus === 'completed' ? lastInspection(run) : 'notCompleted'
  if (fin.completionStatus === 'completed' && npc !== 'passed') {
    throw new Error('completionStatus=completed 는 NPC 검사 passed 뒤에만 가능하다')
  }
  const researchEligible = session.runPurpose === 'research' && allApproved && fin.completionStatus === 'completed' && npc === 'passed'
  const summary = summarizeResponses(run.responses)
  const lastEvent = run.events[run.events.length - 1]
  const durationSeconds = lastEvent ? Math.round(lastEvent.elapsedMs / 1000) : 0

  return fitBudget({
    schemaVersion: '1.3.0', // 계산기 기록(2026-11-11)부터 두 과제 모두. 서버는 1.0.0~1.3.0을 받는다
    recordId: session.recordId,
    anonymousStudentCode: session.anonymousStudentCode,
    classConditionCode: session.classConditionCode,
    sessionCode: session.sessionCode,
    sessionSnapshotId: session.sessionSnapshotId,
    taskId: run.task.taskId === 'min-turning-radius' ? 'min-turning-radius' : 'braking-force',
    difficultyMode: run.difficultyMode,
    attemptRole: session.attemptRole,
    retryOfRecordId: session.retryOfRecordId,
    retryCount: session.retryCount,
    runPurpose: session.runPurpose,
    usagePhase: session.usagePhase,
    researchEligible,
    configurationApproval: approvals,
    displayMode: run.experiencedDisplayModes[0] ?? session.displayMode,
    experiencedDisplayModes: fin.experiencedDisplayModes ?? run.experiencedDisplayModes,
    completionStatus: fin.completionStatus,
    startedAt: session.startedAtIso,
    completedAt: fin.completedAtIso,
    durationSeconds,
    timing: { pauseCount: fin.pauseCount ?? run.pauseCount, resumeCount: fin.resumeCount ?? run.resumeCount, timeQuality: Date.parse(fin.completedAtIso) < Date.parse(session.startedAtIso) ? 'uncertain' : (fin.timeQuality ?? run.timeQuality) }, // 완료가 시작보다 이르면 벽시계 불신(원본 시각은 보존)
    versions: {
      taskDefinitionVersion: run.task.taskDefinitionVersion,
      rulesetVersion: run.task.ruleset.rulesetVersion,
      measurementSetVersion: run.task.measurement.measurementSetVersion,
      layoutVersion: session.versions.layoutVersion,
      judgeEngineVersion: session.versions.judgeEngineVersion,
      sessionConfigVersion: session.versions.sessionConfigVersion,
      researchProtocolVersion: session.versions.researchProtocolVersion,
      feedbackPolicyVersion: session.versions.feedbackPolicyVersion,
    },
    stepEvents: run.events,
    errorCount: run.errorCount,
    errorTypes: run.errorTypes,
    safetyViolationCount: run.safetyViolationCount,
    safetyViolationTypes: run.safetyViolationTypes,
    hintCount: run.hintCount,
    measurementInputs: summary.measurementInputs,
    calculationAnswers: summary.calculationAnswers,
    vehicleVerdict: summary.vehicleVerdict,
    judgmentAnswers: summary.judgmentAnswers,
    judgmentCorrect: summary.judgmentCorrect,
    npcInspectionResult: npc,
    npcInspectionCount: run.npcInspectionCount,
    clientAppVersion: session.clientAppVersion,
    calculatorLog: run.calculatorLog,
    calculatorLogTruncated: run.calculatorLogTruncated,
  })
}
