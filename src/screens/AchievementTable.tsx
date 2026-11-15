// 교사 화면 학생별 성취 표(설계 docs/superpowers/specs/2026-11-15-class-records-design.md §3-4)
// 교사 로그인 뒤 서버 관리(수업 후)에 붙는다. 서버 읽기는 기존 listAllServerRecords만 쓰고(읽기 권한은 교사 계정만, RLS), 계산은 teacher/achievement.ts.
// 학번은 학생을 알아볼 수 있는 값이다. 이 화면은 메모리에만 두고 이 기기에 저장하지 않는다.
import { Fragment, useState } from 'react'
import { listTasks } from '../app/session'
import { SESSIONS } from '../app/sessions'
import { buildAchievement, filterAchievement, whenText, type Achievement } from '../teacher/achievement'
import { listAllServerRecords } from '../teacher/serverAdmin'
import type { ServerAdminState } from './ServerAdmin'

const CLASS_SESSIONS = SESSIONS.filter((x) => x.kind === 'class')

export function AchievementTable({ s }: { s: ServerAdminState }) {
  const [session, setSession] = useState(CLASS_SESSIONS[0]?.code ?? '')
  const [data, setData] = useState<(Achievement & { session: string }) | null>(null)
  const [grade, setGrade] = useState('')
  const [classNo, setClassNo] = useState('')
  const [taskKey, setTaskKey] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  if (!s.cfg || !s.auth) return null
  const { cfg, auth } = s
  const load = () => s.run(async () => {
    const rows = await listAllServerRecords(cfg, auth, session)
    setData({ ...buildAchievement(rows, listTasks()), session })
    setOpenKey(null)
  })
  const rows = data ? filterAchievement(data.rows, { grade, classNo, taskKey }) : []
  const label = (code: string) => SESSIONS.find((x) => x.code === code)?.label ?? code
  return (
    <section className="card serveradmin achv" aria-label="학생별 성취">
      <h3>학생별 성취 (수업용 세션)</h3>
      <p className="small">서버에 들어온 수업용 세션 기록을 학번·과제별로 모아 봅니다. 줄마다 가장 최근에 끝낸 수행을 보이고, 줄을 누르면 그 학생의 모든 수행이 나옵니다. 마치거나 중단한 수행만 서버에 있습니다(하다가 덮은 수행은 없음).</p>
      <div className="row">
        <label className="inline">세션
          <select value={session} disabled={s.busy} onChange={(e) => setSession(e.target.value)} aria-label="성취 표 세션">
            {CLASS_SESSIONS.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
          </select>
        </label>
        <button className="primary" disabled={s.busy || !session} onClick={() => void load()}>{s.busy ? '불러오는 중…' : '불러오기'}</button>
      </div>
      {data && (
        <>
          <div className="row">
            <label className="inline">학년
              <select value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="학년 거르기">
                <option value="">전체</option>
                {data.grades.map((g) => <option key={g} value={g}>{g}학년</option>)}
              </select>
            </label>
            <label className="inline">반
              <select value={classNo} onChange={(e) => setClassNo(e.target.value)} aria-label="반 거르기">
                <option value="">전체</option>
                {data.classes.map((c) => <option key={c} value={c}>{c}반</option>)}
              </select>
            </label>
            <label className="inline">과제
              <select value={taskKey} onChange={(e) => setTaskKey(e.target.value)} aria-label="과제 거르기">
                <option value="">전체</option>
                {data.tasks.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
          </div>
          <p className="small" role="status">{label(data.session)} · 학생×과제 {rows.length}줄{rows.length !== data.rows.length ? ` (전체 ${data.rows.length}줄)` : ''}</p>
          {data.skipped > 0 && <p className="error" role="status">원본을 읽지 못한 서버 기록 {data.skipped}건은 표에서 뺐습니다. 서버 수행 기록 CSV로 확인하세요.</p>}
          {data.rows.length === 0 ? <p className="small">이 세션에 들어온 기록이 없습니다.</p> : (
            <div className="achv-scroll">
              <table className="sheet small achv-table">
                <thead><tr><th>학번</th><th>과제</th><th>완료 여부</th><th>검사</th><th>오류 수</th><th>걸린 시간</th><th>수행 횟수</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const open = openKey === r.key
                    return (
                      <Fragment key={r.key}>
                        <tr className="achv-row" onClick={() => setOpenKey(open ? null : r.key)}>
                          <td><button className="link" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpenKey(open ? null : r.key) }}>{open ? '▾' : '▸'} {r.studentCode}</button></td>
                          <td>{r.taskLabel}</td>
                          <td>{r.latest.completion}</td>
                          <td>{r.latest.inspection}</td>
                          <td>{r.latest.errorCount}</td>
                          <td>{r.latest.duration}</td>
                          <td>{r.count}</td>
                        </tr>
                        {open && r.attempts.map((a, i) => (
                          <tr key={a.recordId} className="achv-attempt">
                            <td className="small">{i + 1}번째 · {whenText(a.completedAt)}</td>
                            <td />
                            <td>{a.completion}</td>
                            <td>{a.inspection}</td>
                            <td>{a.errorCount}</td>
                            <td>{a.duration}</td>
                            <td />
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="small">걸린 시간은 화면을 가린 시간을 뺀 활성 시간입니다. ‘완료’는 교관 검사를 통과해야만 되므로 검사 칸에 몇 번째에 통과했는지를 보입니다. 학번은 학생을 알아볼 수 있는 값이니 화면을 공유하지 마세요.</p>
        </>
      )}
    </section>
  )
}
