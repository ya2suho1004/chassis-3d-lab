// 기록 창 틀(설계 2026-11-10 §3·§8). 어두운 바탕이 게임 화면을 덮고, 창은 보이는 화면(visualViewport) 위쪽에 붙는다.
// 오래된 학교 태블릿 크롬 때문에 HTML 대화 상자 요소·비활성 속성·새 화면 높이 단위를 쓰지 않고 div와 role로 만든다.
// 열 때 초점은 제목에 둔다(칸에 주면 키보드가 바로 올라와 계기를 가린다). 닫으면 연 자리로 초점을 돌려준다.
// 창 안 스크롤은 scrollTop만 바꾼다(바깥 화면까지 밀어 버리는 브라우저 스크롤 함수는 11-09 옆 밀림의 원인이라 쓰지 않음).
// 어두운 바탕을 눌러도 닫지 않는다. ✕와 Esc(초점이 창 안일 때)로만 닫고, 닫기는 제출·완료가 아니다.
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { recordInputId } from '../app/focusResponse'
import { recordWindowBox, scrollDelta } from '../app/recordSteps'

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]'

/** 칸이 든 줄: 계기 그림과 칸을 묶은 줄(.rec-row)을 먼저, 없으면 칸 한 줄(.field), 비채점 칸이면 이름까지(.rec-note) */
const rowOf = (el: Element): Element => el.closest('.rec-row') ?? el.closest('.field') ?? el.closest('.rec-note') ?? el

/** el이 든 창 안 스크롤 영역(.rec-body)을 움직여 el이 다 보이게 한다 */
export function revealInBody(el: Element | null): void {
  const body = el?.closest('.rec-body') as HTMLElement | null | undefined
  if (!el || !body) return
  const d = scrollDelta(body.getBoundingClientRect(), el.getBoundingClientRect())
  if (d !== 0) body.scrollTop += d
}

/** 창 안 칸으로: 그 칸의 줄(계기 그림 포함)을 보이고 초점을 준다(이때는 키보드가 올라온다) */
export function focusRecordField(doc: Pick<Document, 'getElementById'>, itemId: string): boolean {
  const el = doc.getElementById(recordInputId(itemId))
  if (!el) return false
  revealInBody(rowOf(el))
  el.focus({ preventScroll: true })
  return true
}

/** Tab이 창 밖으로 나가지 않게: 처음·끝에서 반대쪽으로 돌린다. 돌릴 필요가 없으면 null(브라우저에 맡김) */
export function wrapTab(items: readonly HTMLElement[], current: Element | null, back: boolean): HTMLElement | null {
  if (items.length === 0) return null
  const at = current ? items.indexOf(current as HTMLElement) : -1
  if (back) return at <= 0 ? items[items.length - 1]! : null
  return at === -1 || at === items.length - 1 ? items[0]! : null
}

/** 닫은 뒤 초점: 연 버튼이 보이면 그것, 아니면 다시 열린 작업 목록의 닫기, (all이면) 행동 버튼, 의뢰 카드의 작업 목록 버튼 순.
 *  all=false면 연 버튼·목록 닫기만 본다(작업 목록이 다시 열리길 기다리는 동안) */
export function restoreFocus(opener: HTMLElement | null, doc: Pick<Document, 'querySelector'>, all = true): HTMLElement | null {
  const usable = (el: HTMLElement | null | undefined): el is HTMLElement => {
    if (!el || !el.isConnected || el.tagName === 'BODY' || (el as HTMLButtonElement).disabled) return false
    if (el.getClientRects().length === 0) return false
    return typeof getComputedStyle !== 'function' || getComputedStyle(el).visibility !== 'hidden'
  }
  const candidates = [opener, doc.querySelector<HTMLElement>('.g-drawer.open > .g-x'), ...(all ? [doc.querySelector<HTMLElement>('.g-actions > .g-act:not(.small)'), doc.querySelector<HTMLElement>('.g-quest-btns > button')] : [])]
  const target = candidates.find(usable) ?? null
  target?.focus({ preventScroll: true })
  return target
}

export function RecordWindow({ title, onClose, onAskAi, footer, children }: {
  title: string
  onClose: () => void
  /** 창 머리의 AI 질문(바깥 질문 버튼 대신, §3.3). 없으면 버튼이 없다(비기록 모드) */
  onAskAi?: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const winRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [box, setBox] = useState(() => recordWindowBox(null, typeof window === 'undefined' ? 800 : window.innerHeight))

  // 닫힐 때 연 자리로 초점을 돌려준다(아래 제목 초점보다 먼저 선언해야 연 버튼을 기억한다).
  // 개발 모드(StrictMode)는 효과를 두 번 돌리므로 처음 기억한 것만 쓴다. 작업 목록이 다시 열리는 데 오래 걸리는 기기를 위해
  // 0.08초 뒤부터 0.5초까지 화면마다 연 버튼·목록 닫기만 다시 보고, 끝까지 없으면 행동 버튼·작업 목록 버튼으로 간다.
  // 그사이 다른 기록 창이 떴거나 누가 초점을 가져갔으면 하지 않는다.
  const openerRef = useRef<HTMLElement | null | undefined>(undefined)
  useEffect(() => {
    if (openerRef.current === undefined) { const a = document.activeElement; openerRef.current = a instanceof HTMLElement ? a : null }
    return () => {
      const opener = openerRef.current ?? null
      const until = Date.now() + 500
      const attempt = () => {
        if (document.querySelector('.g-record')) return
        const a = document.activeElement
        if (a && a !== document.body) return
        if (restoreFocus(opener, document, false)) return
        if (Date.now() >= until) { restoreFocus(opener, document); return }
        requestAnimationFrame(attempt)
      }
      setTimeout(attempt, 80)
    }
  }, [])
  // 열 때와 다른 단계 창으로 바뀔 때: 맨 위부터, 초점은 제목에
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
    titleRef.current?.focus({ preventScroll: true })
  }, [title])
  // 보이는 화면 따라가기: 화면 키보드가 올라오면 창이 줄고, 초점이 있는 칸의 줄을 다시 보인다
  useEffect(() => {
    const vv = window.visualViewport ?? null
    let lastH = -1
    const update = () => {
      setBox(recordWindowBox(vv ? { height: vv.height, offsetTop: vv.offsetTop } : null, window.innerHeight))
      const h = vv ? vv.height : window.innerHeight
      if (h === lastH) return
      lastH = h
      requestAnimationFrame(() => {
        const a = document.activeElement
        if (a && a.tagName === 'INPUT' && bodyRef.current?.contains(a)) revealInBody(rowOf(a))
      })
    }
    update()
    const target: EventTarget = vv ?? window
    target.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    return () => { target.removeEventListener('resize', update); vv?.removeEventListener('scroll', update) }
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !e.nativeEvent.isComposing) { e.stopPropagation(); onClose(); return }
    if (e.key !== 'Tab' || !winRef.current) return
    const to = wrapTab(Array.from(winRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)), document.activeElement, e.shiftKey)
    if (to) { e.preventDefault(); to.focus({ preventScroll: true }) }
  }
  // 칸을 누르면 그 줄(계기 그림 포함)이 창 안에 보이게
  const onFocusIn = (e: FocusEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT') revealInBody(rowOf(t))
  }

  return (
    <div className="g-recordwrap" tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="g-record" ref={winRef} role="dialog" aria-modal="true" aria-labelledby="rec-title" style={{ top: box.top, maxHeight: box.maxHeight }}>
        <div className="rec-head">
          <h2 id="rec-title" ref={titleRef} tabIndex={-1}>{title}</h2>
          {onAskAi && <button className="rec-ai" onClick={onAskAi}>AI 교관에게 질문</button>}
          <button className="rec-x" aria-label="기록 창 닫기" onClick={onClose}>✕</button>
        </div>
        <div className="rec-body" ref={bodyRef} onFocus={onFocusIn}>{children}</div>
        {footer && <div className="rec-foot">{footer}</div>}
      </div>
    </div>
  )
}
