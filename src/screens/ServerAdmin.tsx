// 교사 화면 — 서버 수업 관리(설계 07 §5): 교사 로그인, 세션별 챗봇 켜고 끄기·질문 한도, 대화 점검, 대화 기록·수행 기록 CSV.
// 로그인 토큰은 교사 화면이 열려 있는 동안 메모리에만 둔다. 교사 명단에 없으면 RLS가 막는다.
// 2026-11-03: 교사 화면 탭(수업 중·수업 후)에 나눠 쓰도록 훅과 화면 조각으로 나눔(설계 2026-11-03-teacher-chat-review-design.md).
import { useState } from 'react'
import { serverRecordsToSummaryCsv, toChatCsv } from '../records/csv'
import { createSession, getServerConfig, isTeacher, listChatLogs, listServerRecords, listSessions, ServerError, signIn, updateSession, type ServerConfig, type SessionRow, type TeacherAuth } from '../teacher/serverAdmin'
import { ChatReview } from './ChatReview'

export const FLOW_LABEL: Record<SessionRow['lesson_flow'], string> = { 'lesson1-2': '1~2차시 연습', lesson5: '5차시 정리' }

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  a.download = name
  a.click()
}

export const errText = (e: unknown) => {
  const code = e instanceof ServerError ? e.code : 'NETWORK'
  return code === 'LOGIN_FAILED' ? '이메일 또는 비밀번호가 맞지 않습니다.' : code === 'NOT_TEACHER' ? '교사 명단에 없는 계정이거나 로그인이 만료됐습니다. 다시 로그인하세요.' : code === 'NETWORK' ? '서버에 연결하지 못했습니다. 인터넷을 확인하세요.' : `서버 오류(${code}).`
}

export interface ServerAdminState {
  cfg: ServerConfig | null
  auth: TeacherAuth | null
  sessions: SessionRow[] | null
  msg: string | null
  busy: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
  patch: (code: string, p: Parameters<typeof updateSession>[3]) => Promise<void>
  run: (f: () => Promise<void>) => Promise<void>
  /** 대화 점검 화면에서 401·403을 만나면 로그인을 푼다 */
  expire: () => void
}

/** 로그인·세션 목록·작업을 한곳에 둔다(교사 화면 탭을 옮겨도 로그인이 유지됨) */
export function useServerAdmin(): ServerAdminState {
  // 한 번만 읽어 같은 객체를 쓴다(대화 점검의 불러오기가 화면이 다시 그려질 때마다 돌지 않게)
  const [cfg] = useState(getServerConfig)
  const [auth, setAuth] = useState<TeacherAuth | null>(null)
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const logout = () => { setAuth(null); setSessions(null) }
  const run = async (f: () => Promise<void>) => { setBusy(true); setMsg(null); try { await f() } catch (e) { setMsg(errText(e)); if (e instanceof ServerError && e.code === 'NOT_TEACHER') logout() } finally { setBusy(false) } }
  return {
    cfg, auth, sessions, msg, busy, run, logout,
    expire: () => { setMsg(errText(new ServerError('NOT_TEACHER', 401))); logout() },
    login: (email, password) => run(async () => {
      if (!cfg) return
      const a = await signIn(cfg, email.trim(), password)
      if (!(await isTeacher(cfg, a))) throw new ServerError('NOT_TEACHER', 403)
      setAuth(a)
      setSessions(await listSessions(cfg, a))
    }),
    refresh: () => run(async () => { if (cfg && auth) setSessions(await listSessions(cfg, auth)) }),
    patch: (code, p) => run(async () => { if (!cfg || !auth) return; await updateSession(cfg, auth, code, p); setSessions(await listSessions(cfg, auth)) }),
  }
}

export function ServerLogin({ s }: { s: ServerAdminState }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  if (!s.cfg) return <section className="card"><h3>서버 수업 관리</h3><p className="small">서버 주소가 설정되지 않았습니다(VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY).</p></section>
  return (
    <section className="card serveradmin">
      <h3>서버 수업 관리 (교사 로그인)</h3>
      <p className="small">Supabase에 만든 교사 계정으로 로그인합니다. 로그인은 교사 화면을 닫으면 풀립니다.</p>
      <label>이메일<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" aria-label="교사 이메일" /></label>
      <label>비밀번호<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" aria-label="교사 비밀번호" /></label>
      {s.msg && <p className="error">{s.msg}</p>}
      <button className="primary" onClick={() => { void s.login(email, password); setPassword('') }} disabled={s.busy || !email || !password}>{s.busy ? '확인 중…' : '로그인'}</button>
    </section>
  )
}

function AccountRow({ s }: { s: ServerAdminState }) {
  return (
    <div className="row small">
      <span>{s.auth?.email} 로그인됨</span>
      <button className="link" onClick={() => void s.refresh()}>새로고침</button>
      <button className="link" onClick={s.logout}>로그아웃</button>
    </div>
  )
}

/** 수업 중: 세션별 AI 켜기/끄기·질문 수·대화 보기 */
export function ServerLive({ s }: { s: ServerAdminState }) {
  const [reviewing, setReviewing] = useState<string | null>(null)
  if (!s.cfg || !s.auth) return <ServerLogin s={s} />
  const { cfg, auth } = s
  const current = s.sessions?.find((x) => x.session_code === reviewing) ?? null
  return (
    <section className="card serveradmin">
      <h3>AI 교관 (수업 중)</h3>
      <AccountRow s={s} />
      {s.msg && <p className="error">{s.msg}</p>}
      {s.sessions && s.sessions.length === 0 && <p className="small">세션이 없습니다.</p>}
      {s.sessions?.map((x) => (
        <div key={x.session_code} className="sessionrow">
          <p><b>{x.session_code}</b> · {FLOW_LABEL[x.lesson_flow]} · 조건 {x.class_condition_code}{x.active ? '' : ' · 비활성'} · AI <b className={x.chatbot_enabled ? 'ok' : ''}>{x.chatbot_enabled ? '켜짐' : '꺼짐'}</b></p>
          <div className="row">
            <label className="radio"><input type="checkbox" checked={x.chatbot_enabled} disabled={s.busy} onChange={(e) => void s.patch(x.session_code, { chatbot_enabled: e.target.checked })} /> AI 교관 챗봇 켜기</label>
            <label className="inline">학생 1인 하루 질문 수
              <select value={x.chat_cap_per_student} disabled={s.busy} onChange={(e) => void s.patch(x.session_code, { chat_cap_per_student: Number(e.target.value) })}>
                {[5, 10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button className={reviewing === x.session_code ? 'primary' : ''} onClick={() => setReviewing(reviewing === x.session_code ? null : x.session_code)}>{reviewing === x.session_code ? '대화 닫기' : '대화 보기'}</button>
          </div>
        </div>
      ))}
      {current && <ChatReview key={current.session_code} cfg={cfg} auth={auth} session={current} busy={s.busy}
        onToggleChat={(on) => s.patch(current.session_code, { chatbot_enabled: on })} onExpired={s.expire} />}
    </section>
  )
}

/** 수업 후: 서버 대화 기록·수행 기록 CSV, 새 세션 만들기 */
export function ServerAfter({ s }: { s: ServerAdminState }) {
  const [newCode, setNewCode] = useState('')
  const [newCond, setNewCond] = useState('')
  const [newFlow, setNewFlow] = useState<SessionRow['lesson_flow']>('lesson1-2')
  if (!s.cfg || !s.auth) return <ServerLogin s={s} />
  const { cfg, auth } = s
  const today = new Date().toISOString().slice(0, 10)
  return (
    <section className="card serveradmin">
      <h3>서버 기록 내려받기 (수업 후)</h3>
      <AccountRow s={s} />
      {s.msg && <p className="error">{s.msg}</p>}
      {s.sessions?.map((x) => (
        <div key={x.session_code} className="sessionrow">
          <p><b>{x.session_code}</b> · {FLOW_LABEL[x.lesson_flow]} · 조건 {x.class_condition_code}</p>
          <div className="row">
            <button disabled={s.busy} onClick={() => void s.run(async () => download(`chat-logs-${x.session_code}-${today}.csv`, toChatCsv(await listChatLogs(cfg, auth, x.session_code) as any)))}>대화 기록 CSV</button>
            <button disabled={s.busy} onClick={() => void s.run(async () => download(`server-records-${x.session_code}-${today}.csv`, serverRecordsToSummaryCsv(await listServerRecords(cfg, auth, x.session_code))))}>서버 수행 기록 CSV</button>
          </div>
        </div>
      ))}
      <details>
        <summary>새 수업 세션 만들기</summary>
        <label>세션 코드(영문·숫자·-·_)<input value={newCode} onChange={(e) => setNewCode(e.target.value)} aria-label="새 세션 코드" /></label>
        <label>조건 코드(학급 실명 대신)<input value={newCond} onChange={(e) => setNewCond(e.target.value)} aria-label="조건 코드" /></label>
        <label className="radio"><input type="radio" name="flow" checked={newFlow === 'lesson1-2'} onChange={() => setNewFlow('lesson1-2')} /> 1~2차시 연습</label>
        <label className="radio"><input type="radio" name="flow" checked={newFlow === 'lesson5'} onChange={() => setNewFlow('lesson5')} /> 5차시 정리</label>
        <p className="small">새 세션은 챗봇 꺼짐으로 만들어집니다. 시연 기간에 학생 화면은 DEMO-ONLY 세션만 씁니다(새 세션의 학생 화면 연결은 실제 적용 전 작업).</p>
        <button disabled={s.busy || !/^[A-Za-z0-9_-]{1,32}$/.test(newCode) || !/^[A-Za-z0-9_-]{1,32}$/.test(newCond)}
          onClick={() => void s.run(async () => { await createSession(cfg, auth, { session_code: newCode, class_condition_code: newCond, lesson_flow: newFlow }); setNewCode(''); setNewCond(''); await s.refresh() })}>만들기</button>
      </details>
    </section>
  )
}
