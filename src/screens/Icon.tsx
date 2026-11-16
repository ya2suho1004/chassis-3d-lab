// 직접 그린 작은 선 아이콘(설계 docs/superpowers/specs/2026-11-06-cozy-workshop-design.md §3).
// 이모지는 태블릿 글꼴마다 다르게(또는 빈 네모로) 보여서 게임 화면 버튼의 컬러 이모지를 이것으로 바꾼다(2026-11-07).
// 24×24 격자, 둥근 선 끝, 글자색(currentColor)을 따른다. 뜻은 버튼 글자·aria-label이 전하므로 아이콘은 화면 낭독기에서 숨긴다.
import type { ReactElement } from 'react'

const dot = (cx: number, cy: number) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.4" fill="currentColor" stroke="none" />

const PATHS = {
  /** 시점 바꾸기 — 비디오카메라 */
  camera: <><rect x="2.5" y="7" width="12.5" height="10" rx="2.5" /><path d="M15 10.5l5.5-3v9l-5.5-3z" /></>,
  /** 소리 켜짐 — 스피커 + 물결 두 줄 */
  soundOn: <><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  /** 소리 꺼짐 — 스피커 + × */
  soundOff: <><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>,
  /** 대화 — 둥근 말풍선 + 점 세 개 */
  talk: <><path d="M6 4.5h12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-6l-4.5 3.5v-3.5H6a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z" />{[8, 12, 16].map((x) => dot(x, 10.5))}</>,
  /** 살펴보기 — 돋보기 */
  look: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></>,
  /** 계기 보기 — 둥근 눈금판 + 바늘 */
  gauge: <><circle cx="12" cy="13" r="8" /><path d="M12 13l4.2-4.2" /><path d="M6.2 13h1.4M16.4 13h1.4M12 6.6V8" />{dot(12, 13)}</>,
  /** 공구 — 스패너 */
  wrench: <path d="M14.8 3.8a4.4 4.4 0 0 0-5.3 5.6L3.9 15a2 2 0 0 0 2.9 2.9l5.6-5.6a4.4 4.4 0 0 0 5.6-5.3l-2.7 2.7-2.6-.5-.5-2.6z" />,
  /** 무작위 뽑기 — 주사위(점 3) */
  dice: <><rect x="4" y="4" width="16" height="16" rx="3.5" />{dot(8.5, 8.5)}{dot(12, 12)}{dot(15.5, 15.5)}</>,
  /** 걷기 — 조이스틱 */
  joystick: <><rect x="5" y="16" width="14" height="4.5" rx="2" /><path d="M12 16v-6" /><circle cx="12" cy="7" r="3" /></>,
  /** 끌어서 둘러보기 — 네 방향 화살표 */
  drag: <><path d="M12 3.5v17M3.5 12h17" /><path d="M9.5 6L12 3.5 14.5 6M9.5 18l2.5 2.5 2.5-2.5M6 9.5L3.5 12 6 14.5M18 9.5l2.5 2.5-2.5 2.5" /></>,
  /** 도감 — 펼친 책(설계 2026-11-16 도감 창) */
  book: <><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" /><path d="M12 6.5v13" /></>,
  // 도감 카드의 장비 종류 그림(배치 자료의 kind마다 하나). 실제 제품 모양이 아니라 종류만 알아보게 단순하게 그린다
  /** 제동력 시험기 — 바닥판 위 롤러 둘 */
  roller: <><path d="M3 18.5h18" /><circle cx="8" cy="13" r="3.5" /><circle cx="16" cy="13" r="3.5" />{dot(8, 13)}{dot(16, 13)}</>,
  /** 조작부 — 표시창과 버튼 */
  panel: <><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><rect x="7" y="6.5" width="10" height="5" rx="1" />{dot(8.5, 15.5)}{dot(12, 15.5)}{dot(15.5, 15.5)}</>,
  /** 기록 책상 — 책상 위 기록표 */
  desk: <><path d="M3 13h18M5.5 13v6.5M18.5 13v6.5" /><rect x="8" y="3.5" width="8" height="7" rx="1" /><path d="M10 6h4M10 8.2h3" /></>,
  /** 차량 — 옆모습 */
  car: <><path d="M3 15.5V13l2-4.3A2 2 0 0 1 6.8 7.5h10.4a2 2 0 0 1 1.8 1.2L21 13v2.5z" /><path d="M5.5 13h13" /><circle cx="7.5" cy="17" r="2" /><circle cx="16.5" cy="17" r="2" /></>,
  /** 토 게이지 — 바퀴 달린 가로대와 바늘 */
  toe: <><path d="M3.5 10h17M6 10v6M18 10v6" /><circle cx="6" cy="18" r="1.8" /><circle cx="18" cy="18" r="1.8" /><path d="M12 10V5.5M10 7.5l2-2 2 2" /></>,
  /** 리프트 — 판과 가위 다리 */
  lift: <path d="M3.5 6.5h17M5 19.5h14M7 6.5l10 13M17 6.5l-10 13" />,
  /** 분해 스탠드 — 기둥·받침·물림쇠 */
  stand: <><path d="M12 7.5v12M6 19.5h12M8.5 19.5L12 15l3.5 4.5" /><rect x="8" y="3.5" width="8" height="4" rx="1.5" /></>,
  /** 작업대 — 판·다리·바이스 */
  bench: <><path d="M3 11.5h18M5 11.5v8M19 11.5v8M5 16h14" /><rect x="7" y="6.5" width="5" height="5" rx="1" /><path d="M12 8.5h4" /></>,
} satisfies Record<string, ReactElement>

export type IconName = keyof typeof PATHS
export const ICON_NAMES = Object.keys(PATHS) as IconName[]

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  )
}
