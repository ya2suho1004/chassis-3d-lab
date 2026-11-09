// AI 교관 대화 창(설계 07 §4-1) — 대본형 NPC 교관(과제 안내·검사)과 분리된 질의응답 보조. 판정·채점은 하지 않는다.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { chatExamples, getChatEndpoint, splitBold, CHAT_QUESTION_MAX, type ChatMode } from './chatClient'
import type { ChatConversation } from './chatConversation'

function Bold({ text }: { text: string }) {
  return <>{splitBold(text).map((p, i) => (p.bold ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}</>
}

export function ChatPanel({ conversation, sessionCode, anonymousStudentCode, recordId, stepId, taskId = null, difficultyMode, initialOpen = false }: {
  /** 화면을 바꿔도 이어지도록 대화는 패널 밖(LabScreen)에 있다(E4) */
  conversation: ChatConversation
  sessionCode: string; anonymousStudentCode: string; recordId: string | null; stepId: string | null; taskId?: string | null; difficultyMode: ChatMode
  /** 게임 화면의 질문 서랍처럼 바로 입력 창을 보여 줄 때 */
  initialOpen?: boolean
}) {
  const endpoint = getChatEndpoint()
  const { lines, draft: text, busy, remaining } = useSyncExternalStore(conversation.subscribe, conversation.getState, conversation.getState)
  const [open, setOpen] = useState(initialOpen || lines.length > 0)
  const listRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [lines, open])

  const send = () => conversation.send({ endpoint, sessionCode, anonymousStudentCode, recordId, stepId, taskId, difficultyMode })

  if (!open) {
    return (
      <div className="card chat">
        <b>AI 교관에게 질문하기</b>
        <p className="small">장비 사용법, 안전수칙, 계산 방법이 궁금하면 물어보세요. 판정·통과 여부는 NPC 교관 검사에서 받습니다.</p>
        <button onClick={() => setOpen(true)} disabled={!endpoint}>{endpoint ? '질문 창 열기' : '챗봇 주소가 설정되지 않았습니다'}</button>
      </div>
    )
  }

  return (
    <div className="card chat open">
      <div className="chathead">
        <b>AI 교관</b>
        <button className="link" onClick={() => setOpen(false)}>접기</button>
      </div>
      <p className="chatnotice">AI 교관과 대화합니다(사람이 아님). 이름·전화번호 등 개인정보를 쓰지 마세요. 질문과 답은 이 기기와 서버에 저장될 수 있고 선생님이 볼 수 있어요. AI 답은 틀릴 수 있어요.{difficultyMode !== 'guided' ? ' 지금은 안내 없음 단계라 정답 대신 힌트를 줍니다.' : ''}</p>
      <div className="chatlog" ref={listRef} aria-live="polite">
        {lines.length === 0 && <p className="small">예: {chatExamples(taskId).map((q) => `"${q}"`).join(', ')}</p>}
        {lines.map((l, i) => (
          <div key={i} className="turn">
            <p className="q">{l.q}</p>
            {l.a !== null && <p className="a"><Bold text={l.a} /></p>}
            {l.a === null && !l.error && <p className="a pending">답을 쓰는 중…</p>}
            {l.error && <p className="a error">{l.error}</p>}
            {l.masked.length > 0 && <p className="small">개인정보로 보이는 부분은 가려서 보냈어요.</p>}
            {l.note && <p className="small">{l.note}</p>}
          </div>
        ))}
      </div>
      <div className="chatinput">
        <textarea value={text} maxLength={CHAT_QUESTION_MAX} rows={2} placeholder="질문을 쓰세요(300자 이내)" onChange={(e) => conversation.setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} />
        <button className="primary" onClick={() => void send()} disabled={busy || !text.trim()}>{busy ? '보내는 중' : '보내기'}</button>
      </div>
      <p className="small">{text.length}/{CHAT_QUESTION_MAX}자{remaining !== null ? ` · 오늘 남은 질문 ${remaining}개` : ''}</p>
    </div>
  )
}
