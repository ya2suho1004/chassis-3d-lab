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
