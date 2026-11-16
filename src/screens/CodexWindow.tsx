// 도감 창(설계 docs/superpowers/specs/2026-11-16-codex-window-design.md §3-2).
// 모은 장비를 한꺼번에 펼쳐 본다. 카드 23장은 배치 자료 순서로 고정하고, 못 본 장비는 '?'로 가린다(카드 줄은 app/codexList.ts).
// 기록 창(RecordWindow)처럼 HTML 대화 상자 요소를 쓰지 않고 div와 role로 만든다(오래된 학교 태블릿 크롬).
// 닫는 길: ✕, Esc(초점이 창 안일 때), 어두운 바탕 누르기. 열 때 초점은 제목에, 닫으면 연 버튼으로 돌려준다.
// 이 창은 사건을 내지 않는다 — 수행 기록·장면 누름·소리 사건이 없고, 닫기 버튼에 누름 느낌 표시(data-feel="press")만 단다.
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { codexCards, codexCount, type CodexEquipment } from '../app/codexList'
import { Icon, type IconName } from './Icon'
import { wrapTab } from './RecordWindow'

/** 배치 자료의 장비 종류 → 종류 그림 */
export const KIND_ICON: Readonly<Record<string, IconName>> = {
  brakeTester: 'roller',
  panel: 'panel',
  desk: 'desk',
  vehicle: 'car',
  toeGauge: 'toe',
  lift: 'lift',
  stand: 'stand',
  bench: 'bench',
}
export const iconForKind = (kind: string): IconName => KIND_ICON[kind] ?? 'wrench'

const FOCUSABLE = 'button:not([disabled]), [tabindex="0"]'

export function CodexWindow({ equipment, collected, note, onClose }: {
  equipment: readonly CodexEquipment[]
  collected: readonly string[]
  /** 창 아래 작은 안내(저장 방식) */
  note: string
  onClose: () => void
}) {
  const winRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const cards = codexCards(equipment, collected)
  const { have, total } = codexCount(equipment, collected)

  // 연 자리를 기억했다가 닫힐 때 돌려준다. 태블릿 사파리는 누른 버튼에 초점을 주지 않아 연 자리를 모를 수 있다 — 그때는 도감 버튼으로.
  // 개발 모드(StrictMode)는 효과를 두 번 돌리므로 처음 기억한 것만 쓴다
  const openerRef = useRef<HTMLElement | null | undefined>(undefined)
  useEffect(() => {
    if (openerRef.current === undefined) { const a = document.activeElement; openerRef.current = a instanceof HTMLElement && a !== document.body ? a : null }
    titleRef.current?.focus({ preventScroll: true })
    return () => {
      const opener = openerRef.current ?? null
      setTimeout(() => {
        const back = opener && opener.isConnected && !(opener as HTMLButtonElement).disabled ? opener : document.querySelector<HTMLElement>('.g-codexbtn, .codex-openbtn')
        back?.focus({ preventScroll: true })
      }, 0)
    }
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !e.nativeEvent.isComposing) { e.stopPropagation(); onClose(); return }
    if (e.key !== 'Tab' || !winRef.current) return
    const to = wrapTab(Array.from(winRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)), document.activeElement, e.shiftKey)
    if (to) { e.preventDefault(); to.focus({ preventScroll: true }) }
  }

  return (
    <div className="codex-wrap" tabIndex={-1} onKeyDown={onKeyDown} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="codex-win" ref={winRef} role="dialog" aria-modal="true" aria-labelledby="codex-title">
        <div className="codex-head">
          <span className="codex-headico" aria-hidden="true"><Icon name="book" size={22} /></span>
          <h2 id="codex-title" tabIndex={-1} ref={titleRef}>도감 {have}/{total}</h2>
          <button className="codex-x" data-feel="press" aria-label="도감 닫기" onClick={onClose}>✕</button>
        </div>
        <div className="codex-body" tabIndex={0} role="region" aria-label="장비 카드">
          <ul className="codex-list">
            {cards.map((c) => (c.seen ? (
              <li key={c.id} className="codex-card seen">
                <span className="codex-ico" aria-hidden="true"><Icon name={iconForKind(c.kind)} size={26} /></span><div className="codex-text"><b className="codex-name">{c.label}</b><p className="codex-info">{c.info}</p></div>
              </li>
            ) : (
              <li key={c.id} className="codex-card unseen">
                <span className="codex-ico unseen" aria-hidden="true">?</span><b className="codex-name">아직 못 본 장비</b>
              </li>
            )))}
          </ul>
        </div>
        <p className="codex-note">{note}</p>
      </div>
    </div>
  )
}
