// 최소회전반경 차량 연출: 조향 단계 사이에서만 사례 각도, 좌회전 +, 앞바퀴 세계 좌표
import { describe, expect, it } from 'vitest'
import lv1Raw from '../src/data/tasks/task.min-turning-radius.case-lv1.json'
import lv2Raw from '../src/data/tasks/task.min-turning-radius.case-lv2.json'
import { createTaskRun, type TaskRun } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'
import { frontWheelWorld, turningRigState } from '../src/scene/turningRig'

const withSteps = (t: unknown, steps: string[]): TaskRun => ({ ...createTaskRun(t as ApprovedTask, { difficultyMode: 'guided' }), completedSteps: steps })

describe('최소회전반경 차량 연출', () => {
  it('조향 전·되돌린 뒤는 직진, 그 사이는 사례 각도(좌회전 +, 우회전 −)', () => {
    expect(turningRigState(withSteps(lv1Raw, ['ppe', 'engineOff']))).toEqual({ leftDeg: 0, rightDeg: 0 })
    expect(turningRigState(withSteps(lv1Raw, ['ppe', 'engineOff', 'turntable', 'direction', 'steer']))).toEqual({ leftDeg: 35, rightDeg: 30 })
    expect(turningRigState(withSteps(lv2Raw, ['steer', 'read']))).toEqual({ leftDeg: -32, rightDeg: -36 })
    expect(turningRigState(withSteps(lv2Raw, ['steer', 'read', 'return']))).toEqual({ leftDeg: 0, rightDeg: 0 })
    expect(turningRigState(null)).toEqual({ leftDeg: 0, rightDeg: 0 })
  })
  it('차가 x 방향(앞 = −x)이면 왼쪽 앞바퀴는 앞쪽·남쪽(+z), 바깥은 +z', () => {
    const e = { x: 4.45, z: 4.55, w: 4.56, d: 1.78 }
    expect(frontWheelWorld(e, 'left')).toEqual({ x: 4.45 - 1.38, z: 4.55 + 0.775, outX: 0, outZ: 1 })
    const r = frontWheelWorld(e, 'right')
    expect(r.x).toBeCloseTo(3.07, 9); expect(r.z).toBeCloseTo(3.775, 9); expect(r.outZ).toBe(-1)
  })
})
