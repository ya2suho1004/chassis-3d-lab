// src/app/reactions.ts
// 손맛 반응 규칙표(설계 2026-11-12 §4.1, 앞선 설계 2026-11-06 §5). 이미 일어난 일에 대한 반응만 다룬다.
// 표가 받는 것은 사건 이름, 움직임 줄이기, 소리 켬뿐이다. 도움 방식·다음에 할 일·답이 맞았는지·잰 값을 받을 자리가 없다(설계 §5-1).
// 그래서 안내가 있든 없든 결과가 같고, 반응이 답의 단서가 될 수 없다. 이 파일은 아무것도 들여오지 않는다(시험이 확인).

/** 사건: 화면에 이미 일어난 일 */
export const REACTION_EVENTS = ['sceneTap', 'uiPress', 'liftMove', 'bigLiftMove', 'vehicleMove', 'pedalDown', 'steerLimit', 'ppeOn', 'stepDone', 'codexNew', 'inspectionPassed'] as const
export type ReactionEvent = (typeof REACTION_EVENTS)[number]

/** 보이는 반응 */
export const EFFECTS = ['tapRing', 'checkPop', 'sparkle', 'codexPop', 'codexChip', 'stamp', 'confetti'] as const
export type Effect = (typeof EFFECTS)[number]

/** 규칙표가 부르는 소리 이름(만드는 쪽은 src/scene/sound.ts). liftLong은 lift를 길게 낸 것 */
export const REACTION_CUES = ['tap', 'press', 'lift', 'liftLong', 'vehicle', 'pedal', 'tick', 'stepDone', 'ppe', 'codex', 'stamp', 'celebrate'] as const
export type ReactionCue = (typeof REACTION_CUES)[number]
/** 소리 하나와 늦춤(초) */
export interface CuePlay { name: ReactionCue; delay: number }
export interface Reaction { effects: readonly Effect[]; cues: readonly CuePlay[] }

/** effects: 보이는 반응 · still: 움직임 줄이기일 때 남기는 정지 표시 · cues: 소리 */
const RULES: Record<ReactionEvent, { effects: Effect[]; still: Effect[]; cues: CuePlay[] }> = {
  sceneTap: { effects: ['tapRing'], still: [], cues: [{ name: 'tap', delay: 0 }] }, // 장비·교관을 눌렀다
  uiPress: { effects: [], still: [], cues: [{ name: 'press', delay: 0 }] }, // 허용 구역의 버튼을 눌렀다
  liftMove: { effects: [], still: [], cues: [{ name: 'lift', delay: 0 }] }, // 시험기 리프트 판이 오르내린다
  bigLiftMove: { effects: [], still: [], cues: [{ name: 'liftLong', delay: 0 }] }, // 보기용 리프트를 올리거나 내렸다
  vehicleMove: { effects: [], still: [], cues: [{ name: 'vehicle', delay: 0 }] }, // 차량이 들어오거나 나간다
  pedalDown: { effects: [], still: [], cues: [{ name: 'pedal', delay: 0 }] }, // 차량이 제동 중 모습이 됐다
  steerLimit: { effects: [], still: [], cues: [{ name: 'tick', delay: 0 }] }, // 핸들이 조작 한계에 닿았다 — 각도가 맞았다는 신호가 아니다
  ppeOn: { effects: ['sparkle'], still: [], cues: [{ name: 'ppe', delay: 0 }] },
  stepDone: { effects: ['checkPop'], still: [], cues: [{ name: 'stepDone', delay: 0.12 }] }, // 같은 순간의 조작 소리와 뭉개지지 않게 조금 늦춘다
  codexNew: { effects: ['codexPop', 'codexChip'], still: ['codexChip'], cues: [{ name: 'codex', delay: 0.06 }] },
  inspectionPassed: { effects: ['stamp', 'confetti'], still: ['stamp'], cues: [{ name: 'stamp', delay: 0.3 }, { name: 'celebrate', delay: 0.55 }] }, // 도장이 내려앉는 0.3초에 쾅
}

export function reactionsFor(ev: ReactionEvent, o: { reducedMotion: boolean; sound: boolean }): Reaction {
  const r = RULES[ev]
  return { effects: o.reducedMotion ? r.still : r.effects, cues: o.sound ? r.cues : [] }
}

/** 결과 화면의 반응: 검사 통과일 때만 있다. 통과가 아니면 연출도 소리도 없다 — 아쉬움을 알리는 반응은 넣지 않는다(설계 2026-11-12 §4.6) */
export function resultReaction(passed: boolean, o: { reducedMotion: boolean; sound: boolean }): Reaction | null {
  return passed ? reactionsFor('inspectionPassed', o) : null
}

/** 새로 끝난 단계 하나 → 사건들. advanced는 끝난 단계 수가 늘었는지(종료 단계의 하위 행동은 늘지 않는다) */
export function eventsForStep(stepId: string, advanced: boolean): ReactionEvent[] {
  const out: ReactionEvent[] = []
  if (stepId === 'ppe') out.push('ppeOn')
  if (stepId === 'steer') out.push('steerLimit')
  if (advanced) out.push('stepDone')
  return out
}

/** 브라우저의 움직임 줄이기 설정 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
