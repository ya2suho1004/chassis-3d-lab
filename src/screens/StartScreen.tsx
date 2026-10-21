import { useState } from 'react'
import { createDemoSession, listTasks, validateStudentCode, APP_VERSION } from '../app/session'
import type { SessionContext } from '../domain/record'
import type { DifficultyMode } from '../domain/taskEngine'
import type { ApprovedTask } from '../domain/types'

export function StartScreen({ onStart }: { onStart: (s: SessionContext, t: ApprovedTask, m: DifficultyMode) => void }) {
  const tasks = listTasks()
  const [code, setCode] = useState('')
  const [sessionCode] = useState('DEMO-ONLY')
  const [taskIdx, setTaskIdx] = useState(0)
  const [mode, setMode] = useState<DifficultyMode>('guided')
  const [error, setError] = useState<string | null>(null)

  const start = () => {
    const v = validateStudentCode(code)
    if (!v.ok) return setError(v.reason)
    setError(null)
    const task = tasks[taskIdx]!
    onStart(createDemoSession({ studentCode: v.code, sessionCode, attemptRole: mode === 'guided' ? 'practice' : 'primary' }), task, mode)
  }

  return (
    <main className="screen start">
      <h1>섀시 가상 실습장 — 제동력 측정 과제</h1>
      <p className="banner">시연용(demo) · 3D·저장·전송 없음 · 연구 기록으로 쓰이지 않음 · 앱 {APP_VERSION}</p>
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
      <button className="primary" onClick={start}>과제 수령하러 가기</button>
    </main>
  )
}
