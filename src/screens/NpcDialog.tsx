// NPC 교관 대화창(게임 화면) — 위쪽 큰 말풍선 + 이름표, 누르면 다음 대사, 마지막에 선택지.
// 대사는 대본형이며 판정·채점과 무관하다. 과제 받기는 기존 onReceiveTask(수행 번호 발급·초안 저장)를 그대로 부른다.
import { useState } from 'react'

export function npcLines(opts: { near: boolean; running: boolean; taskTitle: string }): string[] {
  if (!opts.near) return ['여기야! 가까이 와서 이야기하자.']
  if (opts.running) return ['작업 순서대로 차근차근 해. 안전 수칙은 꼭 지키고.', '궁금한 건 AI 교관에게 물어봐도 돼. 다 끝나면 나한테 검사를 받아.']
  return [
    '어서 와. 오늘은 제동력 시험기로 뒤축 제동력을 측정해 볼 거야.',
    '손님 차량이 제동할 때 한쪽으로 쏠린다고 했어. 좌·우 제동력을 재서 편차와 합을 계산하고, 차량 상태를 판정해 줘.',
    `오늘 과제는 「${opts.taskTitle}」야. 준비됐으면 과제를 받아.`,
  ]
}

export function NpcDialog({ near, running, taskTitle, error, onReceive, onGoToNpc, onOpenTasks, onInspect, onClose }: {
  near: boolean; running: boolean; taskTitle: string; error: string | null
  onReceive: () => Promise<string | null>
  onGoToNpc: () => void; onOpenTasks: () => void; onInspect: () => void; onClose: () => void
}) {
  const lines = npcLines({ near, running, taskTitle })
  const [page, setPage] = useState(0)
  const [after, setAfter] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const i = Math.min(page, lines.length - 1)
  const last = i === lines.length - 1
  const text = after ?? lines[i]

  return (
    <div className="g-dialog" role="dialog" aria-label="교관과 대화">
      <button className="g-bubble" onClick={() => { if (!last && !after) setPage(page + 1) }} aria-label={last || after ? '교관 대사' : '교관 대사 — 눌러서 다음'}>
        <span className="g-name">교관</span>
        <span className="g-say">{text}</span>
        {!last && !after && <span className="g-more" aria-hidden>▼</span>}
      </button>
      {error && <p className="g-err">{error}</p>}
      {(last || after) && (
        <div className="g-choices">
          {after ? (
            <button className="primary" onClick={onClose}>시작하기</button>
          ) : !near ? (
            <>
              <button className="primary" onClick={onGoToNpc}>교관에게 가기</button>
              <button onClick={onClose}>닫기</button>
            </>
          ) : running ? (
            <>
              <button className="primary" onClick={onOpenTasks}>작업 목록 열기</button>
              <button onClick={onInspect}>검사 받기</button>
              <button onClick={onClose}>닫기</button>
            </>
          ) : (
            <>
              <button className="primary" disabled={busy} onClick={async () => {
                setBusy(true)
                const err = await onReceive()
                setBusy(false)
                if (!err) setAfter('좋아. 작업 순서는 오른쪽 위에 보여. 안전 수칙 꼭 지키고!')
              }}>과제 받기</button>
              <button onClick={onClose}>조금 더 둘러볼게요</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
