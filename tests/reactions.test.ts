// tests/reactions.test.ts — 손맛 반응 규칙(설계 §5, §2-3·§2-6)
import { describe, expect, it } from 'vitest'
import { reactionsFor, reactionEventForStep, type ReactionEvent } from '../src/app/reactions'

const EVENTS: ReactionEvent[] = ['stepDone', 'steerLimit', 'ppeOn', 'inspectionPassed']

describe('reactionsFor', () => {
  it('안내 있음·안내 없음에서 똑같다(다음 단계 단서가 끼어들 자리 없음)', () => {
    for (const ev of EVENTS) for (const reducedMotion of [false, true]) for (const sound of [false, true])
      expect(reactionsFor(ev, { mode: 'unguided', reducedMotion, sound })).toEqual(reactionsFor(ev, { mode: 'guided', reducedMotion, sound }))
  })
  it('사건별 연출', () => {
    const o = { mode: 'guided' as const, reducedMotion: false, sound: true }
    expect(reactionsFor('stepDone', o)).toEqual(['checkPop'])
    expect(reactionsFor('steerLimit', o)).toEqual(['tick'])
    expect(reactionsFor('ppeOn', o)).toEqual(['sparkle'])
    expect(reactionsFor('inspectionPassed', o)).toEqual(['stamp', 'confetti'])
  })
  it('소리는 켰을 때만', () => {
    expect(reactionsFor('steerLimit', { mode: 'guided', reducedMotion: false, sound: false })).toEqual([])
  })
  it('움직임 줄이기: 움직이는 연출을 빼고 도장은 정지 표시로 남긴다', () => {
    const o = { mode: 'guided' as const, reducedMotion: true, sound: false }
    expect(reactionsFor('stepDone', o)).toEqual([])
    expect(reactionsFor('ppeOn', o)).toEqual([])
    expect(reactionsFor('inspectionPassed', o)).toEqual(['stamp'])
  })
})

describe('reactionEventForStep — 새로 끝난 단계 → 사건', () => {
  it('보호구·핸들 끝·그 밖', () => {
    expect(reactionEventForStep('ppe')).toBe('ppeOn')
    expect(reactionEventForStep('steer')).toBe('steerLimit')
    expect(reactionEventForStep('turntable')).toBe('stepDone')
  })
})
