// tests/feelEvents.test.ts — 손맛 사건 뽑기(설계 2026-11-12 §4.2): 제동 장치 모습의 앞뒤 → 사건
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rigEvents, type RigLook } from '../src/app/feelEvents'
import type { OffSubStep } from '../src/domain/taskEngine'
import { brakeRigState } from '../src/scene/brakeRig'

const outside: RigLook = { vehicle: 'outside', liftUp: true, braking: false }

describe('rigEvents — 보이는 움직임만 사건이 된다', () => {
  it('앞 모습이 없으면 아무것도 내지 않는다(과제를 막 받았거나 이어 하기로 돌아온 순간은 장면 준비다)', () => {
    expect(rigEvents(null, outside)).toEqual([])
    expect(rigEvents(null, { vehicle: 'onRollers', liftUp: false, braking: true })).toEqual([])
  })
  it('앞뒤가 같으면 빈 목록', () => {
    expect(rigEvents(outside, { ...outside })).toEqual([])
  })
  it('리프트 판이 오르내리면 liftMove(올라갈 때도 내려갈 때도)', () => {
    const up: RigLook = { vehicle: 'lifted', liftUp: true, braking: false }
    const down: RigLook = { vehicle: 'onRollers', liftUp: false, braking: false }
    expect(rigEvents(up, down)).toEqual(['liftMove'])
    expect(rigEvents(down, up)).toEqual(['liftMove'])
  })
  it('차량이 바깥에서 들어오거나 바깥으로 나가면 vehicleMove', () => {
    const lifted: RigLook = { vehicle: 'lifted', liftUp: true, braking: false }
    expect(rigEvents(outside, lifted)).toEqual(['vehicleMove'])
    expect(rigEvents(lifted, outside)).toEqual(['vehicleMove'])
  })
  it('제동 중 모습이 되면 pedalDown, 풀릴 때는 소리가 없다', () => {
    const rolling: RigLook = { vehicle: 'onRollers', liftUp: false, braking: false }
    expect(rigEvents(rolling, { ...rolling, braking: true })).toEqual(['pedalDown'])
    expect(rigEvents({ ...rolling, braking: true }, rolling)).toEqual([])
  })
  it('한 번에 둘이 바뀌면 둘 다 낸다', () => {
    expect(rigEvents(outside, { vehicle: 'onRollers', liftUp: false, braking: false })).toEqual(['liftMove', 'vehicleMove'])
  })
})

describe('rigEvents — 제동력 과제의 실제 흐름(brakeRigState가 만든 모습)', () => {
  const look = (completed: string[], off: OffSubStep[] = [], motorOn = false) => brakeRigState({ completedSteps: completed, offProgress: off, motorOn }, 'north')
  const pre = ['ppe', 'tire', 'equip']
  const flow: Array<[string, RigLook, string[]]> = [
    ['차량 진입', look([...pre, 'enter']), ['vehicleMove']],
    ['축 선택·모드 선택(보이는 움직임 없음)', look([...pre, 'enter', 'axle', 'mode']), []],
    ['리프트 하강', look([...pre, 'enter', 'axle', 'mode', 'lower']), ['liftMove']],
    ['모터 켜기(회전음은 사건이 아니라 상태에 묶는다)', look([...pre, 'enter', 'axle', 'mode', 'lower', 'motor'], [], true), []],
    ['페달 밟기', look([...pre, 'enter', 'axle', 'mode', 'lower', 'motor', 'press'], [], true), ['pedalDown']],
    ['판독(제동 풀림)', look([...pre, 'enter', 'axle', 'mode', 'lower', 'motor', 'press', 'read'], [], true), []],
    ['모터 정지', look([...pre, 'enter', 'axle', 'mode', 'lower', 'motor', 'press', 'read'], ['motorOff']), []],
    ['리프트 상승', look([...pre, 'enter', 'axle', 'mode', 'lower', 'motor', 'press', 'read'], ['motorOff', 'liftUp']), ['liftMove']],
    ['차량 빼기', look([...pre, 'enter', 'axle', 'mode', 'lower', 'motor', 'press', 'read'], ['motorOff', 'liftUp', 'exitVehicle']), ['vehicleMove']],
  ]
  it('단계마다 그 움직임의 사건만 난다', () => {
    let prev: RigLook = look(pre)
    for (const [name, next, want] of flow) {
      expect(rigEvents(prev, next), name).toEqual(want)
      prev = next
    }
  })
})

describe('사건 뽑기가 받지 않는 것(설계 §5-1)', () => {
  const src = readFileSync('src/app/feelEvents.ts', 'utf8')
  it('규칙표의 사건 이름 형만 들여온다(과제 상태·채점·기록을 볼 길이 없다)', () => {
    const only = "import type { ReactionEvent } from './reactions'"
    expect(src.match(/^import .*$/gm)).toEqual([only])
    expect(src.replace(only, '')).not.toMatch(/\bimport\b|\bfrom\s+['"]|\brequire\(/)
  })
  it('모드·다음 단계·정답·채점·판독값을 가리키는 이름이 없다', () => {
    expect(src).not.toMatch(/difficultyMode|guided|nextStep|correct|grading|firstAnswer|firstInput|readout|measurement/i)
  })
})

describe('rigEvents — 경계: 과제를 받는 순간, 진입 방향을 정하지 않은 세션', () => {
  it('과제를 받는 순간: 둘러보기 모습을 앞 모습으로 두면 누르지 않은 리프트·차량 사건이 난다. 그래서 화면은 과제가 없는 동안 앞 모습을 비운다', () => {
    const tour = brakeRigState(null, 'north')
    const start = brakeRigState({ completedSteps: [], offProgress: [], motorOn: false }, 'north')
    expect(rigEvents(tour, start)).toEqual(['liftMove', 'vehicleMove']) // 비우지 않았다면 났을 가짜 사건
    expect(rigEvents(null, start)).toEqual([]) // 화면이 하는 대로 비우면 나지 않는다
  })
  it('진입 방향을 정하지 않은 세션: 차량이 바깥에 서는 모습이 없어 진입과 빼기에서 차량 사건이 없다(리프트 사건은 그대로)', () => {
    const look = (completed: string[], off: OffSubStep[] = []) => brakeRigState({ completedSteps: completed, offProgress: off, motorOn: false }, null)
    const pre = ['ppe', 'tire', 'equip']
    const measured = [...pre, 'enter', 'axle', 'mode', 'lower', 'motor', 'press', 'read']
    expect(rigEvents(look(pre), look([...pre, 'enter']))).toEqual([])
    expect(rigEvents(look([...pre, 'enter', 'axle', 'mode']), look([...pre, 'enter', 'axle', 'mode', 'lower']))).toEqual(['liftMove'])
    expect(rigEvents(look(measured, ['motorOff', 'liftUp']), look(measured, ['motorOff', 'liftUp', 'exitVehicle']))).toEqual([])
  })
})
