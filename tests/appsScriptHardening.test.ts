// Codex 0C 읽기 검토(2026-10-26) 지적 B1~B5·B8 — 수신점 강화
import { describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import legacyRecord from '../docs/design/examples/legacy/1.0.0/record.demo-aborted.json'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createTaskRun, attempt } from '../src/domain/taskEngine'
import { buildRecordPayload } from '../src/domain/record'
import { createDemoSession } from '../src/app/session'
import type { ApprovedTask } from '../src/domain/types'
import { loadGs, fakeUtilities } from './helpers/gs'
import { fakeSheetServices } from './helpers/gsServices'

const PROPS = { SHEET_ID: 'SHEET-TEST', TAB_NAME: 'canonical', ACCEPT_UNTIL: '2027-12-31T00:00:00Z', MAX_NEW_ROWS: '50', LOCK_WAIT_MS: '10000' }
const FILES = ['Jcs.gs', 'JsonStrict.gs', 'Validate.gs', 'Schemas.gs', 'DemoSnapshots.gs', 'Code.gs']
function server(opts: Parameters<typeof fakeSheetServices>[0] = {}) {
  const svc = fakeSheetServices({ props: PROPS, ...opts })
  const gs = loadGs(FILES, { ...svc, Utilities: { ...fakeUtilities, _n: 0 } })
  const post = (body: string) => JSON.parse(gs.doPost({ postData: { contents: body, type: 'text/plain;charset=UTF-8', length: body.length } }).text)
  return { gs, svc, post }
}
const reqOf = (p: unknown) => JSON.stringify({ protocolVersion: '1', payload: p })
const P = demo.payload
let n = 0
const aid = () => `30000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

describe('B1 __proto__ 키는 사라지지 않고 추가 필드로 거절된다', () => {
  test('parseJsonStrict는 __proto__를 자기 속성으로 보존하고 중복이면 DUPLICATE_KEY', () => {
    const { gs } = server()
    const o = gs.parseJsonStrict('{"a":1,"__proto__":{"x":1}}')
    expect(Object.prototype.hasOwnProperty.call(o, '__proto__')).toBe(true)
    expect(Object.keys(o)).toEqual(['a', '__proto__'])
    expect(() => gs.parseJsonStrict('{"__proto__":1,"__proto__":2}')).toThrow(/DUPLICATE_KEY/)
    expect(() => gs.parseJsonStrict('{"\\u005f_proto__":1,"__proto__":2}')).toThrow(/DUPLICATE_KEY/)
  })
  test('봉투·payload의 __proto__/constructor 키는 INVALID_PAYLOAD, 정본 증가 0', () => {
    const { svc, post } = server()
    const base = reqOf(P)
    const cases = [base.slice(0, -1) + ',"__proto__":{"x":1}}', base.replace('"payload":{', '"payload":{"__proto__":{"x":1},'), base.replace('"payload":{', '"payload":{"constructor":{"prototype":{}},')]
    for (const body of cases) expect(post(body), body.slice(-60)).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(svc.rows).toHaveLength(1)
  })
})

describe('B2 스냅샷에 묶인 문맥(코드·모드·시점·버전·승인)을 대조한다', () => {
  const mutations: Array<[string, (p: any) => void]> = [
    ['익명 코드가 fixture 패턴(D-00) 밖', (p) => { p.anonymousStudentCode = 'A-01' }],
    ['난이도 모드 바꿈', (p) => { p.difficultyMode = 'unguided' }],
    ['수업 시점 바꿈', (p) => { p.usagePhase = 'preview' }],
    ['표시 모드 바꿈', (p) => { p.displayMode = 'diagram'; p.experiencedDisplayModes = ['diagram'] }],
    ['규칙 버전 바꿈', (p) => { p.versions.rulesetVersion = 'unregistered' }],
    ['과제 승인 주장', (p) => { p.configurationApproval.taskApproved = true }],
    ['모르는 스냅샷', (p) => { p.sessionSnapshotId = '00000000-0000-4000-8000-0000000000ee' }],
    ['세션 코드 바꿈', (p) => { p.sessionCode = 'OTHER' }],
  ]
  for (const [name, mut] of mutations) {
    test(`${name} → SESSION_NOT_ALLOWED`, () => {
      const { svc, post } = server()
      const p = JSON.parse(JSON.stringify(P)); mut(p)
      expect(post(reqOf(p)), name).toMatchObject({ ok: false, code: 'SESSION_NOT_ALLOWED', retryable: false })
      expect(svc.rows).toHaveLength(1)
    })
  }
  test('앱이 만든 실제 세션(생성된 스냅샷)으로 만든 기록은 접수된다', () => {
    const task = lv1 as ApprovedTask
    const session = createDemoSession({ studentCode: 'A-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', vehicleEntryDirection: 'south', task, difficultyMode: 'guided' })
    let run = createTaskRun(task, { difficultyMode: 'guided', displayMode: 'threeD' })
    run = attempt(run, { type: 'step', stepId: 'ppe' }, aid()).run
    const payload = buildRecordPayload(run, session, { completedAtIso: new Date(run.startedAtMs + 5000).toISOString(), completionStatus: 'aborted' })
    const { svc, post } = server()
    const r = post(reqOf(payload))
    expect(r).toMatchObject({ ok: true, recordId: payload.recordId, duplicate: false })
    expect(svc.rows).toHaveLength(2)
    expect(session.configurationApproval.taskApproved).toBe(false) // 과제 전체 pending
  })
})

describe('B3 스키마 밖의 의미 검증', () => {
  const mutations: Array<[string, (p: any) => void]> = [
    ['완료 시각이 시작보다 이전', (p) => { p.completedAt = '1999-01-01T00:00:00Z' }],
    ['이벤트 sequence 건너뜀', (p) => { if (p.stepEvents[1]) p.stepEvents[1].sequence = 9 }],
    ['이벤트 eventId 중복', (p) => { if (p.stepEvents[1]) p.stepEvents[1].eventId = p.stepEvents[0].eventId }],
    ['errorCount와 errorTypes 합 불일치', (p) => { p.errorCount = 999 }],
    ['safetyViolationCount 불일치', (p) => { p.safetyViolationCount = 7; p.safetyViolationTypes = {} }],
    ['최초 입력 없이 최초 정오 true', (p) => { p.measurementInputs = [{ ...(p.measurementInputs[0] ?? { itemId: 'left', unit: 'kg', presentedValue: 240, finalInput: null, finalCorrect: null }), firstInput: null, firstCorrect: true }] }],
    ['경험 모드 첫 값이 displayMode와 다름', (p) => { p.experiencedDisplayModes = ['diagram', 'threeD'] }],
    ['활성 학습시간이 벽시계 경과보다 큼', (p) => { p.durationSeconds = 999999 }],
  ]
  for (const [name, mut] of mutations) {
    test(`${name} → INVALID_PAYLOAD`, () => {
      const { svc, post } = server()
      const p = JSON.parse(JSON.stringify(P)); mut(p)
      expect(post(reqOf(p)), name).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
      expect(svc.rows).toHaveLength(1)
    })
  }
  test('fixture 자체는 의미 검증을 통과한다', () => { expect(server().post(reqOf(P)).ok).toBe(true) })
})

describe('B4 접수 창·행 상한 설정은 fail-closed', () => {
  for (const [name, patch] of [['ACCEPT_UNTIL 날짜 아님', { ACCEPT_UNTIL: 'not-a-date' }], ['ACCEPT_UNTIL 누락', { ACCEPT_UNTIL: '' }], ['MAX_NEW_ROWS NaN', { MAX_NEW_ROWS: 'NaN' }], ['MAX_NEW_ROWS 0', { MAX_NEW_ROWS: '0' }], ['MAX_NEW_ROWS 누락', { MAX_NEW_ROWS: '' }]] as Array<[string, Record<string, string>]>) {
    test(`${name} → 신규 SESSION_NOT_ALLOWED, 기존 회수는 가능`, () => {
      const open = fakeSheetServices({ props: PROPS })
      const g1 = loadGs(FILES, { ...open, Utilities: { ...fakeUtilities, _n: 0 } })
      const first = JSON.parse(g1.doPost({ postData: { contents: reqOf(P), type: 'text/plain' } }).text)
      expect(first.ok).toBe(true)
      const bad = { ...open, PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => ({ ...PROPS, ...patch })[k] ?? null }) } }
      const g2 = loadGs(FILES, { ...bad, Utilities: { ...fakeUtilities, _n: 0 } })
      expect(JSON.parse(g2.doPost({ postData: { contents: reqOf(P), type: 'text/plain' } }).text)).toEqual({ ...first, duplicate: true })
      expect(JSON.parse(g2.doPost({ postData: { contents: reqOf({ ...P, recordId: '00000000-0000-4000-8000-000000000002' }), type: 'text/plain' } }).text)).toMatchObject({ ok: false, code: 'SESSION_NOT_ALLOWED' })
      expect(open.rows).toHaveLength(2)
    })
  }
})

describe('B5 손상된 정본 행은 CANONICAL_STORE_INVALID', () => {
  test('acceptedAt 손상·저장 payload가 null·recordId 불일치 각각', () => {
    const { svc, post } = server()
    post(reqOf(P))
    const good = [...svc.rows[1]!]
    svc.rows[1]![2] = 'INVALID'
    expect(post(reqOf(P))).toMatchObject({ ok: false, code: 'CANONICAL_STORE_INVALID' })
    svc.rows[1] = [...good]; svc.rows[1]![4] = 'null'; svc.rows[1]![3] = fakeUtilities.computeDigest('SHA_256', 'null').map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('')
    expect(post(reqOf(P))).toMatchObject({ ok: false, code: 'CANONICAL_STORE_INVALID' })
    svc.rows[1] = [...good]; svc.rows[1]![0] = '00000000-0000-4000-8000-0000000000bb'
    expect(post(reqOf({ ...P, recordId: '00000000-0000-4000-8000-0000000000bb' }))).toMatchObject({ ok: false, code: 'CANONICAL_STORE_INVALID' })
    expect(svc.rows).toHaveLength(2)
  })
})

describe('B8 record 1.0.0도 버전별 검증기로 받는다(허용 스냅샷일 때)', () => {
  test('legacy 1.0.0 예시 기록은 접수되고, 같은 ID 재전송은 duplicate', () => {
    const { svc, post } = server()
    const r = post(reqOf(legacyRecord))
    expect(r).toMatchObject({ ok: true, recordId: legacyRecord.recordId, duplicate: false })
    expect(post(reqOf(legacyRecord)).duplicate).toBe(true)
    expect(svc.rows).toHaveLength(2)
  })
})

describe('모의 강화: 잠금·receipt·연산 순서', () => {
  test('신규 접수마다 receipt가 다르고, 시트 읽기·쓰기·flush는 모두 잠금 안에서, 쓰기는 1회', () => {
    const { svc, post } = server()
    const a = post(reqOf(P)); const b = post(reqOf({ ...P, recordId: '00000000-0000-4000-8000-000000000002' }))
    expect(a.receiptId).not.toBe(b.receiptId)
    expect(svc.ops.filter((o) => o.endsWith('outside-lock'))).toEqual([])
    expect(svc.ops.filter((o) => o === 'write')).toHaveLength(2)
    expect(svc.lock.acquired).toBe(2); expect(svc.lock.released).toBe(2)
  })
  test('이벤트 200개는 수락, 201개는 스키마(maxItems)에서 INVALID_PAYLOAD', () => {
    const { post } = server()
    const ev = (i: number) => ({ eventId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, sequence: i + 1, elapsedMs: i, type: 'hintRequested' })
    const base = JSON.parse(JSON.stringify(P)); base.stepEvents = []; base.hintCount = 200
    expect(post(reqOf({ ...base, stepEvents: Array.from({ length: 200 }, (_, i) => ev(i)) })).ok).toBe(true)
    expect(post(reqOf({ ...base, recordId: '00000000-0000-4000-8000-000000000003', hintCount: 201, stepEvents: Array.from({ length: 201 }, (_, i) => ev(i)) }))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
})
