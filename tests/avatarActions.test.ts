// 단계를 마친 뒤 학생 캐릭터 몸짓 고르기
import { describe, expect, it } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { ACTION_SECONDS, actionForStep, actionTarget, newCue } from '../src/scene/avatarActions'
import { CHARACTER_CLIPS } from '../src/scene/models/CharacterModel'

describe('학생 몸짓', () => {
  it('보호구 = 쓰기, 타이어·설비 점검 = 쪼그려 살펴보기, 조작부 단계 = 버튼 누르기', () => {
    expect(actionForStep('ppe')).toBe('Equip')
    expect(actionForStep('tire')).toBe('Crouch')
    for (const s of ['axle', 'mode', 'lower', 'motor', 'read', 'off']) expect(actionForStep(s)).toBe('Press')
    expect(actionForStep('press')).toBeNull()
    expect(actionForStep('calc')).toBeNull()
  })
  it('몸짓 이름은 캐릭터 모델에 있는 동작이다', () => {
    for (const a of Object.keys(ACTION_SECONDS)) expect(CHARACTER_CLIPS).toContain(a)
  })
  it('과제 단계 ID는 모두 알려진 것(없는 ID에 몸짓을 걸지 않음)', () => {
    const ids = (lv1 as { steps: Array<{ stepId: string }> }).steps.map((s) => s.stepId)
    for (const id of ['ppe', 'tire', 'equip', 'axle', 'mode', 'lower', 'motor', 'read', 'off']) expect(ids).toContain(id)
  })
  it('보호구는 그 자리에서, 나머지는 단계 장비를 바라본다', () => {
    expect(actionTarget('ppe', null)).toBeNull()
    expect(actionTarget('axle', 'brake-control-panel-01')).toBe('brake-control-panel-01')
  })
  it('새로 끝난 단계·끄기 세부 단계만 신호로 바꾼다', () => {
    expect(newCue(null, { completed: ['ppe'], off: [] })).toBeNull()
    expect(newCue({ completed: [], off: [] }, { completed: ['ppe'], off: [] })).toBe('ppe')
    expect(newCue({ completed: ['ppe'], off: [] }, { completed: ['ppe'], off: [] })).toBeNull()
    expect(newCue({ completed: ['ppe'], off: [] }, { completed: ['ppe'], off: ['motorOff'] })).toBe('off')
  })
})
