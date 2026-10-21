import { describe, expect, test } from 'vitest'
import { toSummaryCsv, csvCell } from '../src/records/csv'
import type { RecordPayload } from '../src/domain/record'
import type { DeliveryEnvelope } from '../src/records/types'

const payload = {
  schemaVersion: '1.1.0', recordId: '00000000-0000-4000-8000-000000000001', anonymousStudentCode: 'A-01', classConditionCode: 'DEMO', sessionCode: 'DEMO-ONLY',
  sessionSnapshotId: '00000000-0000-4000-8000-000000000002', taskId: 'braking-force', difficultyMode: 'guided', attemptRole: 'practice', retryOfRecordId: null, retryCount: 0,
  runPurpose: 'demo', usagePhase: 'review', researchEligible: false, configurationApproval: { taskApproved: true, rulesetApproved: true, layoutConfirmed: false, researchUseApproved: false },
  displayMode: 'diagram', experiencedDisplayModes: ['diagram'], completionStatus: 'completed', startedAt: '2026-10-21T13:00:00Z', completedAt: '2026-10-21T13:10:00Z', durationSeconds: 67,
  timing: { pauseCount: 0, resumeCount: 0, timeQuality: 'continuous' },
  versions: { taskDefinitionVersion: '1.0.0-teacher-2026-10-21', rulesetVersion: '1.0.0-teacher-2026-10-21', measurementSetVersion: '1.0.0-teacher-2026-10-21', layoutVersion: 'surveyed-partial', judgeEngineVersion: '0.1.0', sessionConfigVersion: 'unapproved', researchProtocolVersion: 'unapproved', feedbackPolicyVersion: 'unapproved' },
  stepEvents: [], errorCount: 1, errorTypes: { calc: 1 }, safetyViolationCount: 1, safetyViolationTypes: { 's-ppe': 1 }, hintCount: 0,
  measurementInputs: [{ itemId: 'left', unit: 'kg', presentedValue: 240, firstInput: '240', firstCorrect: true, finalInput: '240', finalCorrect: true }],
  calculationAnswers: [{ itemId: 'deviation', unit: '%', computedReferenceValue: 6.6, firstInput: '6.7', firstCorrect: false, finalInput: '6.6', finalCorrect: true }],
  vehicleVerdict: 'pass', judgmentAnswers: [{ itemId: 'vehicleCondition', firstAnswer: 'pass', firstCorrect: true, finalAnswer: 'pass', finalCorrect: true }],
  judgmentCorrect: true, npcInspectionResult: 'passed', npcInspectionCount: 1, clientAppVersion: '0.2.0-demo',
} as unknown as RecordPayload

const envelope: DeliveryEnvelope = { recordId: payload.recordId, localSaveStatus: 'saved', uploadStatus: 'pending', uploadedAt: null, receiptId: null, payloadHash: null, uploadAttemptCount: 0, lastErrorCode: null, nextRetryAt: null }

describe('CSV — 요약 행', () => {
  test('헤더가 고정되고 recordId·버전·연구 내용·접수 상태가 한 행에 들어간다', () => {
    const csv = toSummaryCsv([{ payload, envelope }])
    const [header, row] = csv.replace('\ufeff', '').split('\r\n')
    expect(header!.startsWith('recordId,schemaVersion,anonymousStudentCode,classConditionCode,sessionCode,sessionSnapshotId,taskId,difficultyMode,attemptRole,runPurpose,usagePhase,researchEligible,completionStatus')).toBe(true)
    expect(header).toContain('judgmentCorrect')
    expect(header).toContain('usagePhase')
    expect(row).toContain(',review,')
    expect(header).toContain('uploadStatus')
    expect(row).toContain('00000000-0000-4000-8000-000000000001')
    expect(row).toContain('calc:1')
    expect(row).toContain('s-ppe:1')
    expect(row).toContain(',pending,')
  })

  test('미응답 null은 빈 칸으로 남고 0이나 false로 바뀌지 않는다', () => {
    const p2 = { ...payload, judgmentCorrect: null, vehicleVerdict: null } as RecordPayload
    const csv = toSummaryCsv([{ payload: p2, envelope }])
    const header = csv.split('\r\n')[0]!.split(',')
    const row = csv.split('\r\n')[1]!.split(',')
    expect(row[header.indexOf('judgmentCorrect')]).toBe('')
    expect(row[header.indexOf('vehicleVerdict')]).toBe('')
  })

  test('쉼표·따옴표·개행은 이스케이프되고 수식으로 시작하는 값은 작은따옴표로 막는다', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('x\ny')).toBe('"x\ny"')
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-5')).toBe("'-5")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell(6.6)).toBe('6.6')
    expect(csvCell(null)).toBe('')
  })

  test('UTF-8 BOM으로 시작해 엑셀에서 한글이 깨지지 않게 한다', () => {
    expect(toSummaryCsv([]).charCodeAt(0)).toBe(0xfeff)
  })
})
