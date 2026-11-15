// 수업 자료 모으기 — 마치면 자동으로 보내기(설계 docs/superpowers/specs/2026-11-15-class-records-design.md §3-3)
// - 보내는 대상은 수업용 세션 기록뿐이다(processOutbox의 auto 모드가 거른다). 기록 없이 하기는 이 기기 저장소에 없으므로 보내지 않는다.
// - 부르는 때: 앱을 열 때, 인터넷이 다시 연결될 때(online — NETWORK_ERROR 기록은 재시도 시각을 무시), 기록을 확정할 때,
//   그리고 앱이 열려 있는 동안 수업용 대기 기록의 가장 이른 재시도 시각에 맞춘 타이머 하나.
// - 인터넷이 끊겨 있으면 시도하지 않는다. 자동 전송에는 시도 상한이 없다(간격은 기존 규칙, 최대 10분).
// - 거절·충돌과 다시 보내도 소용없는 사유의 기록은 다시 보내지 않는다(교사 화면 전송 버튼으로만). 전송 주소가 없는 빌드에서는 아무것도 하지 않는다.
// - 전송함 처리는 outbox.ts가 모듈 단위로 한 줄로 세운다(교사 전송과도 겹치지 않음). 여기서는 아직 시작하지 않은 차례가 있으면 그 차례에 합친다.
import type { Repository, StoredRecord } from '../records/repository'
import type { DeliveryEnvelope } from '../records/types'
import { isClassSession } from '../app/sessions'
import { noAutoRetry, processOutbox, type OutboxItemResult, type OutboxOptions } from './outbox'
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, type SubmitDeps } from './submit'

export interface AutoSender {
  /** 전송함의 수업용 기록을 보낸다. online: 인터넷이 다시 연결돼 부름. 전송 주소가 없거나 닫았거나 저장소를 못 읽으면 null(예외를 던지지 않음) */
  run(o?: { online?: boolean }): Promise<OutboxItemResult[] | null>
  /** 보내지 않고 타이머만 다시 건다(교사 전송이 끝난 뒤 — 교사 전송이 재시도 시각을 바꿨을 수 있다) */
  reschedule(): Promise<void>
  /** 타이머를 정리하고 더 보내지 않는다(앱이 닫힐 때) */
  dispose(): void
}

export interface AutoSendTimers { set: (fn: () => void, delayMs: number) => unknown; clear: (handle: unknown) => void; now: () => number }
const realTimers: AutoSendTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), now: () => Date.now() }

/** 지난 재시도 시각이어도 이만큼은 기다린다(기본 재시도 간격 30초 — 시각이 안 바뀐 기록 때문에 짧게 돌지 않게) */
export const MIN_WAKE_MS = BACKOFF_BASE_MS

/**
 * 다음에 자동 전송을 부를 때까지(ms). 수업용 대기 기록 가운데 가장 이른 재시도 시각(지났으면 30초).
 * 재시도 시각이 비었어도 자동으로 다시 보낼 기록(시도한 적 있고, 다시 보내도 소용없는 사유가 아닌 것 — 교사 전송으로 상한에 닿은 경우)은 최대 간격(10분)으로 센다.
 * 걸 것이 없으면 null
 */
export function nextWakeDelay(records: StoredRecord[], nowMs: number): number | null {
  let earliest = Number.POSITIVE_INFINITY
  for (const r of records) {
    const env = r.envelope
    if (!isClassSession(r.payload.sessionCode)) continue
    if (env.uploadStatus === 'acknowledged' || env.uploadStatus === 'rejected' || env.uploadStatus === 'conflict') continue
    if (noAutoRetry(env)) continue
    if (!env.nextRetryAt) {
      if (env.uploadAttemptCount > 0) earliest = Math.min(earliest, nowMs + BACKOFF_MAX_MS)
      continue
    }
    const t = Date.parse(env.nextRetryAt)
    if (Number.isFinite(t)) earliest = Math.min(earliest, Math.max(nowMs + MIN_WAKE_MS, t))
  }
  return Number.isFinite(earliest) ? earliest - nowMs : null
}

/** 결과 화면의 '보내는 중'을 이어 갈까: 그 차례 결과에 이 기록이 들었으면(또는 차례가 통째로 실패했으면) 끈다. 앞 차례가 끝난 것만으로는 끄지 않는다 */
export function sendingAfterPass(sending: boolean, recordId: string, results: OutboxItemResult[] | null): boolean {
  if (!sending) return false
  if (results === null) return false
  return !results.some((r) => r.recordId === recordId)
}

/** onPass: 한 차례가 끝날 때마다(타이머로 부른 차례 포함) 그 차례의 결과와 함께 — 화면이 전송 상태를 새로 읽는 데 쓴다 */
export function createAutoSender(repo: Repository, deps: () => SubmitDeps | null, timers: AutoSendTimers = realTimers, onPass?: (results: OutboxItemResult[] | null) => void): AutoSender {
  /** 줄을 섰지만 아직 시작하지 않은 차례(시작하면 비운다 — 그 뒤의 부름은 새 차례를 세워 전송함을 새로 읽는다) */
  let waiting: { opts: OutboxOptions; p: Promise<OutboxItemResult[] | null> } | null = null
  let timer: unknown = null
  let disposed = false
  const clearTimer = () => { if (timer !== null) { timers.clear(timer); timer = null } }
  /** saveFailed: 이번 차례에 결과 저장이 실패했음 — 기록이 지난 재시도 시각으로 남아 있으니 최대 간격으로 건다(실제 요청을 짧게 되풀이하지 않게) */
  const schedule = async (d: SubmitDeps, saveFailed = false) => {
    clearTimer()
    if (disposed || (d.online && !d.online())) return
    try {
      const wake = nextWakeDelay(await repo.listOutbox(), timers.now())
      const delay = wake !== null && saveFailed ? Math.max(wake, BACKOFF_MAX_MS) : wake
      if (delay !== null && !disposed) { clearTimer(); timer = timers.set(() => { timer = null; void sender.run() }, delay) }
    } catch { /* 다음 부름(앱 열기·online·확정) 때 다시 건다 */ }
  }
  const sender: AutoSender = {
    run(o = {}) {
      const d = deps()
      if (!d || disposed) return Promise.resolve(null)
      if (waiting) { if (o.online) waiting.opts.onlineSignal = true; return waiting.p }
      const opts: OutboxOptions = { auto: true, onlineSignal: !!o.online, onStart: () => { if (waiting?.opts === opts) waiting = null } }
      const p = processOutbox(repo, d, opts)
        .catch(() => null)
        .then(async (res) => {
          if (waiting?.opts === opts) waiting = null
          await schedule(d, !!res?.some((r) => r.outcome === 'saveFailed'))
          if (!disposed) { try { onPass?.(res) } catch { /* 화면 쪽 실패는 전송과 무관 */ } }
          return res
        })
      waiting = { opts, p }
      return p
    },
    async reschedule() { const d = deps(); if (d && !disposed) await schedule(d) },
    dispose() { disposed = true; clearTimer() },
  }
  return sender
}

/** 결과 화면 전송 상태 문구 — 정오·판정을 넣지 않는다(설계 §3-3, §5) */
export const CLASS_SEND_TEXT = {
  sent: '기록을 선생님께 보냈어요.',
  sending: '기록을 선생님께 보내는 중이에요.',
  notYet: '아직 보내지 못했어요. 인터넷이 연결되면 다시 보내요.',
  /** 서버가 거절했거나 같은 번호로 다른 내용이 있음 — 자동으로 다시 보내지 않으므로 교사가 교사 화면에서 본다 */
  teacher: '기록을 보내지 못했어요. 선생님께 알려 주세요.',
} as const

/** 수업용 세션 결과 화면의 전송 상태 한 줄. 이 기기에 확정 저장되지 않았으면 null(저장 실패 안내가 따로 있음).
 * '인터넷이 연결되면 다시 보내요'는 자동으로 다시 보낼 기록에만 쓴다. 거절·충돌, 다시 보내도 소용없는 사유, 서버 한도(RATE_LIMITED)는 선생님께 알리게 한다 */
export function classSendLine(env: DeliveryEnvelope | null, sending: boolean): string | null {
  if (!env || env.localSaveStatus !== 'saved') return null
  if (env.uploadStatus === 'acknowledged') return CLASS_SEND_TEXT.sent
  if (env.uploadStatus === 'rejected' || env.uploadStatus === 'conflict') return CLASS_SEND_TEXT.teacher
  if (!sending && (noAutoRetry(env) || env.lastErrorCode === 'RATE_LIMITED')) return CLASS_SEND_TEXT.teacher
  return sending ? CLASS_SEND_TEXT.sending : CLASS_SEND_TEXT.notYet
}

/** 시작 화면 안내(수업용 세션일 때만) */
export const CLASS_START_NOTE = '마치면 수행 기록이 선생님께 보내져요.'
