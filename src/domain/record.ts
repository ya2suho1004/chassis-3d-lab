// 기록 payload 생성 — docs/design/contracts/record.schema.json (1.0.0) 형식
// 원칙(04 §7~8, 05 §4): 확정 연구 내용(recordPayload)만 만든다. 저장·전송 상태(deliveryEnvelope)는 넣지 않는다.
// durationSeconds는 이벤트 경과시간(단조시계)에서 오며 completedAt−startedAt으로 계산하지 않는다.
// researchEligible은 승인 4종·runPurpose=research·completed·NPC passed가 모두 참일 때만 true다.
import { summarizeResponses } from './grading'
import type { DifficultyMode, StepEvent, TaskRun } from './taskEngine'

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
  configurationApproval: { taskApproved: boolean; rulesetApproved: boolean; layoutConfirmed: boolean; researchUseApproved: boolean }
  displayMode: 'threeD' | 'diagram'
  versions: { layoutVersion: string; judgeEngineVersion: string; sessionConfigVersion: string; researchProtocolVersion: string; feedbackPolicyVersion: string }
  clientAppVersion: string
  startedAtIso: string
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
  schemaVersion: '1.0.0'
  recordId: string
  anonymousStudentCode: string
  classConditionCode: string
  sessionCode: string
  sessionSnapshotId: string
  taskId: 'braking-force'
  difficultyMode: DifficultyMode
  attemptRole: SessionContext['attemptRole']
  retryOfRecordId: string | null
  retryCount: number
  runPurpose: 'demo' | 'research'
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
}

function lastInspection(run: TaskRun): 'passed' | 'needsCorrection' | 'notCompleted' {
  const ev = [...run.events].reverse().find((e) => e.type === 'npcInspected')
  if (!ev) return 'notCompleted'
  return ev.reasonCode === 'PASSED' ? 'passed' : 'needsCorrection'
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

  return {
    schemaVersion: '1.0.0',
    recordId: session.recordId,
    anonymousStudentCode: session.anonymousStudentCode,
    classConditionCode: session.classConditionCode,
    sessionCode: session.sessionCode,
    sessionSnapshotId: session.sessionSnapshotId,
    taskId: 'braking-force',
    difficultyMode: run.difficultyMode,
    attemptRole: session.attemptRole,
    retryOfRecordId: session.retryOfRecordId,
    retryCount: session.retryCount,
    runPurpose: session.runPurpose,
    researchEligible,
    configurationApproval: approvals,
    displayMode: session.displayMode,
    experiencedDisplayModes: fin.experiencedDisplayModes ?? [session.displayMode],
    completionStatus: fin.completionStatus,
    startedAt: session.startedAtIso,
    completedAt: fin.completedAtIso,
    durationSeconds,
    timing: { pauseCount: fin.pauseCount ?? run.pauseCount, resumeCount: fin.resumeCount ?? run.resumeCount, timeQuality: fin.timeQuality ?? run.timeQuality },
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
  }
}
