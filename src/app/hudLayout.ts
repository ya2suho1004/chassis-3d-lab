// 게임 화면 겹침 측정(2026-11-10, Codex 회의 지적 10). CSS 글자가 아니라 실제 화면의 상자 위치로 잰다.
// 개발 서버에서 window.__hudOverlaps()로 부른다(src/main.tsx — 그 함수는 운영 빌드에 달지 않는다).
// 부품 목록과 상자 재기(hudBoxes)는 실습 화면도 쓴다: 목적지 방향 화살표가 이 부품들을 피해 서게 한다(설계 2026-11-12 §4.5).
// 화면 위에 떠 있는 부품(styles.css의 position:absolute 규칙)은 모두 HUD_PARTS나 HUD_EXCLUDED에 있어야 한다(tests/hudLayout.test.ts).

export interface Box { name: string; left: number; top: number; right: number; bottom: number }
export interface Overlap { a: string; b: string; width: number; height: number }

/** 목적지 방향 화살표의 이름. 화살표는 다른 부품의 자리를 재서 피해 서므로, 띠를 만들 때는 화살표 자신의 상자를 뺀다 */
export const ARROW_PART_NAME = '방향 화살표'

/** 함께 떠 있을 때 서로 겹치면 안 되는 게임 화면 부품 */
export const HUD_PARTS: ReadonlyArray<{ name: string; selector: string }> = [
  { name: '상태 줄', selector: '.g-status' },
  { name: '의뢰 카드', selector: '.g-quest' },
  { name: '장비 설명', selector: '.g-info' },
  { name: '안내 줄', selector: '.g-hud' },
  { name: '조이스틱', selector: '.joystick' },
  { name: '질문 버튼', selector: '.g-chatbtn' },
  { name: '행동 버튼', selector: '.g-actions' },
  { name: '가운데 버튼', selector: '.g-gaugebtn' },
  { name: '측정판 버튼 줄', selector: '.g-ttbar' },
  { name: '연습 창', selector: '.g-practice' },
  { name: '조준 버튼', selector: '.g-aim' },
  { name: ARROW_PART_NAME, selector: '.g-goalarrow' },
]

/** 겹침을 재지 않는 것과 그 이유 */
export const HUD_EXCLUDED: Readonly<Record<string, string>> = {
  '.g-menu': '눌러서 여는 메뉴. 닫으면 사라진다',
  '.g-toast': '닫기 전까지 위를 덮는 알림. 닫기 버튼이 있다',
  '.g-drawer': '작업 목록 서랍. 화면을 덮는 창이다',
  '.g-chat': 'AI 질문 창. 화면을 덮는 창이다',
  '.g-dialog': '교관 대화. 화면 전체를 덮는다',
  '.g-guide': '처음 한 번 뜨는 조작 안내 창',
  '.g-loading': '처음 불러오는 동안의 화면',
  '.g-loading .ia': '불러오기 화면의 배경 그림',
  '.g-note': '잠깐 떴다 사라지는 품질 안내',
  '.g-loadnote': '잠깐 떴다 사라지는 불러오기 안내',
  '.g-reticle': '1인칭 화면 가운데 점. 일부러 가운데에 둔다',
  '.g-bubble::after': '대화 말풍선 꼬리',
  '.g-name': '대화 말풍선 안의 이름표',
  '.g-more': '대화 말풍선 안의 넘기기 표시',
  '.g-recordwrap': '기록 창의 어두운 바탕. 게임 화면 전체를 덮는다',
  '.g-record': '기록 창. 바탕 위에 뜨는 창이라 다른 부품과 겹쳐도 된다(창 안 배치는 브라우저로 확인)',
}

export function findOverlaps(boxes: Box[], tolerance = 0): Overlap[] {
  const out: Overlap[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (width > tolerance && height > tolerance) out.push({ a: a.name, b: b.name, width: Math.round(width), height: Math.round(height) })
    }
  }
  return out
}

interface Measurable { getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number }; closest(sel: string): unknown }

function visible(el: Measurable): boolean {
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0 || el.closest('[hidden]')) return false
  if (typeof getComputedStyle === 'function') {
    const s = getComputedStyle(el as unknown as Element)
    if (s.visibility === 'hidden' || s.display === 'none') return false
  }
  return true
}

/** 지금 화면에 보이는 부품의 상자 */
export function hudBoxes(root: ParentNode): Box[] {
  const boxes: Box[] = []
  for (const part of HUD_PARTS) {
    root.querySelectorAll(part.selector).forEach((node) => {
      const el = node as unknown as Measurable
      if (!visible(el)) return
      const r = el.getBoundingClientRect()
      boxes.push({ name: part.name, left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) })
    })
  }
  return boxes
}

/** 지금 화면에 보이는 부품의 상자를 재고 겹친 짝을 돌려준다 */
export function measureHud(root: ParentNode, view: { innerWidth: number; innerHeight: number }) {
  const boxes = hudBoxes(root)
  return { viewport: { width: view.innerWidth, height: view.innerHeight }, boxes, overlaps: findOverlaps(boxes) }
}
