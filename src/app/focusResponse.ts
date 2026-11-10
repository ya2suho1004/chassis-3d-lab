// 기록 칸으로 이동(2026-11-10). "값을 먼저 입력하세요" 안내에서 그 칸을 가운데로 보이고 초점을 준다.
// 학생이 고른 단계에 필요한 칸만 가리키므로 정답이나 다음 단계를 드러내지 않는다.
export const responseInputId = (itemId: string, prefix = 'resp-') => `${prefix}${itemId}`
/** 기록 창 칸 id(설계 2026-11-10 §9). 작업 목록 칸과 같은 화면에 함께 붙어 있어도 겹치지 않게 */
export const recordInputId = (itemId: string) => responseInputId(itemId, 'rec-')

interface Focusable { scrollIntoView(o?: ScrollIntoViewOptions): void; focus(o?: FocusOptions): void }

/** 칸이 있으면 가운데로 스크롤하고 초점을 준다. 없으면 false */
export function focusResponse(doc: Pick<Document, 'getElementById'>, itemId: string): boolean {
  const el = doc.getElementById(responseInputId(itemId)) as unknown as Focusable | null
  if (!el) return false
  el.scrollIntoView({ block: 'center' })
  el.focus({ preventScroll: true })
  return true
}
