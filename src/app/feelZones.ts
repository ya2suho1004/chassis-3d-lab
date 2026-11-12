// src/app/feelZones.ts
// 버튼 누름 소리의 허용 구역(설계 2026-11-12 §4.1): '딸깍'은 표시(data-feel="press")를 단 구역의 버튼에서만 난다.
// 표시가 없는 곳은 조용하다 — 기록 창·계산기·연습 창처럼 답을 적고 내는 곳에는 표시를 달지 않는다(§5-3).
// 새 화면을 더해도 표시를 달지 않으면 소리가 나지 않는다.

/** 이 판정에 쓰는 요소의 모양(브라우저의 Element가 이 모양을 채운다) */
interface FeelEl {
  closest(selector: string): FeelEl | null
  getAttribute(name: string): string | null
  disabled?: boolean
}

/** 누른 곳이 '딸깍'이 나는 버튼인지: 꺼지지 않은 버튼이고, 가장 가까운 data-feel 표시가 press일 때만 */
export function isPressTarget(target: FeelEl | null): boolean {
  const button = target?.closest('button') ?? null
  if (!button || button.disabled) return false
  return button.closest('[data-feel]')?.getAttribute('data-feel') === 'press'
}
