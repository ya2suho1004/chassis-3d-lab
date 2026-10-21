import { useEffect, useState } from 'react'
import type { SessionContext } from './domain/record'
import { createTaskRun, rehydrateRun, serializeRun, type DifficultyMode, type TaskRun } from './domain/taskEngine'
import type { ApprovedTask } from './domain/types'
import { openRepository, type Draft, type Repository } from './records/repository'
import type { DeliveryEnvelope } from './records/types'
import { StartScreen } from './screens/StartScreen'
import { TaskScreen } from './screens/TaskScreen'
import { ResultScreen } from './screens/ResultScreen'
import { ResumeScreen } from './screens/ResumeScreen'

type Screen =
  | { name: 'loading' }
  | { name: 'storageError'; message: string }
  | { name: 'resume'; draft: Draft }
  | { name: 'start' }
  | { name: 'task'; session: SessionContext; run: TaskRun }
  | { name: 'result'; session: SessionContext; run: TaskRun; completionStatus: 'completed' | 'aborted'; envelope: DeliveryEnvelope | null; saveError: string | null }

export function App() {
  const [repo, setRepo] = useState<Repository | null>(null)
  const [screen, setScreen] = useState<Screen>({ name: 'loading' })

  // 시작: 저장소 열기 → 현재 수행 포인터가 가리키는 초안이 있으면 재개 선택
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
    return () => {
      cancelled = true
    }
  }, [])

  const startNew = async (session: SessionContext, task: ApprovedTask, mode: DifficultyMode): Promise<string | null> => {
    if (!repo) return '저장소가 아직 열리지 않았습니다.'
    const run = createTaskRun(task, { difficultyMode: mode })
    // 최초 초안 저장이 끝나기 전에는 과제로 넘어가지 않는다 (ST-15)
    const r = await repo.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(run), savedAt: new Date().toISOString() })
    if (r.status === 'failed') return `이 기기에 초안을 저장하지 못했습니다 (${r.errorCode}). 브라우저 저장 공간·시크릿 모드를 확인한 뒤 다시 시도하세요.`
    repo.setCurrentRecordId(session.recordId)
    setScreen({ name: 'task', session, run })
    return null
  }

  if (screen.name === 'loading') return <main className="screen"><p>저장소를 여는 중…</p></main>
  if (screen.name === 'storageError') return <main className="screen"><p className="error">이 기기의 저장소(IndexedDB)를 열 수 없습니다: {screen.message}</p><p className="small">시크릿 모드이거나 브라우저가 저장을 막고 있을 수 있습니다. 저장 없이 진행하는 기능은 아직 없습니다.</p></main>

  if (screen.name === 'resume') {
    return (
      <ResumeScreen
        draft={screen.draft}
        onResume={() => {
          const run = rehydrateRun(screen.draft.snapshot)
          setScreen({ name: 'task', session: screen.draft.session, run })
        }}
        onDiscard={async () => {
          // 미완료 초안은 전송 대상이 아니다. 새 수행 선택 시 초안을 버리고 포인터를 지운다.
          await repo?.deleteDraft(screen.draft.recordId)
          repo?.clearCurrent()
          setScreen({ name: 'start' })
        }}
      />
    )
  }

  if (screen.name === 'start') return <StartScreen repo={repo!} onStart={startNew} />

  if (screen.name === 'task') {
    return (
      <TaskScreen
        repo={repo!}
        session={screen.session}
        initialRun={screen.run}
        onFinish={(run, completionStatus, envelope, saveError) => setScreen({ name: 'result', session: screen.session, run, completionStatus, envelope, saveError })}
      />
    )
  }

  return (
    <ResultScreen
      session={screen.session}
      run={screen.run}
      completionStatus={screen.completionStatus}
      envelope={screen.envelope}
      saveError={screen.saveError}
      onNextStudent={() => {
        // 화면·현재 포인터만 초기화. 확정 기록(outbox)은 보존된다.
        repo?.clearCurrent()
        setScreen({ name: 'start' })
      }}
    />
  )
}
