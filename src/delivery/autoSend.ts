// 수업 자료 모으기 — 마치면 자동으로 보내기(설계 docs/superpowers/specs/2026-11-15-class-records-design.md §3-3)
// - 보내는 대상은 수업용 세션 기록뿐이다(processOutbox의 auto 모드가 거른다). 기록 없이 하기는 이 기기 저장소에 없으므로 보내지 않는다.
// - 부르는 때: 앱을 열 때, 인터넷이 다시 연결될 때(online), 기록을 확정할 때. 못 보낸 기록은 기기에 남고 기존 재시도 간격을 따른다(force 아님).
// - 거절·충돌 기록은 다시 보내지 않는다(교사 화면 전송 버튼으로만). 전송 주소가 없는 빌드에서는 아무것도 하지 않는다.
// - 한 번에 한 차례만 돈다. 도는 중에 다시 불리면 끝난 뒤 한 번 더 돈다(같은 기록을 겹쳐 보내지 않게).
import type { Repository } from '../records/repository'
import type { DeliveryEnvelope } from '../records/types'
import { processOutbox, type OutboxItemResult } from './outbox'
import type { SubmitDeps } from './submit'

export interface AutoSender {
  /** 전송함의 수업용 기록을 보낸다. 전송 주소가 없거나 저장소를 못 읽으면 null(예외를 던지지 않음) */
  run(): Promise<OutboxItemResult[] | null>
}

export function createAutoSender(repo: Repository, deps: () => SubmitDeps | null): AutoSender {
  let current: Promise<OutboxItemResult[] | null> | null = null
  let again = false
  const loop = async (d: SubmitDeps) => {
    let last: OutboxItemResult[] | null = null
    do {
      again = false
      try { last = await processOutbox(repo, d, { auto: true }) } catch { last = null }
    } while (again)
    return last
  }
  return {
    run() {
      const d = deps()
      if (!d) return Promise.resolve(null)
      if (current) { again = true; return current }
      current = loop(d).finally(() => { current = null })
      return current
    },
  }
}

/** 결과 화면 전송 상태 문구 — 정오·판정을 넣지 않는다(설계 §3-3, §5) */
export const CLASS_SEND_TEXT = {
  sent: '기록을 선생님께 보냈어요.',
  sending: '기록을 선생님께 보내는 중이에요.',
  notYet: '아직 보내지 못했어요. 인터넷이 연결되면 다시 보내요.',
  /** 서버가 거절했거나 같은 번호로 다른 내용이 있음 — 자동으로 다시 보내지 않으므로 교사가 교사 화면에서 본다 */
  teacher: '기록을 보내지 못했어요. 선생님께 알려 주세요.',
} as const

/** 수업용 세션 결과 화면의 전송 상태 한 줄. 이 기기에 확정 저장되지 않았으면 null(저장 실패 안내가 따로 있음) */
export function classSendLine(env: DeliveryEnvelope | null, sending: boolean): string | null {
  if (!env || env.localSaveStatus !== 'saved') return null
  if (env.uploadStatus === 'acknowledged') return CLASS_SEND_TEXT.sent
  if (env.uploadStatus === 'rejected' || env.uploadStatus === 'conflict') return CLASS_SEND_TEXT.teacher
  return sending ? CLASS_SEND_TEXT.sending : CLASS_SEND_TEXT.notYet
}

/** 시작 화면 안내(수업용 세션일 때만) */
export const CLASS_START_NOTE = '마치면 수행 기록이 선생님께 보내져요.'
