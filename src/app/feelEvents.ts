// src/app/feelEvents.ts
// 손맛 사건 뽑기(설계 2026-11-12 §4.2): 화면에 보이는 장치 모습의 앞뒤를 견주어, 이미 일어난 움직임을 사건으로 바꾼다.
// 규칙표(reactions.ts)처럼 과제 상태·채점·기록을 들여오지 않는다(시험이 확인).
import type { ReactionEvent } from './reactions'

/** 제동 장치의 보이는 모습 가운데 사건에 쓰는 것(src/scene/brakeRig.ts의 BrakeRigState가 이 모양을 채운다) */
export interface RigLook {
  vehicle: 'outside' | 'lifted' | 'onRollers'
  liftUp: boolean
  braking: boolean
}

/**
 * 앞 모습 → 지금 모습에서 일어난 움직임.
 * 앞 모습이 없으면(과제를 막 받았거나 이어 하기로 돌아온 순간) 아무것도 내지 않는다 — 조작이 아니라 장면 준비다.
 * 롤러 회전은 여기서 내지 않는다. 회전음은 사건이 아니라 '도는 동안'이라는 상태에 묶는다.
 */
export function rigEvents(prev: RigLook | null, next: RigLook): ReactionEvent[] {
  if (!prev) return []
  const out: ReactionEvent[] = []
  if (prev.liftUp !== next.liftUp) out.push('liftMove')
  if ((prev.vehicle === 'outside') !== (next.vehicle === 'outside')) out.push('vehicleMove')
  if (!prev.braking && next.braking) out.push('pedalDown') // 페달을 떼는 쪽은 소리가 없다
  return out
}
