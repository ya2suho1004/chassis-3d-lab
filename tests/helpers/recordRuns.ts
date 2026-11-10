// 기록 창 시험용 수행 만들기(설계 2026-11-10). 엔진 함수만 써서 단계를 진행하고, 과제 패널을 서버 없이 그린다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import brake1 from '../../src/data/tasks/task.braking-force.case-lv1.json'
import turn1 from '../../src/data/tasks/task.min-turning-radius.case-lv1.json'
import { attempt, createTaskRun, submitResponse, type DifficultyMode, type TaskRun } from '../../src/domain/taskEngine'
import type { SessionContext } from '../../src/domain/record'
import type { ApprovedTask } from '../../src/domain/types'
import type { Repository } from '../../src/records/repository'
import { TaskScreen } from '../../src/screens/TaskScreen'

export const brake = brake1 as unknown as ApprovedTask
export const turn = turn1 as unknown as ApprovedTask
let n = 0
export const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const deps = { now: () => 1000, newId: id }
export const step = (r: TaskRun, s: string) => attempt(r, { type: 'step', stepId: s }, id()).run
export const safe = (r: TaskRun, c: string) => attempt(r, { type: 'confirmSafety', conditionId: c }, id()).run
export const answer = (r: TaskRun, item: string, v: string) => submitResponse(r, item, v, id()).run

/** 제동력: 차량 진입(enter)까지 */
export function brakeToEnter(mode: DifficultyMode = 'guided'): TaskRun {
  let r = createTaskRun(brake, { difficultyMode: mode }, deps)
  r = safe(step(r, 'ppe'), 's-engine')
  for (const s of ['tire', 'equip', 'enter']) r = step(r, s)
  return r
}
/** 제동력: 페달(press)까지(축중은 600으로 적음) */
export function brakeToPress(mode: DifficultyMode = 'guided'): TaskRun {
  let r = step(answer(brakeToEnter(mode), 'axleWeight', '600'), 'axle')
  r = safe(step(r, 'mode'), 's-lift')
  for (const s of ['lower', 'motor', 'press']) r = step(r, s)
  return r
}
/** 제동력: 차량 빼기(off)까지(좌 240·우 200으로 적음) */
export function brakeToOff(mode: DifficultyMode = 'guided'): TaskRun {
  let r = step(answer(answer(brakeToPress(mode), 'left', '240'), 'right', '200'), 'read')
  r = attempt(r, { type: 'subStep', stepId: 'off', action: 'motorOff' }, id()).run
  r = safe(r, 's-lift')
  r = attempt(r, { type: 'subStep', stepId: 'off', action: 'liftUp' }, id()).run
  return attempt(r, { type: 'subStep', stepId: 'off', action: 'exitVehicle' }, id()).run
}
/** 최소회전반경: 조향(steer)까지 */
export function turnToSteer(mode: DifficultyMode = 'guided'): TaskRun {
  let r = createTaskRun(turn, { difficultyMode: mode }, deps)
  for (const s of ['ppe', 'engineOff', 'turntable', 'direction', 'steer']) r = step(r, s)
  return r
}
/** 최소회전반경: 직진 복귀(return)까지(조향각은 받은 값으로 적음) */
export function turnToReturn(mode: DifficultyMode, left: string, right: string): TaskRun {
  return step(step(answer(answer(turnToSteer(mode), 'leftAngle', left), 'rightAngle', right), 'read'), 'return')
}
/** 과제 패널(작업 목록·기본 화면)을 서버 없이 그린다. 기록 창 자리는 넘기지 않는다 */
export function renderPanel(run: TaskRun): string {
  return renderToStaticMarkup(createElement(TaskScreen, {
    repo: {} as unknown as Repository,
    session: { recordId: 'r1', anonymousStudentCode: 'A-01' } as unknown as SessionContext,
    initialRun: run, onFinish: () => {}, embedded: true,
  }))
}
