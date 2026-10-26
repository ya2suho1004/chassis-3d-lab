// 스냅샷 생성 규칙(순수 함수) — 생성기(build-demo-snapshots.mjs)와 테스트(tests/snapshotLib.test.ts)가 함께 쓴다.
// 규칙 v1: ID = 스냅샷 내용(ID 제외)의 정규형(키 정렬·공백 없음) SHA-256 → UUID v4 모양(해시 120비트). 원장은 append-only.
import { createHash } from 'node:crypto'

export const SNAPSHOT_RULE_VERSION = '1'

export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
}

export function idOf(snapshotWithoutId) {
  const h = createHash('sha256').update(canonical(snapshotWithoutId), 'utf8').digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const SCOPE_FIELDS = ['allowedStepIds', 'stepPrerequisites']

/**
 * 원장 병합(Codex 회신 C-P2-4·5, D):
 *  - 원장 안 중복 ID, 예약 ID(fixture)와의 겹침(원장·현재 모두), 현재 목록 안 ID 충돌은 실패.
 *  - 같은 ID에 다른 스냅샷 내용(LEDGER_CONTENT_MISMATCH)은 실패. 검증 범위 필드(allowedStepIds·stepPrerequisites)는 각각 독립 비교해 다르면 실패(LEDGER_SCOPE_MISMATCH).
 *  - 과거 항목에 없던 범위 필드를 채우는 것은 검증 정책 변경이므로 opts.scopeUpgrade({reason, fields})가 있을 때만 허용하고 ledger.migrations에 기록(LEDGER_SCOPE_UPGRADE_REQUIRED).
 *  - 현재 목록에 없는 항목은 retired로 남긴다(삭제 없음). firstGeneratedOn은 보존.
 */
export function mergeLedger(ledger, current, today, reservedIds = [], opts = {}) {
  if (ledger.ruleVersion !== SNAPSHOT_RULE_VERSION) throw new Error('LEDGER_RULE_VERSION: 수동 이관 필요')
  const seen = new Set()
  for (const e of ledger.entries) {
    const id = e.snapshot.sessionSnapshotId
    if (seen.has(id)) throw new Error(`LEDGER_DUPLICATE_ID: ${id}`)
    if (reservedIds.includes(id)) throw new Error(`RESERVED_ID: ${id} (ledger)`)
    seen.add(id)
  }
  const byId = new Map(ledger.entries.map((e) => [e.snapshot.sessionSnapshotId, e]))
  const curIds = new Set()
  const upgraded = []
  for (const c of current) {
    const id = c.snapshot.sessionSnapshotId
    if (reservedIds.includes(id)) throw new Error(`RESERVED_ID: ${id}`)
    if (curIds.has(id)) throw new Error(`CURRENT_DUPLICATE_ID: ${id}`)
    curIds.add(id)
    const prev = byId.get(id)
    let entryScope = {}
    if (prev) {
      if (canonical(prev.snapshot) !== canonical(c.snapshot)) throw new Error(`LEDGER_CONTENT_MISMATCH: ${id}`)
      for (const f of SCOPE_FIELDS) {
        const has = prev[f] !== undefined && prev[f] !== null
        if (has) { if (canonical(prev[f]) !== canonical(c[f] ?? null)) throw new Error(`LEDGER_SCOPE_MISMATCH: ${id} ${f}`); entryScope[f] = prev[f] }
        else if (c[f] !== undefined && c[f] !== null) {
          if (!opts.scopeUpgrade || !(opts.scopeUpgrade.fields || []).includes(f)) throw new Error(`LEDGER_SCOPE_UPGRADE_REQUIRED: ${id} ${f}`)
          entryScope[f] = c[f]; upgraded.push({ id, field: f })
        } else entryScope[f] = null
      }
    } else for (const f of SCOPE_FIELDS) entryScope[f] = c[f] ?? null
    byId.set(id, { snapshot: c.snapshot, ...entryScope, status: 'active', firstGeneratedOn: prev?.firstGeneratedOn ?? today, retiredOn: null })
  }
  for (const [id, e] of byId) if (!curIds.has(id) && e.status !== 'retired') byId.set(id, { ...e, status: 'retired', retiredOn: today })
  const migrations = [...(ledger.migrations ?? [])]
  if (upgraded.length) migrations.push({ date: today, fields: [...new Set(upgraded.map((u) => u.field))], ids: [...new Set(upgraded.map((u) => u.id))], reason: opts.scopeUpgrade.reason })
  return { ruleVersion: SNAPSHOT_RULE_VERSION, migrations, entries: [...byId.values()] }
}
