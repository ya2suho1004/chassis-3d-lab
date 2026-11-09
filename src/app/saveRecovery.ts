// 저장 실패 뒤 같은 수행 복구(D4, 2026-11-08 Codex 회의) — 순수 로직. 이 기기 저장소만 쓰고 네트워크는 없다.
import type { RecordPayload } from '../domain/record'
import type { Draft, Repository } from '../records/repository'
import type { DeliveryEnvelope } from '../records/types'

export type SaveState = 'saved' | 'saving' | 'failed'

/**
 * 저장을 시작하고 결과를 상태로 알린다. 가장 최근 저장의 결과만 반영한다.
 * 화면 효과의 정리 함수로 취소하면 안 된다. 게임 화면은 패널의 변경을 부모가 곧바로 되돌려 주므로, 저장이 끝나기 전에 취소돼 '저장 중'에 멈춘다.
 */
export function createSaveTracker(onStatus: (s: SaveState) => void, stopped: () => boolean) {
  let latest = 0
  return (save: () => Promise<{ status: string }>) => {
    const mine = ++latest
    onStatus('saving')
    const report = (s: SaveState) => { if (mine === latest && !stopped()) onStatus(s) }
    void save().then((r) => report(r.status === 'saved' ? 'saved' : 'failed'), () => report('failed'))
  }
}

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

/**
 * 시작 버튼의 갈림길. 같은 코드·세션의 남은 초안이 있으면 복구 화면에 넘기고, 없으면 바로 시작한다.
 * 복구 화면의 '새 수행 시작'은 startFresh로 곧바로 시작한다. 시작 화면으로 돌아가면 같은 초안을 다시 찾아 빠져나오지 못한다(독립 검토 3번).
 */
export async function startOrResume(o: {
  listDrafts: () => Promise<Draft[]>
  code: string
  sessionCode: string
  begin: () => Promise<void>
  onFound?: (draft: Draft, startFresh: () => Promise<void>) => void
}): Promise<void> {
  if (o.onFound) {
    const found = findDraftForCode(await o.listDrafts(), o.code, o.sessionCode)
    if (found) return o.onFound(found, o.begin)
  }
  await o.begin()
}
