import { useEffect, useState } from 'react'
import { createDemoSession, listTasks, validateStudentCode, entryKindFor, ENTRY_TEXT, APP_VERSION } from '../app/session'
import { knownCaseIds, loadPreset, type TeacherPreset } from '../app/teacherPreset'
import { screenPreset, type ClassLinkTaken } from '../app/classLink'
import { todayTask, todayTaskText } from '../app/todayTask'
import type { SessionContext } from '../domain/record'
import type { DifficultyMode } from '../domain/taskEngine'
import type { ApprovedTask } from '../domain/types'
import type { Draft, Repository } from '../records/repository'
import { startOrResume } from '../app/saveRecovery'
import { NO_RECORD_CODE } from '../records/memoryRepository'
import { TeacherPanel } from './TeacherPanel'
import { lessonAttemptRole } from '../app/lesson'
import { isClassSession } from '../app/sessions'
import { CLASS_START_NOTE } from '../delivery/autoSend'

// 시작 화면(설계 docs/superpowers/specs/2026-11-14-student-number-and-class-link-design.md §3-2·§3-3):
// 학생은 학번(리허설 세션은 가상 코드)만 넣는다. 과제·차시·도움 방식은 교사가 정하고(교사 화면 또는 수업 주소), 여기서는 '오늘 과제' 한 줄로만 보인다.
// 교사 설정이 없는 기기는 기본값(시연 세션 · 첫 과제 · 1~2차시 연습 · 안내 있음 · 진입 방향 없음)으로 들어간다.
export function StartScreen({ repo, onStart, onFoundDraft, classLink, autoSend = false, sendTick = 0 }: { repo: Repository; onStart: (s: SessionContext, t: ApprovedTask, m: DifficultyMode, noRecord?: boolean) => Promise<string | null>
  /** 같은 코드·세션의 끝내지 않은 초안을 찾았을 때(D4) — 이어서 하기 화면으로. startFresh는 오늘 과제로 새 수행을 시작한다 */
  onFoundDraft?: (d: Draft, startFresh: () => Promise<void>) => void
  /** 앱이 열릴 때 읽은 수업 주소(main.tsx). 읽지 못했으면 안내를 보이고, 기기에 저장하지 못한 설정은 이번 화면에서만 쓴다 */
  classLink?: ClassLinkTaken
  /** 수업용 세션 기록을 마치면 바로 보내는 빌드인가(전송 주소가 있을 때, 설계 2026-11-15-class-records §3-3) — 수업용 세션이면 안내 한 줄 */
  autoSend?: boolean
  /** 자동 전송이 한 차례 끝날 때마다 바뀐다 — 확정·전송 대기 건수를 새로 읽는다 */
  sendTick?: number }) {
  const tasks = listTasks()
  const caseIds = knownCaseIds(tasks)
  const [preset, setPreset] = useState<TeacherPreset | null>(() => screenPreset(classLink, () => loadPreset(caseIds)))
  const [code, setCode] = useState('')
  // 오늘 세션·과제는 교사 화면(또는 수업 주소)에서 정한다. 정하지 않았으면 기본값(app/todayTask.ts — 이어 하기 화면과 같은 규칙)
  const today = todayTask(preset, tasks)
  const { sessionCode, task, usagePhase: phase, difficultyMode: mode, vehicleEntryDirection: entryDir } = today
  const entryKind = entryKindFor(sessionCode)
  const entry = ENTRY_TEXT[entryKind]
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [counts, setCounts] = useState<{ records: number; outbox: number } | null>(null)
  const [teacherOpen, setTeacherOpen] = useState(false)

  const refreshCounts = async () => {
    const all = await repo.listRecords()
    const outbox = await repo.listOutbox()
    setCounts({ records: all.length, outbox: outbox.length })
  }
  useEffect(() => { void refreshCounts() }, [repo, sendTick]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 교사 설정이 바뀌면 오늘 과제·입장 방식도 그 값을 따른다(위에서 설정으로 계산) */
  const applyPreset = (p: TeacherPreset | null) => setPreset(p)

  // 실패하면 버튼 옆에 이유를 보이고 버튼을 다시 쓸 수 있게 한다(구형 태블릿에서 조용히 멈추던 문제, 2026-10-28)
  // noRecord: 비기록 모드(설계 2026-11-02) — 학번(코드) 없이 시작하고 기록·전송·AI 교관을 끈다
  const start = async (noRecord = false) => {
    const v = noRecord ? { ok: true as const, code: NO_RECORD_CODE } : validateStudentCode(code, sessionCode)
    if (!v.ok) return setError(v.reason)
    setError(null)
    setBusy(true)
    try {
      const begin = async () => {
        const err = await onStart(createDemoSession({ studentCode: v.code, sessionCode, attemptRole: lessonAttemptRole(phase), usagePhase: phase, vehicleEntryDirection: entryDir, task, difficultyMode: mode }), task, mode, noRecord)
        if (err) setError(err)
      }
      // D4: 현재 수행 포인터가 사라져도 같은 코드·같은 세션의 끝내지 않은 초안이 이 기기에 있으면 이어서 하기로 보낸다
      await startOrResume({ listDrafts: () => repo.listDrafts(), code: v.code, sessionCode, begin, onFound: noRecord ? undefined : onFoundDraft })
    } catch (e) {
      setError(`시작하지 못했습니다: ${(e as Error).message || String(e)} — 이 문구를 교사에게 알려 주세요.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen start wa">
      <h1>섀시 가상 실습장</h1>
      <p className="start-sub">제동력 측정 · 최소회전반경 측정</p>
      {classLink?.kind === 'bad' && <p className="error" role="alert">수업 주소를 읽지 못했어요. 선생님께 알려 주세요.</p>}
      <section className="card start-guide" aria-label="사용 안내">
        <h2>이렇게 해요</h2>
        <ol>
          <li>{entryKind === 'virtualCode' ? <>선생님이 알려 준 <b>가상 코드</b>를 넣고 시작해요.</> : <>내 <b>학번</b> 네 자리를 넣고 시작해요.</>}</li>
          <li>처음이면 <b>내 캐릭터</b>를 만들어요.</li>
          <li>실습장에서 <b>교관</b>에게 가서 과제를 받아요.</li>
          <li>작업 순서대로 수행하고, 다 끝나면 교관에게 <b>검사</b>를 받아요.</li>
        </ol>
      </section>
      <section className="card">
        <label>
          {entry.label} ({entry.example})
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={entry.placeholder} inputMode={entry.inputMode} maxLength={4}
            {...(entryKind === 'studentNumber' ? { pattern: '[0-9]*' } : { autoCapitalize: 'characters' })} autoComplete="off" autoCorrect="off" spellCheck={false} aria-label={entry.word} />
        </label>
        <span className="small">이름·연락처는 넣지 않아요.</span>
      </section>
      <section className="card start-today" aria-label="오늘 과제">
        <p><b>오늘 과제</b> {todayTaskText(today)}</p>
        {autoSend && isClassSession(sessionCode) && <p className="small">{CLASS_START_NOTE}</p>}
      </section>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" onClick={() => start()} disabled={busy}>{busy ? '준비 중…' : '과제 수령하러 가기'}</button>
      <section className="card norecord">
        <button onClick={() => start(true)} disabled={busy}>기록 없이 하기</button>
        <span className="small">{entry.word} 없이 같은 과제를 해요. 기록을 이 기기에 남기거나 보내지 않고, AI 교관도 쓰지 않아요. 새로고침하면 처음부터 다시 해요.</span>
      </section>
      {teacherOpen ? (
        <TeacherPanel repo={repo} tasks={tasks} preset={preset} counts={counts} onPresetChange={applyPreset} onCountsChange={refreshCounts} onClose={() => setTeacherOpen(false)} />
      ) : (
        <footer className="small teacher">
          <button className="link" onClick={() => { void refreshCounts(); setTeacherOpen(true) }}>교사 화면(수업 설정·기록 관리)</button> · 이 기기 확정 기록 {counts?.records ?? '…'}건 (전송 대기 {counts?.outbox ?? '…'}건)
          <br />시연용 앱 {APP_VERSION} · 연구 기록으로 쓰이지 않음
        </footer>
      )}
    </main>
  )
}
