// src/app/finishGate.ts — 결과 화면으로 넘기는 일을 '딱 한 번'만 하게 하는 관문(순수 로직, 2026-11-07 독립 검토 1번).
// 검사 통과 끄덕임(약 2.3초) 동안 교관을 다시 눌러 검사·중단을 또 하거나, 말풍선과 타이머가 겹쳐도
// 처음 요청 하나만 결과 화면으로 간다. 두 번째 요청은 무시한다(이미 확정 저장된 기록을 '저장 실패'로 덮지 않게).

export type GateAnswer = 'now' | 'nod' | 'ignored'

export interface FinishGate<A extends unknown[]> {
  /** 결과 화면 요청. nod=true면 끄덕임을 시작하고 complete()를 기다린다. 이미 요청이 있었으면 'ignored' */
  request(args: A, nod: boolean): GateAnswer
  /** 끄덕임 끝(타이머·말풍선 누름). 실제로 넘겼으면 true, 이미 넘겼거나 기다리는 요청이 없으면 false */
  complete(): boolean
  /** 끄덕임 중(결과 화면으로 넘어가기 전)인지 */
  readonly nodding: boolean
  /** 한 번이라도 요청을 받았는지(끄덕임 중 포함) — 이때부터 검사·중단·초안 저장을 막는다 */
  readonly closed: boolean
}

export function createFinishGate<A extends unknown[]>(finish: (...args: A) => void): FinishGate<A> {
  let pending: A | null = null
  let done = false
  return {
    request(args, nod) {
      if (done || pending) return 'ignored'
      if (!nod) { done = true; finish(...args); return 'now' }
      pending = args
      return 'nod'
    },
    complete() {
      if (done || !pending) return false
      const a = pending
      pending = null
      done = true
      finish(...a)
      return true
    },
    get nodding() { return pending !== null && !done },
    get closed() { return done || pending !== null },
  }
}
