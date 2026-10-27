// Codex 회신 E(2026-10-27) 잔여: 윤초 경계 순서 비교(C-P2-3), 이관 사유 검증(C-P2-5), 중복 선언 정리(P3)
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import demo from '../docs/design/examples/submission.demo-request.json'
import { loadGs, fakeUtilities } from './helpers/gs'
import { fakeSheetServices } from './helpers/gsServices'
import { mergeLedger, idOf, SNAPSHOT_RULE_VERSION } from '../scripts/snapshotLib.mjs'

const PROPS = { SHEET_ID: 'SHEET-TEST', TAB_NAME: 'canonical', ACCEPT_UNTIL: '2027-12-31T00:00:00Z', MAX_NEW_ROWS: '50', LOCK_WAIT_MS: '10000' }
const FILES = ['Jcs.gs', 'JsonStrict.gs', 'Validate.gs', 'Schemas.gs', 'DemoSnapshots.gs', 'Code.gs']
function server() {
  const svc = fakeSheetServices({ props: PROPS })
  const gs = loadGs(FILES, { ...svc, Utilities: { ...fakeUtilities, _n: 0 } })
  const post = (body: string) => JSON.parse(gs.doPost({ postData: { contents: body, type: 'text/plain;charset=UTF-8', length: body.length } }).text)
  return { gs, svc, post }
}
const reqOf = (p: unknown) => JSON.stringify({ protocolVersion: '1', payload: p })
const P = demo.payload
let k = 0
const mk = (started: string, completed: string) => { const p: any = JSON.parse(JSON.stringify(P)); p.startedAt = started; p.completedAt = completed; p.durationSeconds = 0; p.recordId = `00000000-0000-4000-8000-0000000000${String(60 + ++k).padStart(2, '0')}`; return p }

describe('C-P2-3 윤초와 그 직후 일반 초의 순서', () => {
  test('23:59:60.900 → 00:00:00.100은 순방향(수락), 역순은 거절', () => {
    const { post } = server()
    expect(post(reqOf(mk('2016-12-31T23:59:60.900Z', '2017-01-01T00:00:00.100Z'))).ok).toBe(true)
    expect(post(reqOf(mk('2017-01-01T00:00:00.100Z', '2016-12-31T23:59:60.900Z')))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(post(reqOf(mk('2016-12-31T23:59:59.999Z', '2016-12-31T23:59:60.000Z'))).ok).toBe(true)
    expect(post(reqOf(mk('2016-12-31T23:59:60.000Z', '2016-12-31T23:59:59.999Z')))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
  test('0099→0100년 순방향 수락, 1ms 미만 역순 거절', () => {
    const { post } = server()
    expect(post(reqOf(mk('0099-12-31T23:59:59Z', '0100-01-01T00:00:00Z'))).ok).toBe(true)
    expect(post(reqOf(mk('2000-01-01T00:00:00.0005Z', '2000-01-01T00:00:00.0001Z')))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
  test('isValidDateTimeGeneral_는 한 번만 선언된다(P3)', () => {
    const src = readFileSync('server/apps-script/Validate.gs', 'utf8')
    expect((src.match(/^function isValidDateTimeGeneral_\(/gm) ?? []).length).toBe(1)
  })
})

describe('C-P2-5 명시 이관의 사유는 비어 있지 않은 문자열이어야 한다', () => {
  const body = { schemaVersion: '1.0.0', sessionCode: 'DEMO-ONLY', classConditionCode: 'DEMO', taskId: 'braking-force', runPurpose: 'demo', displayMode: 'threeD', difficultyMode: 'guided', usagePhase: 'preview', configurationApproval: { taskApproved: false, rulesetApproved: true, layoutConfirmed: false, researchUseApproved: false }, versions: { taskDefinitionVersion: 'T', rulesetVersion: 'R', measurementSetVersion: 'M', layoutVersion: 'L', judgeEngineVersion: 'J', sessionConfigVersion: 'S', researchProtocolVersion: 'unapproved', feedbackPolicyVersion: 'F' }, sessionConfiguration: { vehicleEntryDirection: null } }
  const { schemaVersion, ...rest } = body
  const a = { schemaVersion, sessionSnapshotId: idOf(body), ...rest }
  const old = () => ({ ruleVersion: SNAPSHOT_RULE_VERSION, entries: [{ snapshot: a, allowedStepIds: ['ppe'], status: 'active' as const, firstGeneratedOn: 'x', retiredOn: null } as any] })
  const cur = [{ snapshot: a, allowedStepIds: ['ppe'], stepPrerequisites: { ppe: [] } }]
  test('누락·빈 문자열·공백·숫자 사유는 LEDGER_SCOPE_UPGRADE_REASON', () => {
    for (const reason of [undefined, '', '   ', 42 as unknown as string]) {
      expect(() => mergeLedger(old(), cur, '2026-10-27', [], { scopeUpgrade: { reason: reason as string, fields: ['stepPrerequisites'] } }), String(reason)).toThrow(/LEDGER_SCOPE_UPGRADE_REASON/)
    }
    const ok = mergeLedger(old(), cur, '2026-10-27', [], { scopeUpgrade: { reason: '  개발 세트, 접수 없음  ', fields: ['stepPrerequisites'] } })
    expect(ok.migrations?.[0]?.reason).toBe('개발 세트, 접수 없음')
  })
})
