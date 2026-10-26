// 시연용 세션 스냅샷 목록 생성 — 계약 docs/design/contracts/session.snapshot.schema.json(1.0.0), docs/17 §4, Codex 회신 B §2
// 원장 src/data/session/snapshot-ledger.json 은 append-only: 한 번 생성된 스냅샷은 지우지 않고 status(active|retired)만 바꾼다.
//  - 앱(src/data/session/demo-snapshots.json)은 active 목록만 쓴다(새 세션을 만들 수 있는 조합).
//  - 수신점(server/apps-script/DemoSnapshots.gs)은 원장 전체 + 합성 fixture를 가진다. retired는 기존 receipt 회수만 허용(신규 접수 불가).
// ID = 스냅샷 내용(ID 제외)의 정규형 SHA-256 → UUID v4 모양(해시 120비트 사용). 규칙 버전 SNAPSHOT_RULE_VERSION. 같은 ID에 다른 내용이면 실패.
// 주의: ID는 '버전 참조'에서 나온다. 과제·피드백 본문이 바뀌면 docs/17 §1대로 그 버전을 올려야 ID가 바뀐다(본문만 바꾸면 검출되지 않음).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export const SNAPSHOT_RULE_VERSION = '1'
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const tasks = [read('../src/data/tasks/task.braking-force.case-lv1.json'), read('../src/data/tasks/task.braking-force.case-lv2.json')]
const fixture = read('../docs/design/examples/submission.demo-request.json').payload
const LEDGER_URL = new URL('../src/data/session/snapshot-ledger.json', import.meta.url)
const TODAY = process.env.SNAPSHOT_DATE ?? new Date().toISOString().slice(0, 10)

const COMMON = { schemaVersion: '1.0.0', sessionCode: 'DEMO-ONLY', classConditionCode: 'DEMO', taskId: 'braking-force', runPurpose: 'demo', displayMode: 'threeD' }
const APPROVAL = { taskApproved: false, rulesetApproved: true, layoutConfirmed: false, researchUseApproved: false } // 과제 전체 pending(U1 보류), 규칙 승인(0A)
const FEEDBACK_POLICY_VERSION = '1.1.0-design-approved-2026-10-26'
const SESSION_VERSIONS = { layoutVersion: 'dev-provisional-2026-10-26', judgeEngineVersion: '0.1.0', sessionConfigVersion: '1.2.0-design-2026-10-26', researchProtocolVersion: 'unapproved', feedbackPolicyVersion: FEEDBACK_POLICY_VERSION }
/** 시험 배포의 코드 범위: 합성 D-xx만(설계 15 §2). 운영 배포는 별도 목록으로. */
const TEST_CODE_PATTERN = '^D-[0-9]{2}$'
const OFF_SUBSTEPS = ['motorOff', 'liftUp', 'exitVehicle']

export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
}
export function idOf(snapshotWithoutId) {
  const h = createHash('sha256').update(canonical(snapshotWithoutId), 'utf8').digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

for (const t of tasks) if (t.feedbackPolicy?.version !== FEEDBACK_POLICY_VERSION) throw new Error(`feedbackPolicy.version 불일치: ${t.taskDefinitionVersion} has ${t.feedbackPolicy?.version}, generator expects ${FEEDBACK_POLICY_VERSION}`)

const current = new Map() // id → { snapshot, allowedStepIds }
for (const t of tasks) for (const difficultyMode of ['guided', 'unguided']) for (const usagePhase of ['preview', 'review', 'other']) for (const vehicleEntryDirection of [null, 'north', 'south']) {
  const body = { ...COMMON, difficultyMode, usagePhase, configurationApproval: APPROVAL, versions: { taskDefinitionVersion: t.taskDefinitionVersion, rulesetVersion: t.ruleset.rulesetVersion, measurementSetVersion: t.measurement.measurementSetVersion, ...SESSION_VERSIONS }, sessionConfiguration: { vehicleEntryDirection } }
  const { schemaVersion, ...rest } = body
  const id = idOf(body)
  const snapshot = { schemaVersion, sessionSnapshotId: id, ...rest }
  if (current.has(id) && canonical(current.get(id).snapshot) !== canonical(snapshot)) throw new Error(`스냅샷 ID 충돌: ${id}`)
  current.set(id, { snapshot, allowedStepIds: [...t.steps.map((s) => s.stepId), ...OFF_SUBSTEPS.map((a) => `off:${a}`)] })
}

// 원장 병합(append-only)
const ledger = existsSync(LEDGER_URL) ? JSON.parse(readFileSync(LEDGER_URL, 'utf8')) : { ruleVersion: SNAPSHOT_RULE_VERSION, entries: [] }
if (ledger.ruleVersion !== SNAPSHOT_RULE_VERSION) throw new Error('원장 규칙 버전이 다름 — 수동 이관 필요')
const byId = new Map(ledger.entries.map((e) => [e.snapshot.sessionSnapshotId, e]))
for (const [id, cur] of current) {
  const prev = byId.get(id)
  if (prev && canonical(prev.snapshot) !== canonical(cur.snapshot)) throw new Error(`원장의 같은 ID에 다른 내용: ${id}`)
  byId.set(id, { snapshot: cur.snapshot, allowedStepIds: cur.allowedStepIds, status: 'active', firstGeneratedOn: prev?.firstGeneratedOn ?? TODAY, retiredOn: null })
}
for (const [id, e] of byId) if (!current.has(id) && e.status !== 'retired') byId.set(id, { ...e, status: 'retired', retiredOn: TODAY })
ledger.entries = [...byId.values()]
writeFileSync(LEDGER_URL, JSON.stringify(ledger, null, 2) + '\n')
writeFileSync(new URL('../src/data/session/demo-snapshots.json', import.meta.url), JSON.stringify(ledger.entries.filter((e) => e.status === 'active').map((e) => e.snapshot), null, 2) + '\n')

// 수신점 허용 목록: 원장 전체(상태 포함) + Codex 합성 fixture
const server = {}
for (const e of ledger.entries) server[e.snapshot.sessionSnapshotId] = { snapshot: e.snapshot, status: e.status, anonymousCodePattern: TEST_CODE_PATTERN, allowedStepIds: e.allowedStepIds }
server[fixture.sessionSnapshotId] = {
  snapshot: { schemaVersion: '1.0.0', sessionSnapshotId: fixture.sessionSnapshotId, sessionCode: fixture.sessionCode, classConditionCode: fixture.classConditionCode, taskId: fixture.taskId, difficultyMode: fixture.difficultyMode, usagePhase: fixture.usagePhase, runPurpose: fixture.runPurpose, displayMode: fixture.displayMode, configurationApproval: fixture.configurationApproval, versions: fixture.versions, sessionConfiguration: { vehicleEntryDirection: null } },
  status: 'active', anonymousCodePattern: '^D-00$', allowedStepIds: null,
}
writeFileSync(new URL('../server/apps-script/DemoSnapshots.gs', import.meta.url), `// 자동 생성: npm run build:gs-snapshots (원본 scripts/build-demo-snapshots.mjs, 규칙 v${SNAPSHOT_RULE_VERSION}). 직접 고치지 말 것.
// 허용 스냅샷 = 시험 배포가 받는 세션 문맥(설계 15 §3 4항·docs/17 §4). status=retired 는 기존 receipt 회수만 허용(신규 접수 불가). anonymousCodePattern 은 시험용 합성 코드 범위.
var ALLOWED_SNAPSHOTS = ${JSON.stringify(server)};
`)
console.log('ledger', ledger.entries.length, 'active', ledger.entries.filter((e) => e.status === 'active').length, 'server', Object.keys(server).length)
