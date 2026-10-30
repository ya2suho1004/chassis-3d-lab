// 과제 단계를 마치면 학생 캐릭터가 하는 몸짓(연출 전용 — 판정·기록과 무관, 단계를 마친 뒤에만 나오므로 다음 할 일을 알려 주지 않는다).
// 보호구 쓰기(Equip), 쪼그려 살펴보기(Crouch), 조작부 버튼 누르기(Press). 진입·페달은 차량 연출이 대신한다.

export type AvatarAction = 'Equip' | 'Crouch' | 'Press'

const BY_STEP: Record<string, AvatarAction> = {
  ppe: 'Equip',
  tire: 'Crouch',
  equip: 'Crouch',
  axle: 'Press',
  mode: 'Press',
  lower: 'Press',
  motor: 'Press',
  read: 'Press',
  off: 'Press',
}

export function actionForStep(stepId: string): AvatarAction | null {
  return BY_STEP[stepId] ?? null
}

/** 동작 길이(초) — build_character.py의 Crouch 2.4 · Press 1.4 · Equip 1.6과 같다 */
export const ACTION_SECONDS: Record<AvatarAction, number> = { Crouch: 2.4, Press: 1.4, Equip: 1.6 }

/** 몸짓을 할 때 바라볼 장비(없으면 그 자리) */
export function actionTarget(stepId: string, stepEquipment: string | null): string | null {
  return stepId === 'ppe' ? null : stepEquipment
}

/** 새로 끝난 단계·끄기 세부 단계를 찾아 몸짓 신호로 바꾼다(이전 → 지금) */
export function newCue(prev: { completed: string[]; off: string[] } | null, now: { completed: string[]; off: string[] }): string | null {
  if (!prev) return null
  const added = now.completed.filter((s) => !prev.completed.includes(s))
  if (added.length) return added[added.length - 1] ?? null
  if (now.off.length > prev.off.length) return 'off'
  return null
}
