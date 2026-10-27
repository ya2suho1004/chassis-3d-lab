// 제동력 시험기 연출 상태 — 과제 진행(TaskRun)에서 3D 장면이 보여 줄 모습만 계산한다.
// 연출은 표시일 뿐이다: 단계 완료·판정·기록은 taskEngine이 정하고, 애니메이션 종료로 성공을 판정하지 않는다(설계 06 §4).
// 진입 방향 미설정(null)이면 방향에 의존하는 연출(차량 진입·이탈)을 하지 않고 차량을 롤러 위 가정 자리에 둔다(U6).
import type { TaskRun } from '../domain/taskEngine'

export type VehiclePose = 'outside' | 'lifted' | 'onRollers'

export interface BrakeRigState {
  vehicle: VehiclePose
  /** 시험기 리프트 판이 올라와 있는지(차량 진입·이탈 자세) */
  liftUp: boolean
  rollersSpinning: boolean
}

/** 차량이 롤러 밖에서 대기하는 거리(m, 차량 길이 방향). 연출용 가정값 */
export const OUTSIDE_DISTANCE = 3.5

export function brakeRigState(run: Pick<TaskRun, 'completedSteps' | 'offProgress' | 'motorOn'> | null, entryDirection: 'north' | 'south' | null): BrakeRigState {
  // 과제 수령 전 둘러보기: 지금까지처럼 차량이 롤러 위에 있는 모습
  if (!run) return { vehicle: 'onRollers', liftUp: false, rollersSpinning: false }
  const done = (id: string) => run.completedSteps.includes(id)
  const exited = run.offProgress.includes('exitVehicle')
  const entered = done('enter') && !exited
  const liftUp = !done('lower') || run.offProgress.includes('liftUp')
  const directional = entryDirection !== null
  let vehicle: VehiclePose
  if (entered) vehicle = liftUp ? 'lifted' : 'onRollers'
  else if (directional) vehicle = 'outside'
  else vehicle = liftUp ? 'lifted' : 'onRollers'
  return { vehicle, liftUp, rollersSpinning: run.motorOn }
}
