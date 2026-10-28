// 교사 화면 — 서버 수업 관리(설계 07 §5): 교사 로그인, 세션별 챗봇 켜고 끄기·질문 한도, 대화 기록·수행 기록 CSV.
// 로그인 토큰은 이 화면이 열려 있는 동안 메모리에만 둔다. 교사 명단에 없으면 RLS가 막는다.
import { useState } from 'react'
import { serverRecordsToSummaryCsv, toChatCsv } from '../records/csv'
import { createSession, getServerConfig, isTeacher, listChatLogs, listServerRecords, listSessions, ServerError, signIn, updateSession, type SessionRow, type TeacherAuth } from '../teacher/serverAdmin'

const FLOW_LABEL: Record<SessionRow['lesson_flow'], string> = { 'lesson1-2': '1~2차시 연습', lesson5: '5차시 정리' }

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  a.download = name
  a.click()
}

const errText = (e: unknown) => {
  const code = e instanceof ServerError ? e.code : 'NETWORK'
  return code === 'LOGIN_FAILED' ? '이메일 또는 비밀번호가 맞지 않습니다.' : code === 'NOT_TEACHER' ? '교사 명단에 없는 계정이거나 로그인이 만료됐습니다. 다시 로그인하세요.' : code === 'NETWORK' ? '서버에 연결하지 못했습니다. 인터넷을 확인하세요.' : `서버 오류(${code}).`
}

export function ServerAdmin() {
  const cfg = getServerConfig()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [auth, setAuth] = useState<TeacherAuth | null>(null)
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newCond, setNewCond] = useState('')
  const [newFlow, setNewFlow] = useState<SessionRow['lesson_flow']>('lesson1-2')

  if (!cfg) return <section className="card"><h3>서버 수업 관리</h3><p className="small">서버 주소가 설정되지 않았습니다(VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY).</p></section>

  const run = async (f: () => Promise<void>) => { setBusy(true); setMsg(null); try { await f() } catch (e) { setMsg(errText(e)); if (e instanceof ServerError && e.code === 'NOT_TEACHER') setAuth(null) } finally { setBusy(false) } }
  const refresh = (a: TeacherAuth) => run(async () => setSessions(await listSessions(cfg, a)))

  const login = () => run(async () => {
    const a = await signIn(cfg, email.trim(), password)
    setPassword('')
    if (!(await isTeacher(cfg, a))) throw new ServerError('NOT_TEACHER', 403)
    setAuth(a)
    setSessions(await listSessions(cfg, a))
  })

  if (!auth) {
    return (
      <section className="card serveradmin">
        <h3>서버 수업 관리 (교사 로그인)</h3>
        <p className="small">Supabase에 만든 교사 계정으로 로그인합니다. 로그인은 이 화면을 닫으면 풀립니다.</p>
        <label>이메일<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" aria-label="교사 이메일" /></label>
        <label>비밀번호<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" aria-label="교사 비밀번호" /></label>
        {msg && <p className="error">{msg}</p>}
        <button className="primary" onClick={() => void login()} disabled={busy || !email || !password}>{busy ? '확인 중…' : '로그인'}</button>
      </section>
    )
  }

  const patch = (code: string, p: Parameters<typeof updateSession>[3]) => run(async () => { await updateSession(cfg, auth, code, p); setSessions(await listSessions(cfg, auth)) })
  const today = new Date().toISOString().slice(0, 10)

  return (
    <section className="card serveradmin">
      <h3>서버 수업 관리 <span className="small">({auth.email})</span></h3>
      {msg && <p className="error">{msg}</p>}
      {sessions && sessions.length === 0 && <p className="small">세션이 없습니다.</p>}
      {sessions?.map((s) => (
        <div key={s.session_code} className="sessionrow">
          <p><b>{s.session_code}</b> · {FLOW_LABEL[s.lesson_flow]} · 조건 {s.class_condition_code}{s.active ? '' : ' · 비활성'}</p>
          <label className="radio"><input type="checkbox" checked={s.chatbot_enabled} disabled={busy} onChange={(e) => void patch(s.session_code, { chatbot_enabled: e.target.checked })} /> AI 교관 챗봇 켜기</label>
          <label className="inline">학생 1인 하루 질문 수
            <select value={s.chat_cap_per_student} disabled={busy} onChange={(e) => void patch(s.session_code, { chat_cap_per_student: Number(e.target.value) })}>
              {[5, 10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="row">
            <button disabled={busy} onClick={() => void run(async () => download(`chat-logs-${s.session_code}-${today}.csv`, toChatCsv(await listChatLogs(cfg, auth, s.session_code) as any)))}>대화 기록 CSV</button>
            <button disabled={busy} onClick={() => void run(async () => download(`server-records-${s.session_code}-${today}.csv`, serverRecordsToSummaryCsv(await listServerRecords(cfg, auth, s.session_code))))}>서버 수행 기록 CSV</button>
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
        <button disabled={busy || !/^[A-Za-z0-9_-]{1,32}$/.test(newCode) || !/^[A-Za-z0-9_-]{1,32}$/.test(newCond)}
          onClick={() => void run(async () => { await createSession(cfg, auth, { session_code: newCode, class_condition_code: newCond, lesson_flow: newFlow }); setNewCode(''); setNewCond(''); setSessions(await listSessions(cfg, auth)) })}>만들기</button>
      </details>
      <div className="row">
        <button className="link" onClick={() => void refresh(auth)}>새로고침</button>
        <button className="link" onClick={() => { setAuth(null); setSessions(null) }}>로그아웃</button>
      </div>
    </section>
  )
}
