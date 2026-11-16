// 도감 카드 줄(설계 docs/superpowers/specs/2026-11-16-codex-window-design.md §3-2) — 화면과 뗀 순수 함수.
// 순서는 배치 자료(layout.equipment) 순서로 고정한다(모으기 순서로 정렬하지 않는다).
// 못 본 장비는 번호 말고는 아무것도 싣지 않는다 — 이름·설명·종류가 화면(DOM)에 들어갈 길을 처음부터 없앤다.
// 과제와 관련된 값(작동 장비, 단계, 다음 장비, 정오)은 받지도 싣지도 않는다.

export interface CodexEquipment { id: string; label: string; kind: string; info: string }

export type CodexCard =
  | { id: string; seen: true; kind: string; label: string; info: string }
  | { id: string; seen: false }

export function codexCards(equipment: readonly CodexEquipment[], collected: readonly string[]): CodexCard[] {
  const have = new Set(collected)
  return equipment.map((e) => (have.has(e.id) ? { id: e.id, seen: true, kind: e.kind, label: e.label, info: e.info } : { id: e.id, seen: false }))
}

/** 머리 숫자: 배치에 있는 모은 장비 수 / 배치 장비 수 */
export function codexCount(equipment: readonly CodexEquipment[], collected: readonly string[]): { have: number; total: number } {
  const have = new Set(collected)
  return { have: equipment.filter((e) => have.has(e.id)).length, total: equipment.length }
}
