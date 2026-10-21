// CSV 내보내기 — 요약 행(recordId당 1행). 04 §10: 원 필드명·버전 보존, UTF-8, 고정 헤더, 수식 실행 방지.
import type { RecordPayload } from '../domain/record'
import type { DeliveryEnvelope } from './types'

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v)
  if (/^[=+\-@]/.test(s)) s = `'${s}` // 스프레드시트 수식 실행 방지
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

const COLUMNS: Array<[string, (p: RecordPayload, e: DeliveryEnvelope) => unknown]> = [
  ['recordId', (p) => p.recordId], ['schemaVersion', (p) => p.schemaVersion], ['anonymousStudentCode', (p) => p.anonymousStudentCode],
  ['classConditionCode', (p) => p.classConditionCode], ['sessionCode', (p) => p.sessionCode], ['sessionSnapshotId', (p) => p.sessionSnapshotId],
  ['taskId', (p) => p.taskId], ['difficultyMode', (p) => p.difficultyMode], ['attemptRole', (p) => p.attemptRole], ['runPurpose', (p) => p.runPurpose],
  ['researchEligible', (p) => p.researchEligible], ['completionStatus', (p) => p.completionStatus], ['retryOfRecordId', (p) => p.retryOfRecordId], ['retryCount', (p) => p.retryCount],
  ['displayMode', (p) => p.displayMode], ['experiencedDisplayModes', (p) => p.experiencedDisplayModes.join('|')],
  ['startedAt', (p) => p.startedAt], ['completedAt', (p) => p.completedAt], ['durationSeconds', (p) => p.durationSeconds],
  ['pauseCount', (p) => p.timing.pauseCount], ['resumeCount', (p) => p.timing.resumeCount], ['timeQuality', (p) => p.timing.timeQuality],
  ['taskDefinitionVersion', (p) => p.versions.taskDefinitionVersion], ['rulesetVersion', (p) => p.versions.rulesetVersion], ['measurementSetVersion', (p) => p.versions.measurementSetVersion],
  ['layoutVersion', (p) => p.versions.layoutVersion], ['judgeEngineVersion', (p) => p.versions.judgeEngineVersion], ['sessionConfigVersion', (p) => p.versions.sessionConfigVersion],
  ['researchProtocolVersion', (p) => p.versions.researchProtocolVersion], ['feedbackPolicyVersion', (p) => p.versions.feedbackPolicyVersion],
  ['errorCount', (p) => p.errorCount], ['errorTypes', (p) => Object.entries(p.errorTypes).map(([k, v]) => `${k}:${v}`).join('|')],
  ['safetyViolationCount', (p) => p.safetyViolationCount], ['safetyViolationTypes', (p) => Object.entries(p.safetyViolationTypes).map(([k, v]) => `${k}:${v}`).join('|')],
  ['hintCount', (p) => p.hintCount], ['vehicleVerdict', (p) => p.vehicleVerdict], ['judgmentCorrect', (p) => p.judgmentCorrect],
  ['firstCorrectCount', (p) => [...p.measurementInputs, ...p.calculationAnswers, ...p.judgmentAnswers].filter((i) => i.firstCorrect === true).length],
  ['finalCorrectCount', (p) => [...p.measurementInputs, ...p.calculationAnswers, ...p.judgmentAnswers].filter((i) => i.finalCorrect === true).length],
  ['requiredCount', (p) => p.measurementInputs.length + p.calculationAnswers.length + p.judgmentAnswers.length],
  ['unansweredFirstCount', (p) => [...p.measurementInputs, ...p.calculationAnswers, ...p.judgmentAnswers].filter((i) => i.firstCorrect === null).length],
  ['npcInspectionResult', (p) => p.npcInspectionResult], ['npcInspectionCount', (p) => p.npcInspectionCount], ['eventCount', (p) => p.stepEvents.length],
  ['clientAppVersion', (p) => p.clientAppVersion],
  ['localSaveStatus', (_p, e) => e.localSaveStatus], ['uploadStatus', (_p, e) => e.uploadStatus], ['uploadedAt', (_p, e) => e.uploadedAt], ['receiptId', (_p, e) => e.receiptId], ['payloadHash', (_p, e) => e.payloadHash],
]

export const SUMMARY_CSV_HEADER = COLUMNS.map(([k]) => k)

export function toSummaryCsv(rows: Array<{ payload: RecordPayload; envelope: DeliveryEnvelope }>): string {
  const lines = [SUMMARY_CSV_HEADER.join(',')]
  for (const { payload, envelope } of rows) lines.push(COLUMNS.map(([, f]) => csvCell(f(payload, envelope))).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}
