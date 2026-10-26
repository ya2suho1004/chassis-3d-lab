// Codex 회신 C-P2-4·5: 원장 병합은 중복 ID·같은 ID의 내용/검증 범위 차이를 실패시킨다
import { describe, expect, test } from 'vitest'
import { mergeLedger, idOf, canonical, SNAPSHOT_RULE_VERSION } from '../scripts/snapshotLib.mjs'

const snap = (over: Record<string, unknown> = {}) => {
  const body = { schemaVersion: '1.0.0', sessionCode: 'DEMO-ONLY', classConditionCode: 'DEMO', taskId: 'braking-force', runPurpose: 'demo', displayMode: 'threeD', difficultyMode: 'guided', usagePhase: 'preview', configurationApproval: { taskApproved: false, rulesetApproved: true, layoutConfirmed: false, researchUseApproved: false }, versions: { taskDefinitionVersion: 'T', rulesetVersion: 'R', measurementSetVersion: 'M', layoutVersion: 'L', judgeEngineVersion: 'J', sessionConfigVersion: 'S', researchProtocolVersion: 'unapproved', feedbackPolicyVersion: 'F' }, sessionConfiguration: { vehicleEntryDirection: null }, ...over }
  const { schemaVersion, ...rest } = body
  return { schemaVersion, sessionSnapshotId: idOf(body), ...rest }
}
const scope = { allowedStepIds: ['ppe', 'off', 'off:motorOff'], stepPrerequisites: { ppe: [], off: ['ppe'] } }
const cur = (s: ReturnType<typeof snap>) => ({ snapshot: s, ...scope })
const empty = () => ({ ruleVersion: SNAPSHOT_RULE_VERSION, entries: [] as any[] })

describe('스냅샷 원장 병합', () => {
  test('새 항목은 active로 추가되고, 현재 목록에서 빠진 항목은 retired로 남는다(삭제 없음)', () => {
    const a = snap(); const b = snap({ difficultyMode: 'unguided' })
    const l1 = mergeLedger(empty(), [cur(a), cur(b)], '2026-10-26')
    expect(l1.entries.map((e: any) => e.status)).toEqual(['active', 'active'])
    const l2 = mergeLedger(l1, [cur(a)], '2026-10-27')
    const eb = l2.entries.find((e: any) => e.snapshot.sessionSnapshotId === b.sessionSnapshotId)!
    expect(eb.status).toBe('retired'); expect(eb.retiredOn).toBe('2026-10-27'); expect(eb.firstGeneratedOn).toBe('2026-10-26')
    expect(l2.entries.find((e: any) => e.snapshot.sessionSnapshotId === a.sessionSnapshotId)!.firstGeneratedOn).toBe('2026-10-26')
  })
  test('원장 안 중복 ID는 병합 전에 실패한다(앞 항목이 조용히 사라지지 않음)', () => {
    const a = snap()
    const l = { ruleVersion: SNAPSHOT_RULE_VERSION, entries: [{ snapshot: { ...a, displayMode: 'diagram' }, ...scope, status: 'active' as const, firstGeneratedOn: 'x', retiredOn: null }, { snapshot: a, ...scope, status: 'active' as const, firstGeneratedOn: 'x', retiredOn: null }] }
    expect(() => mergeLedger(l, [cur(a)], '2026-10-27')).toThrow(/LEDGER_DUPLICATE_ID/)
  })
  test('같은 ID에 다른 내용 또는 다른 검증 범위(allowedStepIds·stepPrerequisites)는 실패한다', () => {
    const a = snap()
    const l = mergeLedger(empty(), [cur(a)], '2026-10-26')
    expect(() => mergeLedger(l, [{ snapshot: { ...a, displayMode: 'diagram' }, ...scope }], '2026-10-27')).toThrow(/LEDGER_CONTENT_MISMATCH/)
    expect(() => mergeLedger(l, [{ snapshot: a, allowedStepIds: ['ppe'], stepPrerequisites: scope.stepPrerequisites }], '2026-10-27')).toThrow(/LEDGER_SCOPE_MISMATCH/)
    expect(() => mergeLedger(l, [{ snapshot: a, allowedStepIds: scope.allowedStepIds, stepPrerequisites: { ppe: [], off: [] } }], '2026-10-27')).toThrow(/LEDGER_SCOPE_MISMATCH/)
  })
  test('예약 ID(fixture)와 겹치면 실패하고, 현재 목록 안 ID 충돌도 실패한다', () => {
    const a = snap()
    expect(() => mergeLedger(empty(), [cur(a)], '2026-10-27', [a.sessionSnapshotId])).toThrow(/RESERVED_ID/)
    expect(() => mergeLedger(empty(), [cur(a), { snapshot: { ...a, displayMode: 'diagram' }, ...scope }], '2026-10-27')).toThrow(/CURRENT_DUPLICATE_ID/)
  })
  test('정규형·ID 규칙 벡터 고정(규칙 v1)', () => {
    expect(canonical({ b: [1, { d: null, c: 'x' }], a: 'ê' })).toBe('{"a":"ê","b":[1,{"c":"x","d":null}]}')
    expect(idOf({ x: 1 })).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(idOf({ x: 1 })).toBe(idOf({ x: 1 }))
  })
})
