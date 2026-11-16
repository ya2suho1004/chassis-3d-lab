// 학생 머리 위 닉네임(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 1-1).
// 화면 표시만 — 닉네임은 기록·서버·AI 요청에 넣지 않는다.
import { bodyScale, type BodyType } from '../app/avatar'
import { STUDENT_HEIGHT } from './models/CharacterModel'
import type { ViewMode } from './viewMode'

/** 키 위 간격(m) — 머리 바로 위. 교관 이름표(+0.33)만큼 띄우면 따라가기 시점에서 머리와 떨어져 뒤쪽 물건에 붙은 것처럼 보였다(2026-11-16 화면 확인) */
export const NAME_TAG_GAP = 0.15

/** 이름표 높이: 체형에 맞춘 키 + 간격 */
export function studentNameTagY(body: BodyType): number {
  return STUDENT_HEIGHT * bodyScale(body) + NAME_TAG_GAP
}

/** 학생 캐릭터(와 이름표)가 보이는가: 장면 연출 중(교관 대화·가까이 보기·연습)과 1인칭에서는 숨는다 */
export function studentShown(frozen: boolean, view: ViewMode): boolean {
  return !frozen && view !== 'first'
}
