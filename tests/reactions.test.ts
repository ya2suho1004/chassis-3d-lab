// tests/reactions.test.ts — 손맛 반응 규칙표(설계 2026-11-12 §4.1·§5, 앞선 설계 2026-11-06 §5)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EFFECTS, eventsForStep, reactionsFor, REACTION_CUES, REACTION_EVENTS, type ReactionEvent } from '../src/app/reactions'

const on = { reducedMotion: false, sound: true }

describe('규칙표의 사건', () => {
  it('사건은 열한 가지다', () => {
    expect([...REACTION_EVENTS]).toEqual(['sceneTap', 'uiPress', 'liftMove', 'bigLiftMove', 'vehicleMove', 'pedalDown', 'steerLimit', 'ppeOn', 'stepDone', 'codexNew', 'inspectionPassed'])
  })
})

describe('reactionsFor — 사건별 반응(움직임 허용, 소리 켬)', () => {
  const want: Record<ReactionEvent, { effects: string[]; cues: Array<[string, number]> }> = {
    sceneTap: { effects: ['tapRing'], cues: [['tap', 0]] },
    uiPress: { effects: [], cues: [['press', 0]] },
    liftMove: { effects: [], cues: [['lift', 0]] },
    bigLiftMove: { effects: [], cues: [['liftLong', 0]] },
    vehicleMove: { effects: [], cues: [['vehicle', 0]] },
    pedalDown: { effects: [], cues: [['pedal', 0]] },
    steerLimit: { effects: [], cues: [['tick', 0]] },
    ppeOn: { effects: ['sparkle'], cues: [['ppe', 0]] },
    stepDone: { effects: ['checkPop'], cues: [['stepDone', 0.12]] },
    codexNew: { effects: ['codexPop', 'codexChip'], cues: [['codex', 0.06]] },
    inspectionPassed: { effects: ['stamp', 'confetti'], cues: [['stamp', 0.3], ['celebrate', 0.55]] },
  }
  for (const ev of REACTION_EVENTS) it(ev, () => {
    const r = reactionsFor(ev, on)
    expect([...r.effects]).toEqual(want[ev].effects)
    expect(r.cues.map((c) => [c.name, c.delay])).toEqual(want[ev].cues)
  })
})

describe('reactionsFor — 소리와 움직임 줄이기', () => {
  it('소리가 꺼져 있으면 어떤 사건도 소리를 내지 않는다(보이는 반응은 그대로)', () => {
    for (const ev of REACTION_EVENTS) {
      const r = reactionsFor(ev, { reducedMotion: false, sound: false })
      expect(r.cues).toEqual([])
      expect([...r.effects]).toEqual([...reactionsFor(ev, on).effects])
    }
  })
  it('움직임 줄이기: 움직이는 반응을 빼고 정지 표시(도장, 도감 꼬리표)만 남긴다. 소리는 그대로', () => {
    for (const ev of REACTION_EVENTS) {
      const r = reactionsFor(ev, { reducedMotion: true, sound: true })
      expect([...r.effects]).toEqual(ev === 'inspectionPassed' ? ['stamp'] : ev === 'codexNew' ? ['codexChip'] : [])
      expect(r.cues).toEqual(reactionsFor(ev, on).cues)
    }
  })
  it('규칙표가 부르는 소리는 모두 소리 목록에 있고, 목록의 소리는 모두 쓰인다', () => {
    const used = new Set(REACTION_EVENTS.flatMap((ev) => reactionsFor(ev, on).cues.map((c) => c.name)))
    expect([...used].sort()).toEqual([...REACTION_CUES].sort())
  })
  it('보이는 반응은 일곱 가지이고, 목록의 반응은 모두 어느 사건에선가 쓰인다', () => {
    expect([...EFFECTS]).toEqual(['tapRing', 'checkPop', 'sparkle', 'codexPop', 'codexChip', 'stamp', 'confetti'])
    const used = new Set(REACTION_EVENTS.flatMap((ev) => [...reactionsFor(ev, on).effects]))
    expect([...used].sort()).toEqual([...EFFECTS].sort())
  })
  it('늦춤은 0초 이상 1초 미만이다(반응은 조작과 함께 시작한다)', () => {
    for (const ev of REACTION_EVENTS) for (const c of reactionsFor(ev, on).cues) {
      expect(c.delay).toBeGreaterThanOrEqual(0)
      expect(c.delay).toBeLessThan(1)
    }
  })
})

describe('규칙표가 받지 않는 것(설계 §5-1)', () => {
  const src = readFileSync('src/app/reactions.ts', 'utf8')
  it('인자는 사건 이름과 설정 두 가지뿐이다 — 모드를 받지 않는다', () => {
    expect(reactionsFor.length).toBe(2)
    expect(src).toContain('export function reactionsFor(ev: ReactionEvent, o: { reducedMotion: boolean; sound: boolean }): Reaction {')
  })
  it('아무것도 들여오지 않는다(과제 상태·채점·기록을 볼 길이 없다)', () => {
    expect(src).not.toMatch(/\bimport\b|\bfrom\s+['"]|\brequire\(/)
  })
  it('모드·다음 단계·정답·채점·판독값을 가리키는 이름이 없다', () => {
    expect(src).not.toMatch(/difficultyMode|guided|nextStep|correct|grading|firstAnswer|firstInput|readout|measurement/i)
  })
})

describe('eventsForStep — 새로 끝난 단계 → 사건들', () => {
  it('보호구는 반짝임과 단계 완료, 핸들은 딸깍과 단계 완료, 그 밖은 단계 완료', () => {
    expect(eventsForStep('ppe', true)).toEqual(['ppeOn', 'stepDone'])
    expect(eventsForStep('steer', true)).toEqual(['steerLimit', 'stepDone'])
    expect(eventsForStep('turntable', true)).toEqual(['stepDone'])
  })
  it('끝난 단계 수가 늘지 않으면(종료 단계의 하위 행동) 단계 완료가 없다', () => {
    expect(eventsForStep('off', false)).toEqual([])
    expect(eventsForStep('steer', false)).toEqual(['steerLimit'])
    expect(eventsForStep('ppe', false)).toEqual(['ppeOn'])
  })
})
