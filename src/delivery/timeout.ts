// 통신 대기 제한(Codex 교차 검토 2026-11-06 A3). 연결은 붙어 있는데 응답이 안 오면 '보내는 중'에서 멈추지 않게 한다.
// 요청과 응답 본문 읽기 모두에 같은 마감을 건다. 마감이 지나면 요청을 취소(abort)하고 'TIMEOUT'으로 실패시킨다.
// 취소해도 서버가 이미 받았을 수 있다 — 기록 전송은 같은 recordId 재확인 구조가 이를 처리한다.

/** AI 질문: 정상 답(보통 몇 초)을 끊지 않도록 여유를 둔다 */
export const CHAT_TIMEOUT_MS = 40_000
/** 기록 전송(교사 화면) */
export const SUBMIT_TIMEOUT_MS = 30_000

export interface Deadline {
  signal: AbortSignal | undefined
  /** p가 마감 전에 끝나면 그 결과, 아니면 Error('TIMEOUT') */
  run<T>(p: Promise<T>): Promise<T>
  expired(): boolean
  clear(): void
}

export function deadline(ms: number): Deadline {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
  let fired = false
  let fail: (e: Error) => void = () => {}
  const timeout = new Promise<never>((_, reject) => { fail = reject })
  timeout.catch(() => {}) // 아무도 기다리지 않을 때 처리 안 된 거부로 남지 않게
  const t = setTimeout(() => { fired = true; ctl?.abort(); fail(new Error('TIMEOUT')) }, ms)
  return {
    signal: ctl?.signal,
    run: <T>(p: Promise<T>) => Promise.race([p, timeout]),
    expired: () => fired,
    clear: () => clearTimeout(t),
  }
}
