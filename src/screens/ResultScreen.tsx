import { useMemo } from 'react'
import { buildRecordPayload, type SessionContext } from '../domain/record'
import type { TaskRun } from '../domain/taskEngine'
import { summarizeResponses } from '../domain/grading'
import type { DeliveryEnvelope } from '../records/types'
import { toSummaryCsv } from '../records/csv'

const UPLOAD_LABEL: Record<string, string> = { pending: '대기(전송 기능 없음)', uploading: '제출 중', confirmationPending: '접수 확인 필요', acknowledged: '서버 접수 확인됨', rejected: '제출자료 확인 필요', conflict: '기록 충돌' }

export function ResultScreen({ session, run, completionStatus, envelope, saveError, onNextStudent }: {
  session: SessionContext; run: TaskRun; completionStatus: 'completed' | 'aborted'; envelope: DeliveryEnvelope | null; saveError: string | null; onNextStudent: () => void
}) {
  const payload = useMemo(() => {
    try {
      return { ok: true as const, value: buildRecordPayload(run, session, { completedAtIso: new Date().toISOString(), completionStatus, experiencedDisplayModes: ['diagram'] }) }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  }, [run, session, completionStatus])
  const sum = summarizeResponses(run.responses)
  const json = payload.ok ? JSON.stringify(payload.value, null, 2) : ''

  const dl = (text: string, name: string, type: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type }))
    a.download = name
    a.click()
  }
  const fallbackEnvelope: DeliveryEnvelope = { recordId: session.recordId, localSaveStatus: 'failed', uploadStatus: 'pending', uploadedAt: null, receiptId: null, payloadHash: null, uploadAttemptCount: 0, lastErrorCode: saveError, nextRetryAt: null }
  const env = envelope ?? fallbackEnvelope

  return (
    <main className="screen result">
      <h1>수행 결과 — {completionStatus === 'completed' ? 'NPC 검사 통과' : '중단'}</h1>
      <div className="status3">
        <span>실습 결과: <b>{payload.ok ? payload.value.npcInspectionResult === 'passed' ? '통과' : payload.value.npcInspectionResult === 'needsCorrection' ? '보완' : '미완료' : '—'}</b></span>
        <span>이 기기 저장: <b className={env.localSaveStatus === 'saved' ? 'ok' : 'bad'}>{env.localSaveStatus === 'saved' ? '저장됨' : '실패'}</b></span>
        <span>온라인 접수: <b>{UPLOAD_LABEL[env.uploadStatus] ?? env.uploadStatus}</b></span>
      </div>
      {saveError && <p className="error" role="alert">이 기기에 확정 기록을 저장하지 못했습니다 ({saveError}). 아래 JSON·CSV를 내려받아 교사에게 전달하세요. 손실 방지를 보장하지는 않습니다.</p>}
      <section className="card grid2">
        <div>
          <h2>요약</h2>
          <ul>
            <li>활성 학습시간: {payload.ok ? payload.value.durationSeconds : '—'} 초 (숨김·새로고침 공백 제외, 품질 {run.timeQuality})</li>
            <li>학습 오류: {run.errorCount} ({Object.entries(run.errorTypes).map(([k, v]) => `${k} ${v}`).join(', ') || '없음'})</li>
            <li>안전 위반: {run.safetyViolationCount} ({Object.entries(run.safetyViolationTypes).map(([k, v]) => `${k} ${v}`).join(', ') || '없음'})</li>
            <li>힌트 요청: {run.hintCount} · 일시중지 {run.pauseCount} · 재개 {run.resumeCount}</li>
            <li>NPC 검사 횟수: {run.npcInspectionCount}</li>
            <li>수업 시점: {session.usagePhase === 'preview' ? '대기 중 예습' : session.usagePhase === 'review' ? '실습 후 복습' : '기타'} · 도움 방식: {run.difficultyMode === 'guided' ? '안내 있음' : '안내 없음'}</li>
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
        <h2>연구 기록 payload (record.schema 1.1.0 형식 · 시연이므로 researchEligible=false)</h2>
        {payload.ok ? <textarea readOnly value={json} rows={12} aria-label="payload" /> : <p className="error">{payload.error}</p>}
        <div className="row">
          <button onClick={() => dl(json, `record-${session.anonymousStudentCode}-${session.recordId.slice(0, 8)}.json`, 'application/json')} disabled={!payload.ok}>JSON 내려받기</button>
          <button onClick={() => payload.ok && dl(toSummaryCsv([{ payload: payload.value, envelope: env }]), `record-${session.anonymousStudentCode}-${session.recordId.slice(0, 8)}.csv`, 'text/csv;charset=utf-8')} disabled={!payload.ok}>이 수행 CSV 내려받기</button>
          <button className="primary" onClick={onNextStudent}>다음 학생</button>
        </div>
        <p className="small">‘다음 학생’은 화면과 현재 수행만 비웁니다. 이 기기에 저장된 확정 기록은 지워지지 않으며 전송 기능이 생기면 원래 코드로 보내집니다.</p>
      </section>
    </main>
  )
}
