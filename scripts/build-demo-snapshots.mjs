// 시연용 세션 스냅샷 목록 생성 — 계약 docs/design/contracts/session.snapshot.schema.json(1.0.0), docs/17 §4
// 같은 목록을 앱(src/data/session/demo-snapshots.json)과 수신점(server/apps-script/DemoSnapshots.gs)이 쓴다.
// ID는 스냅샷 내용(ID 제외)의 정규형 SHA-256에서 만든 결정적 UUID. 내용이 바뀌면 ID가 바뀐다(불변 스냅샷).
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const tasks = [read('../src/data/tasks/task.braking-force.case-lv1.json'), read('../src/data/tasks/task.braking-force.case-lv2.json')]
const fixture = read('../docs/design/examples/submission.demo-request.json').payload

const COMMON = { schemaVersion: '1.0.0', sessionCode: 'DEMO-ONLY', classConditionCode: 'DEMO', taskId: 'braking-force', runPurpose: 'demo', displayMode: 'threeD' }
const APPROVAL = { taskApproved: false, rulesetApproved: true, layoutConfirmed: false, researchUseApproved: false } // 과제 전체 pending(U1 보류), 규칙 승인(0A)
const SESSION_VERSIONS = { layoutVersion: 'dev-provisional-2026-10-26', judgeEngineVersion: '0.1.0', sessionConfigVersion: '1.2.0-design-2026-10-26', researchProtocolVersion: 'unapproved', feedbackPolicyVersion: '1.1.0-design-approved-2026-10-26' }

function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
}
function idOf(snapshotWithoutId) {
  const h = createHash('sha256').update(canonical(snapshotWithoutId), 'utf8').digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const list = []
for (const t of tasks) for (const difficultyMode of ['guided', 'unguided']) for (const usagePhase of ['preview', 'review', 'other']) for (const vehicleEntryDirection of [null, 'north', 'south']) {
  const body = { ...COMMON, difficultyMode, usagePhase, configurationApproval: APPROVAL, versions: { taskDefinitionVersion: t.taskDefinitionVersion, rulesetVersion: t.ruleset.rulesetVersion, measurementSetVersion: t.measurement.measurementSetVersion, ...SESSION_VERSIONS }, sessionConfiguration: { vehicleEntryDirection } }
  const { schemaVersion, ...rest } = body
  list.push({ schemaVersion, sessionSnapshotId: idOf(body), ...rest })
}
writeFileSync(new URL('../src/data/session/demo-snapshots.json', import.meta.url), JSON.stringify(list, null, 2) + '\n')

// 수신점 허용 목록: 앱 스냅샷(코드 ^[A-Z]-\d{2}$) + Codex 합성 fixture 스냅샷(코드 D-00, 예시 record의 값 그대로)
const server = {}
for (const s of list) server[s.sessionSnapshotId] = { snapshot: s, anonymousCodePattern: '^[A-Z]-[0-9]{2}$' }
server[fixture.sessionSnapshotId] = {
  snapshot: { schemaVersion: '1.0.0', sessionSnapshotId: fixture.sessionSnapshotId, sessionCode: fixture.sessionCode, classConditionCode: fixture.classConditionCode, taskId: fixture.taskId, difficultyMode: fixture.difficultyMode, usagePhase: fixture.usagePhase, runPurpose: fixture.runPurpose, displayMode: fixture.displayMode, configurationApproval: fixture.configurationApproval, versions: fixture.versions, sessionConfiguration: { vehicleEntryDirection: null } },
  anonymousCodePattern: '^D-00$',
}
const gs = `// 자동 생성: npm run build:gs-snapshots (원본 scripts/build-demo-snapshots.mjs). 직접 고치지 말 것.
// 허용 스냅샷 = 시험 배포가 받는 세션 문맥(설계 15 §3 4항·docs/17 §4). record의 sessionSnapshotId·sessionCode·조건·과제·모드·시점·목적·표시·승인·versions가 모두 일치해야 접수한다.
var ALLOWED_SNAPSHOTS = ${JSON.stringify(server)};
`
writeFileSync(new URL('../server/apps-script/DemoSnapshots.gs', import.meta.url), gs)
console.log('snapshots', list.length, 'server entries', Object.keys(server).length)
