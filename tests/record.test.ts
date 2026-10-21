import { describe, expect, test } from 'vitest'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import recordSchema from '../docs/design/contracts/record.schema.json'
import lv2 from '../src/data/tasks/task.braking-force.case-lv2.json'
import { createTaskRun, attempt, submitResponse } from '../src/domain/taskEngine'
import { inspectPerformance } from '../src/domain/npcInspection'
import { buildRecordPayload, type SessionContext } from '../src/domain/record'
import type { ApprovedTask } from '../src/domain/types'

const task = lv2 as ApprovedTask
let n = 0
const aid = () => `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}` // actionId는 계약상 UUID
let clock = 1_000_000
const deps = { now: () => (clock += 1500), newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }

const demoSession: SessionContext = {
  recordId: '00000000-0000-4000-8000-aaaaaaaaaaaa',
  anonymousStudentCode: 'D-00',
  classConditionCode: 'DEMO',
  sessionCode: 'DEMO-ONLY',
  sessionSnapshotId: '00000000-0000-4000-8000-bbbbbbbbbbbb',
  attemptRole: 'practice',
  retryOfRecordId: null,
  retryCount: 0,
  runPurpose: 'demo',
  usagePhase: 'preview',
  configurationApproval: { taskApproved: true, rulesetApproved: true, layoutConfirmed: false, researchUseApproved: false },
  displayMode: 'threeD',
  versions: { layoutVersion: 'surveyed-partial-2026-10-21', judgeEngineVersion: '0.1.0', sessionConfigVersion: 'unapproved', researchProtocolVersion: 'unapproved', feedbackPolicyVersion: 'unapproved' },
  clientAppVersion: '0.1.0-dev',
  startedAtIso: '2026-10-21T13:00:00Z',
}

function fullRun() {
  let s = createTaskRun(task, { difficultyMode: 'unguided' }, deps)
  for (const id of ['ppe', 'tire', 'equip', 'enter']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = submitResponse(s, 'axleWeight', '600', aid()).run
  for (const id of ['axle', 'mode']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = attempt(s, { type: 'confirmSafety', conditionId: 's-lift' }, aid()).run
  for (const id of ['lower', 'motor', 'press']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = submitResponse(s, 'left', '250', aid()).run
  s = submitResponse(s, 'right', '190', aid()).run
  for (const id of ['read', 'off']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  s = submitResponse(s, 'deviation', '10.0', aid()).run
  s = submitResponse(s, 'sum', '73.3', aid()).run
  s = submitResponse(s, 'vehicleCondition', 'pass', aid()).run // 최초 오답
  s = submitResponse(s, 'vehicleCondition', 'fail', aid()).run // 보완
  s = attempt(s, { type: 'step', stepId: 'calc' }, aid()).run
  return inspectPerformance(s).run
}

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(recordSchema)

describe('기록 payload — 계약 1.1.0 형식', () => {
  test('완료 수행은 record.schema.json(1.1.0) 검사를 통과하고 usagePhase를 담는다', () => {
    const payload = buildRecordPayload(fullRun(), demoSession, { completedAtIso: '2026-10-21T13:10:00Z', completionStatus: 'completed' })
    expect(payload.schemaVersion).toBe('1.1.0')
    expect(payload.usagePhase).toBe('preview')
    const ok = validate(payload)
    expect(validate.errors ?? []).toEqual([])
    expect(ok).toBe(true)
  })

  test('연구 내용에 전송 상태 필드를 섞지 않는다', () => {
    const payload = buildRecordPayload(fullRun(), demoSession, { completedAtIso: '2026-10-21T13:10:00Z', completionStatus: 'completed' }) as unknown as Record<string, unknown>
    for (const k of ['localSaveStatus', 'uploadStatus', 'uploadedAt', 'receiptId', 'payloadHash']) expect(k in payload).toBe(false)
  })

  test('차량 판정 fail, 최초 판정 오답(false), NPC passed, 오류 1(verdict)이 함께 성립한다', () => {
    const p = buildRecordPayload(fullRun(), demoSession, { completedAtIso: '2026-10-21T13:10:00Z', completionStatus: 'completed' })
    expect(p.vehicleVerdict).toBe('fail')
    expect(p.judgmentCorrect).toBe(false)
    expect(p.npcInspectionResult).toBe('passed')
    expect(p.errorCount).toBe(1)
    expect(p.errorTypes).toEqual({ verdict: 1 })
    expect(p.safetyViolationCount).toBe(0)
  })

  test('demo 수행은 researchEligible=false이며 runPurpose=research가 아니다', () => {
    const p = buildRecordPayload(fullRun(), demoSession, { completedAtIso: '2026-10-21T13:10:00Z', completionStatus: 'completed' })
    expect(p.runPurpose).toBe('demo')
    expect(p.researchEligible).toBe(false)
  })

  test('활성 학습시간은 이벤트 경과시간(단조시계)에서 오고 벽시계 차로 계산하지 않는다', () => {
    const run = fullRun()
    const p = buildRecordPayload(run, demoSession, { completedAtIso: '2026-10-21T13:10:00Z', completionStatus: 'completed' })
    expect(p.durationSeconds).toBe(Math.round(run.events.at(-1)!.elapsedMs / 1000))
    expect(p.timing.timeQuality).toBe('continuous')
  })

  test('중단(aborted) 기록은 completed 조건 없이도 형식 검사를 통과한다', () => {
    const s = createTaskRun(task, { difficultyMode: 'guided' }, deps)
    const p = buildRecordPayload(s, demoSession, { completedAtIso: '2026-10-21T13:01:00Z', completionStatus: 'aborted' })
    expect(validate(p)).toBe(true)
    expect(p.npcInspectionResult).toBe('notCompleted')
  })

  test('연구 적격은 승인 4종·research·completed·passed가 모두 참일 때만 true', () => {
    const researchSession: SessionContext = { ...demoSession, runPurpose: 'research', configurationApproval: { taskApproved: true, rulesetApproved: true, layoutConfirmed: true, researchUseApproved: true } }
    const p = buildRecordPayload(fullRun(), researchSession, { completedAtIso: '2026-10-21T13:10:00Z', completionStatus: 'completed' })
    expect(p.researchEligible).toBe(true)
    expect(validate(p)).toBe(true)
    const notYet: SessionContext = { ...researchSession, configurationApproval: { ...researchSession.configurationApproval, layoutConfirmed: false } }
    expect(() => buildRecordPayload(fullRun(), notYet, { completedAtIso: '2026-10-21T13:10:00Z', completionStatus: 'completed' })).toThrow(/research/)
  })
})
