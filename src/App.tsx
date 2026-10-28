import { useEffect, useState } from 'react'
import type { SessionContext } from './domain/record'
import { createTaskRun, rehydrateRun, serializeRun, type DifficultyMode, type TaskRun } from './domain/taskEngine'
import type { ApprovedTask } from './domain/types'
import { openRepository, type Draft, type Repository } from './records/repository'
import type { DeliveryEnvelope } from './records/types'
import { StartScreen } from './screens/StartScreen'
import { ResultScreen } from './screens/ResultScreen'
import { ResumeScreen } from './screens/ResumeScreen'
import { LabScreen } from './screens/LabScreen'
import { listTasks } from './app/session'

type Screen =
  | { name: 'loading' }
  | { name: 'storageError'; message: string }
  | { name: 'resume'; draft: Draft }
  | { name: 'start' }
  | { name: 'lab'; session: SessionContext; task: ApprovedTask; mode: DifficultyMode; run: TaskRun | null }
  | { name: 'result'; session: SessionContext; run: TaskRun; completionStatus: 'completed' | 'aborted'; envelope: DeliveryEnvelope | null; saveError: string | null }

export function App() {
  const [repo, setRepo] = useState<Repository | null>(null)
  const [screen, setScreen] = useState<Screen>({ name: 'loading' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await openRepository()
        if (cancelled) return
        setRepo(r)
        const cur = r.getCurrentRecordId()
        const draft = cur ? await r.loadDraft(cur) : null
        setScreen(draft ? { name: 'resume', draft } : { name: 'start' })
      } catch (e) {
        setScreen({ name: 'storageError', message: (e as Error).message })
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (screen.name === 'loading') return <main className="screen"><p>저장소를 여는 중…</p></main>
  if (screen.name === 'storageError') return <main className="screen"><p className="error">이 기기의 저장소(IndexedDB)를 열 수 없습니다: {screen.message}</p><p className="small">시크릿 모드이거나 브라우저가 저장을 막고 있을 수 있습니다. 저장 없이 진행하는 기능은 아직 없습니다.</p></main>

  if (screen.name === 'resume') {
    return (
      <ResumeScreen
        draft={screen.draft}
        onResume={() => {
          const run = rehydrateRun(screen.draft.snapshot)
          const task = listTasks().find((t) => t.measurement.caseId === run.task.measurement.caseId) ?? run.task
          setScreen({ name: 'lab', session: screen.draft.session, task, mode: run.difficultyMode, run })
        }}
        onDiscard={async () => {
          await repo?.deleteDraft(screen.draft.recordId)
          repo?.clearCurrent()
          setScreen({ name: 'start' })
        }}
      />
    )
  }

  // 시작 화면에서는 세션만 만든다. 수행 번호(recordId)와 초안은 NPC에게 과제를 받을 때 발급·저장한다(설계 02 §3 S4).
  if (screen.name === 'start') return <StartScreen repo={repo!} onStart={async (session, task, mode) => { setScreen({ name: 'lab', session, task, mode, run: null }); return null }} />

  if (screen.name === 'lab') {
    const { session, task, mode } = screen
    return (
      <LabScreen
        repo={repo!}
        session={session}
        task={task}
        mode={mode}
        run={screen.run}
        onReceiveTask={async () => {
          if (!repo) return '저장소가 아직 열리지 않았습니다.'
          const run = createTaskRun(task, { difficultyMode: mode, displayMode: 'threeD' })
          const r = await repo.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run), savedAt: new Date().toISOString() })
          if (r.status === 'failed') return `이 기기에 초안을 저장하지 못했습니다 (${r.errorCode}). 저장 공간·시크릿 모드를 확인한 뒤 다시 시도하세요.`
          repo.setCurrentRecordId(session.recordId)
          setScreen({ ...screen, run })
          return null
        }}
        onRunChange={(run) => setScreen((s) => (s.name === 'lab' ? { ...s, run } : s))}
        onFinish={(run, completionStatus, envelope, saveError) => setScreen({ name: 'result', session, run, completionStatus, envelope, saveError })}
      />
    )
  }

  return (
    <ResultScreen session={screen.session} run={screen.run} completionStatus={screen.completionStatus} envelope={screen.envelope} saveError={screen.saveError}
      onNextStudent={() => { repo?.clearCurrent(); setScreen({ name: 'start' }) }} />
  )
}
