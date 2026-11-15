// 대기열(outbox) 처리 — 설계 05 §6·§10, 15 §5
// 확정 기록 중 acknowledged가 아닌 것을 순서대로 같은 ID·같은 원본으로 보낸다.
//  - rejected·conflict는 자동 재전송하지 않는다(교사 점검). 예외(resendableRejected): 서버에 간 적 없이 이전 판 버그로 거절된 기록, 서버가 기록 판을 아직 몰라 저장 전에 거절한 기록, 서버가 수업용 세션을 아직 몰라 거절한 기록은 교사 전송으로 다시 보낸다.
//  - nextRetryAt이 아직 안 됐으면 건너뛴다(force는 교사 조작 전용).
//  - 새로고침 뒤 남은 uploading은 confirmationPending으로 보고 재전송한다(서버 저장 여부를 추정하지 않음).
//  - 보내기 직전 uploading으로 저장하고, 결과 patch 저장이 끝난 뒤에만 결과를 돌려준다.
// 수업 자료 모으기(설계 2026-11-15 §3-3):
//  - auto(자동 전송): 수업용 세션 기록만 본다(다른 기록은 건드리지 않고 결과에도 넣지 않음). 거절·충돌은 다시 보내지 않고(교사가 다시 보낼 수 있는 거절도),
//    재시도 시각을 지키며, 보낸 적이 있는데 재시도 시각이 없는 기록(시도 상한·서버 이상)은 교사 전송에 맡긴다.
//  - 안전장치 1: 수업용이 아닌 세션에 학번 형식으로 남은 기록은 서버가 받지 않으므로 교사가 보내도 보내지 않는다(기록·상태 그대로).
import type { Repository, StoredRecord } from '../records/repository'
import { isStudentNumber } from '../app/session'
import { isClassSession } from '../app/sessions'
import { resendableRejected, submitRecord, type SubmitDeps } from './submit'

/** 건너뛴 사유: 수업용이 아닌 세션(시연·리허설)의 학번 기록 — 서버가 받지 않는다. 이 기기에서 내려받는다 */
export const STUDENT_NUMBER_OUTSIDE_CLASS = 'STUDENT_NUMBER_OUTSIDE_CLASS'
/** 건너뛴 사유(자동 전송만): 보낸 적이 있는데 재시도 시각이 없음 — 교사 전송으로만 다시 보낸다 */
export const NO_AUTO_RETRY = 'NO_AUTO_RETRY'

/** 서버가 받지 않을 것이 분명해 보내지 않는 기록인가(안전장치 1) */
export function studentNumberOutsideClass(rec: StoredRecord): boolean {
  return !isClassSession(rec.payload.sessionCode) && isStudentNumber(rec.payload.anonymousStudentCode)
}

export interface OutboxItemResult { recordId: string; outcome: 'acknowledged' | 'rejected' | 'conflict' | 'pending' | 'confirmationPending' | 'skipped' | 'saveFailed'; code: string | null }

/** force: 교사의 '강제 재전송'(재시도 시각 무시). auto: 자동 전송(수업용 세션 기록만, force와 함께 쓰지 않는다) */
export async function processOutbox(repo: Repository, deps: SubmitDeps, opts: { force?: boolean; auto?: boolean } = {}): Promise<OutboxItemResult[]> {
  const auto = !!opts.auto
  const force = !!opts.force && !auto
  const items = (await repo.listOutbox()).filter((r) => !auto || isClassSession(r.payload.sessionCode))
  const out: OutboxItemResult[] = []
  const nowMs = deps.now().getTime()
  for (const item of items) {
    const env = item.envelope
    if (env.uploadStatus === 'conflict' || (env.uploadStatus === 'rejected' && (auto || !resendableRejected(item)))) { out.push({ recordId: item.recordId, outcome: 'skipped', code: env.lastErrorCode }); continue }
    if (studentNumberOutsideClass(item)) { out.push({ recordId: item.recordId, outcome: 'skipped', code: STUDENT_NUMBER_OUTSIDE_CLASS }); continue }
    if (!force && env.nextRetryAt && Date.parse(env.nextRetryAt) > nowMs) { out.push({ recordId: item.recordId, outcome: 'skipped', code: 'RETRY_LATER' }); continue }
    if (auto && env.uploadAttemptCount > 0 && !env.nextRetryAt && env.uploadStatus !== 'uploading') { out.push({ recordId: item.recordId, outcome: 'skipped', code: NO_AUTO_RETRY }); continue }
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
