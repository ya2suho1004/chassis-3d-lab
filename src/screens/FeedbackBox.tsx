// 안내 상자(2026-11-10): 게임 알림과 작업 목록 안 안내가 같은 모양을 쓴다.
// "값을 먼저 입력하세요"처럼 칸이 정해진 안내에는 그 칸으로 가는 버튼을 붙인다.
import type { Shown } from './TaskScreen'

export function FeedbackBox({ shown, className, onClose, onFocusItem }: {
  shown: Shown
  className: string
  onClose?: () => void
  onFocusItem?: (itemId: string) => void
}) {
  return (
    <div className={className} role="alert">
      {onClose && <button className="fb-x" aria-label="안내 닫기" onClick={onClose}>✕</button>}
      <b>{shown.title}</b>
      {shown.text ? (<ul><li>무엇: {shown.text.what}</li><li>왜: {shown.text.why}</li><li>어떻게: {shown.text.how}</li></ul>) : <p>{shown.plain}</p>}
      {shown.focusItem && onFocusItem && <button className="primary fb-go" onClick={() => onFocusItem(shown.focusItem!)}>입력칸으로</button>}
    </div>
  )
}
