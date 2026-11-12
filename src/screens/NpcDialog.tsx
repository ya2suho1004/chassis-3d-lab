// NPC 교관 대화창(게임 화면) — 위쪽 큰 말풍선 + 이름표, 누르면 다음 대사, 마지막에 선택지.
// 대사는 대본형이며 판정·채점과 무관하다. 과제 받기는 기존 onReceiveTask(수행 번호 발급·초안 저장)를 그대로 부른다.
import { useState } from 'react'
import { requestCopy } from '../app/requests'

/** nickname: 캐릭터 만들기 닉네임(설계 2026-11-03) — 첫 인사에서 부른다. aiAvailable=false(비기록 모드)면 AI 교관을 권하지 않는다 */
export function npcLines(opts: { near: boolean; running: boolean; taskTitle: string; taskId?: string; nickname?: string; aiAvailable?: boolean }): string[] {
  const hi = opts.nickname ? `어서 와, ${opts.nickname}.` : '어서 와.'
  if (!opts.near) return ['여기야! 가까이 와서 이야기하자.']
  if (opts.running) return ['작업 순서대로 차근차근 해. 안전 수칙은 꼭 지키고.', opts.aiAvailable === false ? '막히면 힌트를 눌러 봐. 다 끝나면 나한테 검사를 받아.' : '궁금한 건 AI 교관에게 물어봐도 돼. 다 끝나면 나한테 검사를 받아.']
  const c = requestCopy(opts.taskId)
  return [`${hi} ${c.npcToday}`, c.npcAsk, `오늘 과제는 「${opts.taskTitle}」야. 준비됐으면 과제를 받아.`]
}

/** 기본 화면(패널)의 작업지시 한 줄 — 게임 화면 대사와 같은 호소를 과제별로(문구 원본은 app/requests.ts) */
export function panelWorkOrder(taskId?: string): string {
  return requestCopy(taskId).workOrder
}

export function NpcDialog({ near, running, taskTitle, taskId, nickname, aiAvailable = true, error, onReceive, onGoToNpc, onOpenTasks, onInspect, onClose }: {
  near: boolean; running: boolean; taskTitle: string; taskId?: string; nickname?: string; aiAvailable?: boolean; error: string | null
  onReceive: () => Promise<string | null>
  onGoToNpc: () => void; onOpenTasks: () => void; onInspect: () => void; onClose: () => void
}) {
  const lines = npcLines({ near, running, taskTitle, taskId, nickname, aiAvailable })
  const [page, setPage] = useState(0)
  const [after, setAfter] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const i = Math.min(page, lines.length - 1)
  const last = i === lines.length - 1
  const text = after ?? lines[i]

  return (
    <div className="g-dialog" role="dialog" aria-label="교관과 대화" data-feel="press">
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
                if (!err) setAfter('좋아. 작업 순서는 작업 목록에서 확인해. 안전 수칙 꼭 지키고!')
              }}>과제 받기</button>
              <button onClick={onClose}>조금 더 둘러볼게요</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
