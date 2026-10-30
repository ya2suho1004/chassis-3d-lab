import { describe, expect, test } from 'vitest'
import { brakeRigState } from '../src/scene/brakeRig'
import type { OffSubStep } from '../src/domain/taskEngine'

const run = (completedSteps: string[], offProgress: OffSubStep[] = [], motorOn = false) => ({ completedSteps, offProgress, motorOn })
const UP_TO_ENTER = ['ppe', 'tire', 'equip', 'enter']

describe('제동력 시험기 연출 상태', () => {
  test('과제 수령 전에는 차량이 롤러 위, 정지', () => {
    expect(brakeRigState(null, 'north')).toEqual({ vehicle: 'onRollers', liftUp: false, rollersSpinning: false, braking: false })
  })

  test('진입 방향이 정해지면 진입 전 차량은 밖에서 대기하고, 진입하면 리프트 위에 올라간다', () => {
    expect(brakeRigState(run(['ppe']), 'south').vehicle).toBe('outside')
    expect(brakeRigState(run(UP_TO_ENTER), 'south')).toEqual({ vehicle: 'lifted', liftUp: true, rollersSpinning: false, braking: false })
  })

  test('리프트 하강 → 롤러 위, MOTOR ON → 롤러 회전', () => {
    expect(brakeRigState(run([...UP_TO_ENTER, 'axle', 'mode', 'lower']), 'north')).toEqual({ vehicle: 'onRollers', liftUp: false, rollersSpinning: false, braking: false })
    expect(brakeRigState(run([...UP_TO_ENTER, 'axle', 'mode', 'lower', 'motor'], [], true), 'north').rollersSpinning).toBe(true)
  })

  test('MOTOR OFF → 정지, 리프트 상승 → 들림, 차량 빼기 → 밖으로', () => {
    const steps = [...UP_TO_ENTER, 'axle', 'mode', 'lower', 'motor', 'press', 'read']
    expect(brakeRigState(run(steps, ['motorOff']), 'north')).toEqual({ vehicle: 'onRollers', liftUp: false, rollersSpinning: false, braking: false })
    expect(brakeRigState(run(steps, ['motorOff', 'liftUp']), 'north').vehicle).toBe('lifted')
    expect(brakeRigState(run(steps, ['motorOff', 'liftUp', 'exitVehicle']), 'north').vehicle).toBe('outside')
  })

  test('페달 단계 뒤 판독 전, 모터가 돌면 제동 중(브레이크등·뒷바퀴 멈춤)', () => {
    const upToMotor = [...UP_TO_ENTER, 'axle', 'mode', 'lower', 'motor']
    expect(brakeRigState(run(upToMotor, [], true), 'north').braking).toBe(false)
    expect(brakeRigState(run([...upToMotor, 'press'], [], true), 'north').braking).toBe(true)
    expect(brakeRigState(run([...upToMotor, 'press', 'read'], [], true), 'north').braking).toBe(false)
    expect(brakeRigState(run([...upToMotor, 'press'], [], false), 'north').braking).toBe(false)
  })

  test('진입 방향 미설정이면 진입·이탈 연출 없이 롤러 자리에 둔다(U6)', () => {
    expect(brakeRigState(run(['ppe']), null).vehicle).toBe('lifted')
    expect(brakeRigState(run([...UP_TO_ENTER, 'axle', 'mode', 'lower', 'motor', 'press', 'read'], ['motorOff', 'liftUp', 'exitVehicle']), null).vehicle).toBe('lifted')
  })
})
