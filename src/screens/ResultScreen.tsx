import { useMemo } from 'react'
import { buildRecordPayload, type SessionContext } from '../domain/record'
import type { TaskRun } from '../domain/taskEngine'
import { summarizeResponses } from '../domain/grading'

export function ResultScreen({ session, run, completionStatus, onNextStudent }: { session: SessionContext; run: TaskRun; completionStatus: 'completed' | 'aborted'; onNextStudent: () => void }) {
  const payload = useMemo(() => {
    try {
      return { ok: true as const, value: buildRecordPayload(run, session, { completedAtIso: new Date().toISOString(), completionStatus, experiencedDisplayModes: ['diagram'] }) }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  }, [run, session, completionStatus])
  const sum = summarizeResponses(run.responses)
  const json = payload.ok ? JSON.stringify(payload.value, null, 2) : ''

  const download = () => {
    const b = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = `record-${session.anonymousStudentCode}-${session.recordId.slice(0, 8)}.json`
    a.click()
  }

  return (
    <main className="screen result">
      <h1>수행 결과 — {completionStatus === 'completed' ? 'NPC 검사 통과' : '중단'}</h1>
      <div className="status3">
        <span>실습 결과: <b>{payload.ok ? payload.value.npcInspectionResult === 'passed' ? '통과' : payload.value.npcInspectionResult === 'needsCorrection' ? '보완' : '미완료' : '—'}</b></span>
        <span>이 기기 저장: <b>없음(2단계 전반부)</b></span>
        <span>온라인 접수: <b>없음(시연)</b></span>
      </div>
      <section className="card grid2">
        <div>
          <h2>요약</h2>
          <ul>
            <li>활성 학습시간: {payload.ok ? payload.value.durationSeconds : '—'} 초</li>
            <li>학습 오류: {run.errorCount} ({Object.entries(run.errorTypes).map(([k, v]) => `${k} ${v}`).join(', ') || '없음'})</li>
            <li>안전 위반: {run.safetyViolationCount} ({Object.entries(run.safetyViolationTypes).map(([k, v]) => `${k} ${v}`).join(', ') || '없음'})</li>
            <li>힌트 요청: {run.hintCount}</li>
            <li>NPC 검사 횟수: {run.npcInspectionCount}</li>
          </ul>
        </div>
        <div>
          <h2>판독·계산·판정</h2>
          <ul>
            <li>차량 판정(정답): <b>{sum.vehicleVerdict === 'pass' ? '양호' : sum.vehicleVerdict === 'fail' ? '불량' : '판정 불가'}</b></li>
            <li>최초 판정 정오: {sum.judgmentCorrect === null ? '미응답' : sum.judgmentCorrect ? '정답' : '오답'} / 최종: {sum.finalJudgmentCorrect === null ? '미응답' : sum.finalJudgmentCorrect ? '정답' : '오답'}</li>
            <li>최초 정답 {sum.firstCorrectCount}/{sum.requiredCount}, 최종 정답 {sum.finalCorrectCount}/{sum.requiredCount}, 미응답 {sum.unansweredFirstCount}</li>
          </ul>
          <table className="sheet small">
            <thead><tr><th>항목</th><th>제시/기준값</th><th>최초 답</th><th>최종 답</th></tr></thead>
            <tbody>
              {sum.measurementInputs.map((i) => <tr key={i.itemId}><td>{i.itemId}</td><td>{i.presentedValue}</td><td>{i.firstInput ?? '—'} {i.firstCorrect === true ? '✓' : i.firstCorrect === false ? '✗' : ''}</td><td>{i.finalInput ?? '—'} {i.finalCorrect === true ? '✓' : i.finalCorrect === false ? '✗' : ''}</td></tr>)}
              {sum.calculationAnswers.map((i) => <tr key={i.itemId}><td>{i.itemId}</td><td>{i.computedReferenceValue}</td><td>{i.firstInput ?? '—'} {i.firstCorrect === true ? '✓' : i.firstCorrect === false ? '✗' : ''}</td><td>{i.finalInput ?? '—'} {i.finalCorrect === true ? '✓' : i.finalCorrect === false ? '✗' : ''}</td></tr>)}
              {sum.judgmentAnswers.map((i) => <tr key={i.itemId}><td>{i.itemId}</td><td>{sum.vehicleVerdict}</td><td>{i.firstAnswer ?? '—'} {i.firstCorrect === true ? '✓' : i.firstCorrect === false ? '✗' : ''}</td><td>{i.finalAnswer ?? '—'} {i.finalCorrect === true ? '✓' : i.finalCorrect === false ? '✗' : ''}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2>연구 기록 payload (record.schema 1.0.0 형식 · 시연이므로 researchEligible=false)</h2>
        {payload.ok ? <textarea readOnly value={json} rows={14} aria-label="payload" /> : <p className="error">{payload.error}</p>}
        <div className="row">
          <button onClick={download} disabled={!payload.ok}>JSON 내려받기</button>
          <button className="primary" onClick={onNextStudent}>다음 학생</button>
        </div>
      </section>
    </main>
  )
}
