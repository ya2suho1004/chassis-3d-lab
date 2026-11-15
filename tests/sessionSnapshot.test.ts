// P-7 세션 스냅샷(docs/design/contracts/session.snapshot.schema.json 1.0.0, docs/17 §4)
import { describe, expect, test } from 'vitest'
import Ajv from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import schema from '../docs/design/contracts/session.snapshot.schema.json'
import recordSchema from '../docs/design/contracts/record.schema.json'
import snapshots from '../src/data/session/demo-snapshots.json'
import ledger from '../src/data/session/snapshot-ledger.json'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import lv2 from '../src/data/tasks/task.braking-force.case-lv2.json'
import { createDemoSession } from '../src/app/session'
import type { ApprovedTask } from '../src/domain/types'
import { loadGs, fakeUtilities } from './helpers/gs'

describe('시연 스냅샷 목록', () => {
  test('모든 스냅샷이 계약을 통과하고 ID가 유일하다(156 = 시연 72[과제2×사례2×모드2×시점3×방향3] + 리허설 48[사례4×방향3×(L12 1+L5 1+사용성 모드2)] + 수업용 36[사례4×방향3×(L12 모드2+L5 1)])', () => {
    const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv); ajv.addSchema(recordSchema as object)
    const v = ajv.compile(schema as object)
    for (const s of snapshots) expect(v(s), JSON.stringify(v.errors?.slice(0, 2))).toBe(true)
    expect(snapshots).toHaveLength(156)
    expect(new Set(snapshots.map((s) => s.sessionSnapshotId)).size).toBe(156)
    expect(snapshots.filter((s) => s.sessionCode === 'DEMO-ONLY')).toHaveLength(72)
    expect(snapshots.filter((s) => s.sessionCode === 'DEMO-ONLY' && s.taskId === 'min-turning-radius')).toHaveLength(36)
    expect(snapshots.filter((s) => s.sessionCode === 'CLS-L12')).toHaveLength(24)
    expect(snapshots.filter((s) => s.sessionCode === 'CLS-L5')).toHaveLength(12)
    expect(snapshots.filter((s) => s.sessionCode.startsWith('CLS-')).every((s) => s.classConditionCode === 'CLS')).toBe(true)
    expect(snapshots.every((s) => s.configurationApproval.taskApproved === false && s.configurationApproval.rulesetApproved === true && s.runPurpose === 'demo')).toBe(true)
  })
  test('수신점 허용 목록(DemoSnapshots.gs)은 앱 스냅샷 156개와 fixture 1개를 담는다', () => {
    const gs = loadGs(['DemoSnapshots.gs'], { Utilities: fakeUtilities })
    const ids = Object.keys(gs.ALLOWED_SNAPSHOTS)
    expect(ids).toHaveLength(157)
    for (const s of snapshots) expect(gs.ALLOWED_SNAPSHOTS[s.sessionSnapshotId].snapshot).toEqual(s)
  })
  test('허용 코드 형식은 세션 종류별: 수업용은 학번 네 자리, 시연·리허설은 D-두 자리(설계 2026-11-15 §3-2)', () => {
    const gs = loadGs(['DemoSnapshots.gs'], { Utilities: fakeUtilities })
    for (const s of snapshots) {
      const want = s.sessionCode.startsWith('CLS-') ? '^[1-3][1-9](0[1-9]|[1-9][0-9])$' : '^D-[0-9]{2}$'
      expect(gs.ALLOWED_SNAPSHOTS[s.sessionSnapshotId].anonymousCodePattern, s.sessionCode).toBe(want)
    }
  })
  test('원장은 덧붙이기만: 수업용 이전 120개 항목은 그대로 활성이고 앞자리를 지킨다', () => {
    const before = ledger.entries.slice(0, 120)
    expect(before.every((e) => !e.snapshot.sessionCode.startsWith('CLS-') && e.status === 'active')).toBe(true)
    expect(ledger.entries.slice(120).map((e) => e.snapshot.sessionCode).every((c) => c.startsWith('CLS-'))).toBe(true)
    expect(ledger.entries).toHaveLength(156)
  })
})

describe('createDemoSession은 선택(사례·모드·시점·방향)에 맞는 불변 스냅샷을 고정한다', () => {
  test('스냅샷 ID·versions·승인이 목록의 값과 같고, 다른 선택은 다른 ID', () => {
    const a = createDemoSession({ studentCode: 'A-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', vehicleEntryDirection: null, task: lv1 as ApprovedTask, difficultyMode: 'guided' })
    const snap = snapshots.find((s) => s.sessionSnapshotId === a.sessionSnapshotId)!
    expect(snap).toBeTruthy()
    expect(snap.versions.taskDefinitionVersion).toBe(lv1.taskDefinitionVersion); expect(snap.difficultyMode).toBe('guided'); expect(snap.usagePhase).toBe('preview'); expect(snap.sessionConfiguration.vehicleEntryDirection).toBeNull()
    expect(a.versions).toEqual({ layoutVersion: snap.versions.layoutVersion, judgeEngineVersion: snap.versions.judgeEngineVersion, sessionConfigVersion: snap.versions.sessionConfigVersion, researchProtocolVersion: snap.versions.researchProtocolVersion, feedbackPolicyVersion: snap.versions.feedbackPolicyVersion })
    expect(a.configurationApproval).toEqual(snap.configurationApproval)
    const b = createDemoSession({ studentCode: 'A-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', vehicleEntryDirection: 'north', task: lv1 as ApprovedTask, difficultyMode: 'guided' })
    const c = createDemoSession({ studentCode: 'A-01', sessionCode: 'DEMO-ONLY', attemptRole: 'primary', usagePhase: 'preview', vehicleEntryDirection: null, task: lv2 as ApprovedTask, difficultyMode: 'unguided' })
    expect(b.sessionSnapshotId).not.toBe(a.sessionSnapshotId); expect(c.sessionSnapshotId).not.toBe(a.sessionSnapshotId)
  })
  test('목록에 없는 조합(다른 세션 코드)은 만들 수 없다', () => {
    expect(() => createDemoSession({ studentCode: 'A-01', sessionCode: 'REAL-CLASS', attemptRole: 'practice', usagePhase: 'preview', task: lv1 as ApprovedTask, difficultyMode: 'guided' })).toThrow(/SNAPSHOT_NOT_FOUND/)
  })
})
