// 교사용 AI 대화 점검(설계 docs/superpowers/specs/2026-11-03-teacher-chat-review-design.md)
// 수업 중 학생 질문(서버에서 가린 글)·AI 답을 시간순으로 보고, 문제가 보이면 같은 자리에서 AI를 끈다.
// 서버에 있는 것만 보인다(기기에 저장하지 않음). 10초마다 새 대화만 불러와 붙인다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { FLAG_LABEL, MASK_LABEL, chatFlags, filterChatLogs, latestCreatedAt, mergeChatLogs, studentCodesOf } from '../teacher/chatReview'
import { listChatLogsSince, ServerError, type ChatLogRecord, type ServerConfig, type SessionRow, type TeacherAuth } from '../teacher/serverAdmin'

const POLL_MS = 10_000
const hhmmss = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString('ko-KR', { hour12: false }) }

export function ChatReview({ cfg, auth, session, busy, onToggleChat, onExpired, fetchImpl }: {
  cfg: ServerConfig; auth: TeacherAuth; session: SessionRow; busy: boolean
  onToggleChat: (on: boolean) => Promise<void>
  onExpired: () => void
  /** 시험용 */
  fetchImpl?: typeof fetch
}) {
  const [rows, setRows] = useState<ChatLogRecord[]>([])
  const [code, setCode] = useState<string | null>(null)
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [auto, setAuto] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState<string | null>(null)
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  // 부모가 매번 새 함수를 넘겨도 불러오기가 다시 돌지 않게 ref로 둔다
  const expiredRef = useRef(onExpired)
  expiredRef.current = onExpired

  const load = useCallback(async () => {
    try {
      const fresh = await listChatLogsSince(cfg, auth, session.session_code, latestCreatedAt(rowsRef.current), fetchImpl)
      setRows((prev) => mergeChatLogs(prev, fresh))
      setErr(null)
      setLoadedAt(new Date().toISOString())
    } catch (e) {
      if (e instanceof ServerError && e.code === 'NOT_TEACHER') return expiredRef.current()
      setErr('대화를 불러오지 못했습니다. 인터넷을 확인하세요(다음 새로고침 때 다시 시도).')
    }
  }, [cfg, auth, session.session_code, fetchImpl])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!auto) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load() }, POLL_MS)
    return () => clearInterval(t)
  }, [auto, load])

  const shown = filterChatLogs(rows, { code, flaggedOnly })
  const flaggedCount = rows.filter((r) => chatFlags(r).length > 0).length

  return (
    <div className="chatreview" aria-label={`${session.session_code} 대화 점검`}>
      <div className="cr-head">
        <b>{session.session_code} 대화 {rows.length}건</b>{flaggedCount > 0 && <span className="cr-warn"> · 주의 {flaggedCount}건</span>}
        <button className={session.chatbot_enabled ? 'cr-off' : 'primary'} disabled={busy} onClick={() => void onToggleChat(!session.chatbot_enabled)}>
          {session.chatbot_enabled ? 'AI 지금 끄기' : 'AI 다시 켜기'}
        </button>
      </div>
      <div className="row small">
        <label className="inline">학생
          <select value={code ?? ''} onChange={(e) => setCode(e.target.value || null)} aria-label="익명 코드로 거르기">
            <option value="">전체</option>
            {studentCodesOf(rows).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="radio"><input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} /> 주의 표시만</label>
        <label className="radio"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 10초마다 새로고침</label>
        <button className="link" onClick={() => void load()}>지금 새로고침</button>
        {loadedAt && <span>마지막 확인 {hhmmss(loadedAt)}</span>}
      </div>
      {err && <p className="error">{err}</p>}
      {shown.length === 0 ? (
        <p className="small">{rows.length === 0 ? '아직 대화가 없습니다.' : '조건에 맞는 대화가 없습니다.'}</p>
      ) : (
        <ol className="cr-list">
          {shown.map((r) => {
            const flags = chatFlags(r)
            return (
              <li key={r.chat_id} className={flags.length ? 'flagged' : ''}>
                <div className="cr-meta">
                  <span>{hhmmss(r.created_at)}</span> · <b>{r.anonymous_student_code}</b>{r.step_id ? ` · 단계 ${r.step_id}` : ''}{r.difficulty_mode === 'unguided' ? ' · 안내 없음' : ''}
                  {flags.map((f) => <span key={f} className={`cr-flag cr-${f}`}>{FLAG_LABEL[f]}{f === 'masked' ? `(${r.masked_patterns.map((m) => MASK_LABEL[m] ?? m).join('·')})` : ''}</span>)}
                </div>
                <p className="cr-q"><b>학생</b> {r.question_masked}</p>
                <p className="cr-a"><b>AI</b> {r.answer ?? '(답 없음)'}</p>
              </li>
            )
          })}
        </ol>
      )}
      <p className="small">학생 질문은 서버에서 전화번호·이메일·주민번호·학년반 형식을 가린 뒤의 글입니다. 이름 등 다른 개인정보는 자동으로 다 가리지 못하니, 보이면 AI를 끄고 연구 절차에 따라 처리하세요.</p>
    </div>
  )
}
