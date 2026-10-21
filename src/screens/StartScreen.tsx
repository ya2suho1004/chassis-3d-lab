import { useEffect, useState } from 'react'
import { createDemoSession, listTasks, validateStudentCode, APP_VERSION } from '../app/session'
import type { SessionContext } from '../domain/record'
import type { DifficultyMode } from '../domain/taskEngine'
import type { ApprovedTask } from '../domain/types'
import type { Repository } from '../records/repository'
import { toSummaryCsv } from '../records/csv'

const TEACHER_PIN = '0000' // 시연용. 화면 숨김·공통 PIN은 보안 통제가 아니다(설계 03 §7).

export function StartScreen({ repo, onStart }: { repo: Repository; onStart: (s: SessionContext, t: ApprovedTask, m: DifficultyMode) => Promise<string | null> }) {
  const tasks = listTasks()
  const [code, setCode] = useState('')
  const [sessionCode] = useState('DEMO-ONLY')
  const [taskIdx, setTaskIdx] = useState(0)
  const [mode, setMode] = useState<DifficultyMode>('guided')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [counts, setCounts] = useState<{ records: number; outbox: number } | null>(null)

  useEffect(() => {
    ;(async () => {
      const all = await repo.listRecords()
      const outbox = await repo.listOutbox()
      setCounts({ records: all.length, outbox: outbox.length })
    })()
  }, [repo])

  const start = async () => {
    const v = validateStudentCode(code)
    if (!v.ok) return setError(v.reason)
    setError(null)
    setBusy(true)
    const task = tasks[taskIdx]!
    const err = await onStart(createDemoSession({ studentCode: v.code, sessionCode, attemptRole: mode === 'guided' ? 'practice' : 'primary' }), task, mode)
    setBusy(false)
    if (err) setError(err)
  }

  const teacherCsv = async () => {
    const pin = window.prompt('교사용 CSV: PIN을 입력하세요 (시연용 0000)')
    if (pin !== TEACHER_PIN) return
    const rows = await repo.listRecords()
    const csv = toSummaryCsv(rows.map((r) => ({ payload: r.payload, envelope: r.envelope })))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `chassis-records-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <main className="screen start">
      <h1>섀시 가상 실습장 — 제동력 측정 과제</h1>
      <p className="banner">시연용(demo) · 3D·전송 없음 · 이 기기에만 저장 · 연구 기록으로 쓰이지 않음 · 앱 {APP_VERSION}</p>
      <section className="card">
        <label>
          수업 세션 코드
          <input value={sessionCode} readOnly aria-label="세션 코드" />
        </label>
        <label>
          익명 코드 (예: A-01)
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="A-01" inputMode="text" aria-label="익명 코드" />
        </label>
        <span className="small">이름·학번·연락처는 입력하지 않습니다. 코드 형식 검사는 본인 확인이 아닙니다.</span>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <section className="card">
        <h2>과제 사례</h2>
        {tasks.map((t, i) => (
          <label key={t.measurement.caseId} className="radio">
            <input type="radio" name="task" checked={taskIdx === i} onChange={() => setTaskIdx(i)} /> {t.title}
          </label>
        ))}
      </section>
      <section className="card">
        <h2>도움 방식</h2>
        <label className="radio"><input type="radio" name="mode" checked={mode === 'guided'} onChange={() => setMode('guided')} /> 안내 있음 (견습) — 다음 할 일을 알려 줌</label>
        <label className="radio"><input type="radio" name="mode" checked={mode === 'unguided'} onChange={() => setMode('unguided')} /> 안내 없음 (정비사) — 순서를 스스로 찾음, 안전 경고는 유지</label>
      </section>
      <button className="primary" onClick={start} disabled={busy}>{busy ? '초안 저장 중…' : '과제 수령하러 가기'}</button>
      <footer className="small teacher">
        교사용 · 이 기기에 저장된 확정 기록 {counts?.records ?? '…'}건 (전송 대기 {counts?.outbox ?? '…'}건) ·{' '}
        <button className="link" onClick={teacherCsv}>요약 CSV 내려받기</button>
      </footer>
    </main>
  )
}
