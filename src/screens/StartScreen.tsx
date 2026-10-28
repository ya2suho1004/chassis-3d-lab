import { useEffect, useState } from 'react'
import { createDemoSession, listTasks, validateStudentCode, APP_VERSION } from '../app/session'
import { caseKey, ENTRY_LABEL, loadPreset, MODE_LABEL, PHASE_LABEL, type TeacherPreset } from '../app/teacherPreset'
import type { SessionContext } from '../domain/record'
import type { DifficultyMode } from '../domain/taskEngine'
import type { UsagePhase } from '../domain/record'
import type { ApprovedTask } from '../domain/types'
import type { Repository } from '../records/repository'
import { SUBMIT_IS_FAKE } from '../delivery/config'
import { TeacherPanel } from './TeacherPanel'
import { LESSON_LABEL, lessonAttemptRole, lessonMode } from '../app/lesson'

export function StartScreen({ repo, onStart }: { repo: Repository; onStart: (s: SessionContext, t: ApprovedTask, m: DifficultyMode) => Promise<string | null> }) {
  const tasks = listTasks()
  const caseIds = tasks.map(caseKey).filter((k) => k !== '')
  const [preset, setPreset] = useState<TeacherPreset | null>(() => loadPreset(caseIds))
  const [code, setCode] = useState('')
  const [sessionCode] = useState('DEMO-ONLY')
  const [taskIdx, setTaskIdx] = useState(() => Math.max(0, preset ? tasks.findIndex((t) => caseKey(t) === preset.caseId) : 0))
  const [mode, setMode] = useState<DifficultyMode>(preset?.difficultyMode ?? 'guided')
  const [phase, setPhase] = useState<UsagePhase>(preset?.usagePhase ?? 'preview')
  const [entryDir, setEntryDir] = useState<'north' | 'south' | null>(preset?.vehicleEntryDirection ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [counts, setCounts] = useState<{ records: number; outbox: number } | null>(null)
  const [teacherOpen, setTeacherOpen] = useState(false)
  const locked = preset?.locked === true

  const refreshCounts = async () => {
    const all = await repo.listRecords()
    const outbox = await repo.listOutbox()
    setCounts({ records: all.length, outbox: outbox.length })
  }
  useEffect(() => { void refreshCounts() }, [repo]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 교사 설정이 바뀌면 시작 화면 선택도 그 값으로 맞춘다 */
  const applyPreset = (p: TeacherPreset | null) => {
    setPreset(p)
    if (!p) return
    setTaskIdx(Math.max(0, tasks.findIndex((t) => caseKey(t) === p.caseId)))
    setMode(p.difficultyMode)
    setPhase(p.usagePhase)
    setEntryDir(p.vehicleEntryDirection)
  }

  // 실패하면 버튼 옆에 이유를 보이고 버튼을 다시 쓸 수 있게 한다(구형 태블릿에서 조용히 멈추던 문제, 2026-10-28)
  const start = async () => {
    const v = validateStudentCode(code)
    if (!v.ok) return setError(v.reason)
    setError(null)
    setBusy(true)
    try {
      const task = tasks[taskIdx]!
      const m = lessonMode(phase, mode)
      const err = await onStart(createDemoSession({ studentCode: v.code, sessionCode, attemptRole: lessonAttemptRole(phase), usagePhase: phase, vehicleEntryDirection: entryDir, task, difficultyMode: m }), task, m)
      if (err) setError(err)
    } catch (e) {
      setError(`시작하지 못했습니다: ${(e as Error).message || String(e)} — 이 문구를 교사에게 알려 주세요.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen start">
      <h1>섀시 가상 실습장 — 제동력 측정 과제</h1>
      <p className="banner">시연용(demo) · 이 기기에 먼저 저장 · 전송은 교사 조작으로만{SUBMIT_IS_FAKE ? '(개발용 가짜 수신점)' : ''} · 연구 기록으로 쓰이지 않음 · 앱 {APP_VERSION}</p>
      <section className="card">
        <label>
          수업 세션 코드
          <input value={sessionCode} readOnly aria-label="세션 코드" />
        </label>
        <label>
          익명 코드 (예: A-01)
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="A-01" inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} aria-label="익명 코드" />
        </label>
        <span className="small">이름·학번·연락처는 입력하지 않습니다. 코드 형식 검사는 본인 확인이 아닙니다. 전송 시험 중에는 합성 코드 D-01 같은 D-xx만 수신점이 받습니다.</span>
        {error && <p className="error">{error}</p>}
      </section>
      {locked ? (
        <section className="card">
          <h2>오늘 수업 설정 (교사가 정함)</h2>
          <p>{tasks[taskIdx]!.title} · {PHASE_LABEL[phase]} · {MODE_LABEL[lessonMode(phase, mode)]} · {ENTRY_LABEL(entryDir)}</p>
          <p className="small">익명 코드만 입력하고 시작하세요. 설정은 교사 화면에서 바꿉니다.</p>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>과제 사례</h2>
            {tasks.map((t, i) => (
              <label key={t.measurement.caseId} className="radio">
                <input type="radio" name="task" checked={taskIdx === i} onChange={() => setTaskIdx(i)} /> {t.title}
              </label>
            ))}
          </section>
          <section className="card">
            <h2>차시 (5차시 수업 중 언제인가)</h2>
            {(['preview', 'review', 'other'] as UsagePhase[]).map((p) => (
              <label key={p} className="radio"><input type="radio" name="phase" checked={phase === p} onChange={() => { setPhase(p); if (p === 'review') setMode('unguided') }} /> {LESSON_LABEL[p]}</label>
            ))}
          </section>
          <section className="card">
            <h2>도움 방식 (어떻게 돕는가)</h2>
            <label className="radio"><input type="radio" name="mode" disabled={phase === 'review'} checked={lessonMode(phase, mode) === 'guided'} onChange={() => setMode('guided')} /> 안내 있음 (견습) — 다음 할 일을 알려 줌</label>
            <label className="radio"><input type="radio" name="mode" disabled={phase === 'review'} checked={lessonMode(phase, mode) === 'unguided'} onChange={() => setMode('unguided')} /> 안내 없음 (정비사) — 순서를 스스로 찾음, 안전 경고는 유지</label>
            {phase === 'review' && <span className="small">5차시 정리는 안내 없음으로 고정됩니다.</span>}
          </section>
          <section className="card">
            <h2>차량 진입 방향 (교사 설정 · 세션 값)</h2>
            <label className="radio"><input type="radio" name="entry" checked={entryDir === null} onChange={() => setEntryDir(null)} /> 미설정 — 3D는 북쪽 자리를 가정으로 표시하고 진입 연출을 하지 않음</label>
            <label className="radio"><input type="radio" name="entry" checked={entryDir === 'north'} onChange={() => setEntryDir('north')} /> 북쪽에서 진입 (차체가 롤러 북쪽)</label>
            <label className="radio"><input type="radio" name="entry" checked={entryDir === 'south'} onChange={() => setEntryDir('south')} /> 남쪽에서 진입 (차체가 롤러 남쪽)</label>
            <span className="small">실제 실습실은 북·남 모두 가능(교사 확인 2026-10-21). 기록 계약 1.1.0에는 이 필드가 없어 연구 기록에 저장되지 않습니다(Codex 계약 개정 제안).</span>
          </section>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" onClick={start} disabled={busy}>{busy ? '준비 중…' : '과제 수령하러 가기'}</button>
      {teacherOpen ? (
        <TeacherPanel repo={repo} tasks={tasks} preset={preset} counts={counts} onPresetChange={applyPreset} onCountsChange={refreshCounts} onClose={() => setTeacherOpen(false)} />
      ) : (
        <footer className="small teacher">
          교사용 · 이 기기 확정 기록 {counts?.records ?? '…'}건 (전송 대기 {counts?.outbox ?? '…'}건) ·{' '}
          <button className="link" onClick={() => setTeacherOpen(true)}>교사 화면(수업 설정·기록 관리)</button>
        </footer>
      )}
    </main>
  )
}
