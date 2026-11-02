// 최소회전반경 측정 차량 연출 상태(과제 진행 → 앞바퀴 조향각). 연출 전용 — 판정·기록과 무관.
// ‘핸들 끝까지 돌림’(steer)을 마친 뒤 ‘직진으로 되돌림’(return) 전까지 앞바퀴가 사례 각도만큼 꺾여 있다.
// 각도는 부호 있음: + = 차의 왼쪽으로 꺾임(위에서 볼 때 시계 반대, three.js rotation.y +).
import type { TaskRun } from '../domain/taskEngine'

export interface TurningRig { leftDeg: number; rightDeg: number }
export const STRAIGHT: TurningRig = { leftDeg: 0, rightDeg: 0 }

export function turningRigState(run: TaskRun | null): TurningRig {
  if (!run || run.task.taskId !== 'min-turning-radius') return STRAIGHT
  const m = run.task.measurement
  const steered = run.completedSteps.includes('steer') && !run.completedSteps.includes('return')
  if (!steered || (m.turnDirection !== 'left' && m.turnDirection !== 'right')) return STRAIGHT
  const s = m.turnDirection === 'left' ? 1 : -1
  return { leftDeg: s * (m.leftAngleDeg ?? 0), rightDeg: s * (m.rightAngleDeg ?? 0) }
}

/** K3 모델(build_k3.py) 앞바퀴 중심의 모델 좌표(x, z). 모델 앞은 −z, 왼쪽은 −x */
export const K3_FRONT_WHEEL = { left: { x: -0.775, z: -1.38 }, right: { x: 0.775, z: -1.38 } } as const

/** 장비 자리(배치 중심)와 길이 방향으로 앞바퀴 중심·바깥 방향의 세계 좌표. 길이가 x 방향이면 모델을 +90° 돌려 놓는다(K3Model alongX) */
export function frontWheelWorld(e: { x: number; z: number; w: number; d: number }, side: 'left' | 'right'): { x: number; z: number; outX: number; outZ: number } {
  const p = K3_FRONT_WHEEL[side]
  const out = side === 'left' ? -1 : 1
  if (e.w > e.d) return { x: e.x + p.z, z: e.z - p.x, outX: 0, outZ: -out } // rotation-y +π/2: (x, z) → (z, −x)
  return { x: e.x + p.x, z: e.z + p.z, outX: out, outZ: 0 }
}
