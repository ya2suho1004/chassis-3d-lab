import { useState } from 'react'
import type { SessionContext } from './domain/record'
import { createTaskRun, type DifficultyMode, type TaskRun } from './domain/taskEngine'
import type { ApprovedTask } from './domain/types'
import { StartScreen } from './screens/StartScreen'
import { TaskScreen } from './screens/TaskScreen'
import { ResultScreen } from './screens/ResultScreen'

type Screen =
  | { name: 'start' }
  | { name: 'task'; session: SessionContext; run: TaskRun }
  | { name: 'result'; session: SessionContext; run: TaskRun; completionStatus: 'completed' | 'aborted' }

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'start' })

  if (screen.name === 'start') {
    return (
      <StartScreen
        onStart={(session: SessionContext, task: ApprovedTask, mode: DifficultyMode) => {
          setScreen({ name: 'task', session, run: createTaskRun(task, { difficultyMode: mode }) })
        }}
      />
    )
  }
  if (screen.name === 'task') {
    return (
      <TaskScreen
        session={screen.session}
        initialRun={screen.run}
        onFinish={(run, completionStatus) => setScreen({ name: 'result', session: screen.session, run, completionStatus })}
      />
    )
  }
  return <ResultScreen session={screen.session} run={screen.run} completionStatus={screen.completionStatus} onNextStudent={() => setScreen({ name: 'start' })} />
}
