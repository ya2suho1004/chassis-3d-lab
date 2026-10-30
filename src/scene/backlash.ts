// 차동기어 백래시 연습 계산(그리기와 무관한 순수 함수). 연습 전용 — 값은 연습용(실측 아님), 기록 없음.
// 피니언(컴패니언 플랜지)을 잡고 링기어를 좌우로 흔들면 링기어는 이 사이 틈(백래시)만큼만 움직이고 멈춘다.
// 피니언을 잡지 않으면 링기어가 피니언까지 같이 돌려 바늘이 멈추지 않는다(백래시를 잴 수 없다).
// 길이는 모두 측정 위치(링기어 이빨, 게이지 접촉점)에서 잰 접선 방향 mm.

export interface BacklashCase {
  /** 링기어-피니언 백래시(mm) */
  bl: number
  /** 게이지 미리 눌림(mm) */
  preload: number
}

/** 연습 상태(LabScreen이 들고 있다). s: 링기어 이빨 위치, p: 피니언 위치(둘 다 처음 자리 기준 mm), push: 미는 방향 −1·0·1 */
export interface BacklashState { s: number; p: number; push: number; held: boolean }

/** 손으로 미는 빠르기(mm/s) — 바늘이 오가는 것이 보이게 천천히 */
export const PUSH_SPEED = 0.25
/** 피니언을 안 잡았을 때 기어가 같이 돌 수 있는 범위(mm) — 게이지 측정 범위 안에 머물게 */
export const FREE_LIMIT = 0.8

/** 연습용 기어 하나(백래시 0.08~0.20 mm 중 하나, 0.01 단위). 실측값·규정값 아님 */
export function randomBacklashCase(rand: () => number = Math.random): BacklashCase {
  return { bl: (8 + Math.floor(rand() * 13)) / 100, preload: 1.0 }
}

/** 처음 상태: 링기어가 틈의 가운데 */
export function initialBacklashState(c: BacklashCase): BacklashState {
  return { s: c.bl / 2, p: 0, push: 0, held: false }
}

/** dt초 동안 민다. 피니언을 잡았으면 링기어는 [p, p + bl]에서 멈추고, 안 잡았으면 끝에 닿은 뒤 피니언을 같이 민다 */
export function stepBacklash(st: BacklashState, c: BacklashCase, dt: number): void {
  if (!st.push) return
  let s = st.s + st.push * PUSH_SPEED * dt
  if (st.held) {
    s = Math.min(st.p + c.bl, Math.max(st.p, s))
  } else {
    let p = st.p
    if (s > p + c.bl) p = s - c.bl
    if (s < p) p = s
    p = Math.min(FREE_LIMIT, Math.max(-FREE_LIMIT, p))
    s = Math.min(p + c.bl, Math.max(p, s))
    st.p = p
  }
  st.s = s
}

/** 게이지 측정축이 들어간 양(mm): 처음 자리(틈 가운데)에서 미리 눌림만큼 */
export function backlashTravel(st: BacklashState, c: BacklashCase): number {
  return c.preload + st.s - c.bl / 2
}

/** 학생이 적은 백래시가 맞는지(눈금 반 칸 0.005 mm 안) */
export function checkBacklash(answer: number, c: BacklashCase): boolean {
  return Number.isFinite(answer) && Math.abs(answer - c.bl) < 0.005 + 1e-9
}
