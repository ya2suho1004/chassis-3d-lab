// 저장 실패 뒤 같은 수행 복구(D4, 2026-11-08 Codex 회의) — 순수 로직. 이 기기 저장소만 쓰고 네트워크는 없다.
import type { RecordPayload } from '../domain/record'
import type { Draft, Repository } from '../records/repository'
import type { DeliveryEnvelope } from '../records/types'

export type SaveState = 'saved' | 'saving' | 'failed'

/** 게임 화면 배지에 늘 보일 저장 상태. 기록 없이 하기는 이미 '기록 안 됨'이 보이므로 null */
export function saveBadge(state: SaveState, noRecord: boolean): { text: string; tone: 'ok' | 'busy' | 'bad' } | null {
  if (noRecord) return null
  if (state === 'saved') return { text: '저장됨', tone: 'ok' }
  if (state === 'saving') return { text: '저장 중…', tone: 'busy' }
  return { text: '저장 실패', tone: 'bad' }
}

export type RetryFreezeResult = { ok: true; envelope: DeliveryEnvelope; payload: RecordPayload } | { ok: false; errorCode: string }

/**
 * 확정 저장을 '처음 만든 원본 그대로' 다시 한다(수행 번호·완료 시각을 새로 만들지 않음).
 * 이미 확정돼 있으면(실패로 보였지만 실제로 저장된 경우) 두 번 저장하지 않고 저장된 원본을 돌려준다.
 */
export async function retryFreeze(repo: Repository, payload: RecordPayload): Promise<RetryFreezeResult> {
  try {
    const r = await repo.freezeRecord(payload)
    if (r.status === 'failed' && r.errorCode !== 'ALREADY_FROZEN') return { ok: false, errorCode: r.errorCode ?? 'FREEZE_FAILED' }
    const stored = await repo.loadRecord(payload.recordId)
    if (!stored) return { ok: false, errorCode: 'RECORD_NOT_FOUND' }
    return { ok: true, envelope: stored.envelope, payload: stored.payload }
  } catch (e) {
    return { ok: false, errorCode: (e as Error).message || 'FREEZE_FAILED' }
  }
}

/**
 * 현재 수행 포인터가 사라졌어도(새로고침 중 포인터 저장 실패, 확정 실패 뒤 '다음 학생' 등) 이 기기에 남은 초안을 찾는다.
 * 같은 익명 코드 + 같은 세션일 때만 고른다(다른 반·다른 학생의 초안을 보여 주지 않음). 여러 개면 가장 최근 것.
 */
export function findDraftForCode(drafts: Draft[], code: string, sessionCode: string): Draft | null {
  const mine = drafts.filter((d) => d.session.anonymousStudentCode === code && d.session.sessionCode === sessionCode)
  if (mine.length === 0) return null
  return mine.reduce((a, b) => (b.savedAt > a.savedAt ? b : a))
}
