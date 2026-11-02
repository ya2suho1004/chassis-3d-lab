import { useEffect, useState } from 'react'
import { createDemoSession, listTasks, validateStudentCode, APP_VERSION } from '../app/session'
import { caseKey, loadPreset, MODE_LABEL, PHASE_LABEL, type TeacherPreset } from '../app/teacherPreset'
import type { SessionContext } from '../domain/record'
import type { DifficultyMode } from '../domain/taskEngine'
import type { UsagePhase } from '../domain/record'
import type { ApprovedTask } from '../domain/types'
import type { Repository } from '../records/repository'
import { NO_RECORD_CODE } from '../records/memoryRepository'
import { TeacherPanel } from './TeacherPanel'
import { LESSON_LABEL, lessonAttemptRole, lessonMode } from '../app/lesson'
import { DEFAULT_SESSION_CODE, applySessionRules, sessionDef } from '../app/sessions'

export function StartScreen({ repo, onStart }: { repo: Repository; onStart: (s: SessionContext, t: ApprovedTask, m: DifficultyMode, noRecord?: boolean) => Promise<string | null> }) {
  const tasks = listTasks()
  const caseIds = tasks.map(caseKey).filter((k) => k !== '')
  const [preset, setPreset] = useState<TeacherPreset | null>(() => loadPreset(caseIds))
  const [code, setCode] = useState('')
  // 오늘 세션은 교사 화면에서 정한다(설계 2026-11-03-class-sessions). 정하지 않았으면 시연 세션
  const sessionCode = preset?.sessionCode ?? DEFAULT_SESSION_CODE
  const sess = sessionDef(sessionCode)
  const [taskIdx, setTaskIdx] = useState(() => Math.max(0, preset ? tasks.findIndex((t) => caseKey(t) === preset.caseId) : 0))
  const [mode, setMode] = useState<DifficultyMode>(preset?.difficultyMode ?? 'guided')
  const [phase, setPhase] = useState<UsagePhase>(preset?.usagePhase ?? 'preview')
  // 차량 진입 방향은 교사 화면(수업 설정)에서만 정한다(시작 화면 정리 2026-11-03)
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
  // noRecord: 비기록 모드(설계 2026-11-02) — 익명 코드 없이 시작하고 기록·전송·AI 교관을 끈다
  const start = async (noRecord = false) => {
    const v = noRecord ? { ok: true as const, code: NO_RECORD_CODE } : validateStudentCode(code)
    if (!v.ok) return setError(v.reason)
    setError(null)
    setBusy(true)
    try {
      const task = tasks[taskIdx]!
      const fixed = applySessionRules(sessionCode, { usagePhase: phase, difficultyMode: mode })
      const m = lessonMode(fixed.usagePhase, fixed.difficultyMode)
      const err = await onStart(createDemoSession({ studentCode: v.code, sessionCode, attemptRole: lessonAttemptRole(fixed.usagePhase), usagePhase: fixed.usagePhase, vehicleEntryDirection: entryDir, task, difficultyMode: m }), task, m, noRecord)
      if (err) setError(err)
    } catch (e) {
      setError(`시작하지 못했습니다: ${(e as Error).message || String(e)} — 이 문구를 교사에게 알려 주세요.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen start">
      <h1>섀시 가상 실습장</h1>
      <p className="start-sub">제동력 측정 · 최소회전반경 측정</p>
      <section className="card start-guide" aria-label="사용 안내">
        <h2>이렇게 해요</h2>
        <ol>
          <li>선생님이 알려 준 <b>익명 코드</b>를 넣고 시작해요.</li>
          <li>처음이면 <b>내 캐릭터</b>를 만들어요.</li>
          <li>실습장에서 <b>교관</b>에게 가서 과제를 받아요.</li>
          <li>작업 순서대로 수행하고, 다 끝나면 교관에게 <b>검사</b>를 받아요.</li>
        </ol>
      </section>
      <section className="card">
        <label>
          익명 코드 (예: A-01)
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="A-01" inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} aria-label="익명 코드" />
        </label>
        <span className="small">이름·학번·연락처는 넣지 않아요.</span>
      </section>
      {locked ? (
        <section className="card">
          <h2>오늘 과제 (선생님이 정함)</h2>
          <p>{tasks[taskIdx]!.title} · {PHASE_LABEL[phase]} · {MODE_LABEL[lessonMode(phase, mode)]}{sessionCode !== DEFAULT_SESSION_CODE ? ` · 세션 ${sessionCode}` : ''}</p>
        </section>
      ) : (
        <section className="card start-pick">
          <h2>과제 고르기</h2>
          {tasks.map((t, i) => (
            <label key={t.measurement.caseId} className="radio">
              <input type="radio" name="task" checked={taskIdx === i} onChange={() => setTaskIdx(i)} /> {t.title}
            </label>
          ))}
          <h2>차시</h2>
          {(['preview', 'review', 'other'] as UsagePhase[]).map((p) => (
            <label key={p} className="radio"><input type="radio" name="phase" disabled={!!sess?.usagePhase} checked={phase === p} onChange={() => { setPhase(p); if (p === 'review') setMode('unguided') }} /> {LESSON_LABEL[p]}</label>
          ))}
          <h2>도움 방식</h2>
          <label className="radio"><input type="radio" name="mode" disabled={phase === 'review' || !!sess?.difficultyMode} checked={lessonMode(phase, mode) === 'guided'} onChange={() => setMode('guided')} /> 안내 있음 (견습) — 다음 할 일을 알려 줌</label>
          <label className="radio"><input type="radio" name="mode" disabled={phase === 'review' || !!sess?.difficultyMode} checked={lessonMode(phase, mode) === 'unguided'} onChange={() => setMode('unguided')} /> 안내 없음 (정비사) — 순서를 스스로 찾음, 안전 경고는 유지</label>
          {phase === 'review' && <span className="small">5차시 정리는 안내 없음으로 고정됩니다.</span>}
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" onClick={() => start()} disabled={busy}>{busy ? '준비 중…' : '과제 수령하러 가기'}</button>
      <section className="card norecord">
        <button onClick={() => start(true)} disabled={busy}>기록 없이 하기</button>
        <span className="small">익명 코드 없이 같은 과제를 합니다. 수행 기록을 이 기기에 저장하거나 보내지 않고, AI 교관도 쓰지 않습니다. 새로고침하면 처음부터 다시 합니다.</span>
      </section>
      {teacherOpen ? (
        <TeacherPanel repo={repo} tasks={tasks} preset={preset} counts={counts} onPresetChange={applyPreset} onCountsChange={refreshCounts} onClose={() => setTeacherOpen(false)} />
      ) : (
        <footer className="small teacher">
          <button className="link" onClick={() => setTeacherOpen(true)}>교사 화면(수업 설정·기록 관리)</button> · 이 기기 확정 기록 {counts?.records ?? '…'}건 (전송 대기 {counts?.outbox ?? '…'}건)
          <br />시연용 앱 {APP_VERSION} · 연구 기록으로 쓰이지 않음
        </footer>
      )}
    </main>
  )
}
