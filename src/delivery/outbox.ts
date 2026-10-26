// 대기열(outbox) 처리 — 설계 05 §6·§10, 15 §5
// 확정 기록 중 acknowledged가 아닌 것을 순서대로 같은 ID·같은 원본으로 보낸다.
//  - rejected·conflict는 자동 재전송하지 않는다(교사 점검).
//  - nextRetryAt이 아직 안 됐으면 건너뛴다(force는 교사 조작 전용).
//  - 새로고침 뒤 남은 uploading은 confirmationPending으로 보고 재전송한다(서버 저장 여부를 추정하지 않음).
//  - 보내기 직전 uploading으로 저장하고, 결과 patch 저장이 끝난 뒤에만 결과를 돌려준다.
import type { Repository, StoredRecord } from '../records/repository'
import { submitRecord, type SubmitDeps } from './submit'

export interface OutboxItemResult { recordId: string; outcome: 'acknowledged' | 'rejected' | 'conflict' | 'pending' | 'confirmationPending' | 'skipped' | 'saveFailed'; code: string | null }

export async function processOutbox(repo: Repository, deps: SubmitDeps, opts: { force?: boolean } = {}): Promise<OutboxItemResult[]> {
  const items = await repo.listOutbox()
  const out: OutboxItemResult[] = []
  const nowMs = deps.now().getTime()
  for (const item of items) {
    const env = item.envelope
    if (env.uploadStatus === 'rejected' || env.uploadStatus === 'conflict') { out.push({ recordId: item.recordId, outcome: 'skipped', code: env.lastErrorCode }); continue }
    if (!opts.force && env.nextRetryAt && Date.parse(env.nextRetryAt) > nowMs) { out.push({ recordId: item.recordId, outcome: 'skipped', code: 'RETRY_LATER' }); continue }
    const rec: StoredRecord = env.uploadStatus === 'uploading' ? { ...item, envelope: { ...env, uploadStatus: 'confirmationPending' } } : item
    const mark = await repo.updateEnvelope(item.recordId, { uploadStatus: 'uploading' })
    if (mark.status === 'failed') { out.push({ recordId: item.recordId, outcome: 'saveFailed', code: mark.errorCode ?? 'SAVE_FAILED' }); continue }
    const r = await submitRecord(rec, deps)
    if (r.outcome.kind === 'skipped') { await repo.updateEnvelope(item.recordId, { uploadStatus: env.uploadStatus === 'uploading' ? 'confirmationPending' : env.uploadStatus }); out.push({ recordId: item.recordId, outcome: 'skipped', code: r.outcome.reason }); continue }
    const saved = await repo.updateEnvelope(item.recordId, r.patch)
    if (saved.status === 'failed') { out.push({ recordId: item.recordId, outcome: 'saveFailed', code: saved.errorCode ?? 'SAVE_FAILED' }); continue }
    const code = 'code' in r.outcome ? r.outcome.code : null
    out.push({ recordId: item.recordId, outcome: r.outcome.kind, code })
  }
  return out
}
