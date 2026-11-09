import { useMemo, useState } from 'react'
import { buildRecordPayload, type RecordPayload, type SessionContext } from '../domain/record'
import { resolveResultPayload } from '../app/resultPayload'
import type { TaskRun } from '../domain/taskEngine'
import { summarizeResponses } from '../domain/grading'
import type { DeliveryEnvelope } from '../records/types'
import { toSummaryCsv } from '../records/csv'
import { WorkLog } from './WorkLog'
import { isRequestPassed } from '../app/cozyState'
import { countsText, itemLabel, timeQualityLabel, verdictLabel } from '../app/resultLabels'
import { LESSON_SHORT } from '../app/lesson'

const UPLOAD_LABEL: Record<string, string> = { pending: '대기(교사가 전송 전)', uploading: '제출 중', confirmationPending: '접수 확인 필요', acknowledged: '서버 접수 확인됨', rejected: '제출자료 확인 필요', conflict: '기록 충돌' }
const ERROR_HINT: Record<string, string> = { TIMEOUT: '서버 응답이 오지 않음 — 저장 여부를 알 수 없어 같은 ID로 다시 확인합니다', NETWORK_ERROR: '네트워크 오류 — 서버 저장 여부를 알 수 없어 같은 ID로 다시 확인합니다', UNREADABLE_ACK: '서버 응답을 읽지 못함(로그인 페이지·차단 가능)', HASH_MISMATCH: '서버 해시가 로컬 계산과 다름', RECORD_ID_CONFLICT: '같은 수행 번호로 다른 내용이 이미 접수됨', INVALID_PAYLOAD: '서버가 기록 형식을 거절함', SESSION_NOT_ALLOWED: '시험 세션·접수 기간이 아님' }

export function ResultScreen({ session, run, completionStatus, envelope, saveError, frozenPayload = null, noRecord = false, nickname, onNextStudent, onRetrySave }: {
  session: SessionContext; run: TaskRun; completionStatus: 'completed' | 'aborted'; envelope: DeliveryEnvelope | null; saveError: string | null
  /** 확정 저장한 원본(G2). 있으면 표시·JSON·CSV 모두 이것을 쓴다 */
  frozenPayload?: RecordPayload | null
  /** 비기록 모드(설계 2026-11-02): 저장·접수 상태와 payload·내려받기를 숨긴다 */
  noRecord?: boolean
  /** 캐릭터 닉네임(화면 표시만, 기록에는 없음) */
  nickname?: string; onNextStudent: () => void
  /** 확정 저장 실패 뒤 같은 원본으로 다시 저장(D4). 성공하면 null, 실패하면 오류 코드 */
  onRetrySave?: () => Promise<string | null>
}) {
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  /** 확정 기록이 저장되지 않은 채 '다음 학생'을 처음 누르면 한 번 더 확인한다(D4) */
  const [confirmLeave, setConfirmLeave] = useState(false)
  const unsaved = !noRecord && !!saveError
  const retry = async () => {
    if (!onRetrySave || retrying) return
    setRetrying(true)
    setRetryError(null)
    const err = await onRetrySave()
    setRetrying(false)
    if (err) setRetryError(err)
  }
  const next = () => {
    if (unsaved && !confirmLeave) return setConfirmLeave(true)
    onNextStudent()
  }
  const payload = useMemo(
    () => resolveResultPayload(frozenPayload, () => buildRecordPayload(run, session, { completedAtIso: new Date().toISOString(), completionStatus })),
    [frozenPayload, run, session, completionStatus],
  )
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
    <main className="screen result wa">
      <h1>{nickname ? `${nickname}의 ` : ''}수행 결과 — {completionStatus === 'completed' ? 'NPC 검사 통과' : '중단'}</h1>
      <WorkLog run={run} passed={isRequestPassed(completionStatus, payload)} nickname={nickname} />
      <div className="status3">
        <span>실습 결과: <b>{payload.ok ? payload.value.npcInspectionResult === 'passed' ? '통과' : payload.value.npcInspectionResult === 'needsCorrection' ? '보완' : '미완료' : '—'}</b></span>
        {noRecord ? (
          <span>기록: <b>기록 없이 한 수행</b> — 이 기기에 저장하거나 보내지 않았습니다</span>
        ) : (
          <>
            <span>이 기기 저장: <b className={env.localSaveStatus === 'saved' ? 'ok' : 'bad'}>{env.localSaveStatus === 'saved' ? '저장됨' : '실패'}</b></span>
            <span>온라인 접수: <b>{UPLOAD_LABEL[env.uploadStatus] ?? env.uploadStatus}</b>{env.receiptId ? <span className="small"> · 접수번호 {env.receiptId}</span> : null}{env.lastErrorCode && env.uploadStatus !== 'acknowledged' ? <span className="small"> · {ERROR_HINT[env.lastErrorCode] ?? env.lastErrorCode}</span> : null}</span>
          </>
        )}
      </div>
      {unsaved && (
        <div className="card" role="alert">
          <p className="error">이 기기에 확정 기록을 저장하지 못했습니다 ({retryError ?? saveError}). 먼저 ‘다시 저장’을 눌러 보세요. 같은 수행 번호·같은 내용으로 다시 저장합니다.</p>
          {onRetrySave && <div className="row"><button className="primary" onClick={() => void retry()} disabled={retrying}>{retrying ? '저장 중…' : '다시 저장'}</button></div>}
          <p className="small">계속 안 되면 아래 JSON·CSV를 내려받아 교사에게 전달하세요. 손실 방지를 보장하지는 않습니다.</p>
        </div>
      )}
      <section className="card grid2">
        <div>
          <h2>요약</h2>
          <ul>
            <li>활성 학습시간: {payload.ok ? payload.value.durationSeconds : '—'} 초 (화면을 가린 시간·새로고침 공백 제외 · {timeQualityLabel(run.timeQuality)})</li>
            <li>학습 오류: {run.errorCount} ({countsText(run.errorTypes)})</li>
            <li>안전 위반: {run.safetyViolationCount} ({countsText(run.safetyViolationTypes)})</li>
            <li>힌트 요청: {run.hintCount} · 일시중지 {run.pauseCount} · 재개 {run.resumeCount}</li>
            <li>NPC 검사 횟수: {run.npcInspectionCount}</li>
            <li>수업 시점: {LESSON_SHORT[session.usagePhase] ?? '그 밖의 사용'} · 도움 방식: {run.difficultyMode === 'guided' ? '안내 있음' : '안내 없음'}</li>
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
              {sum.measurementInputs.map((i) => <tr key={i.itemId}><td>{itemLabel(i.itemId)}</td><td>{i.presentedValue}</td><td>{i.firstInput ?? '—'} {i.firstCorrect === true ? '✓' : i.firstCorrect === false ? '✗' : ''}</td><td>{i.finalInput ?? '—'} {i.finalCorrect === true ? '✓' : i.finalCorrect === false ? '✗' : ''}</td></tr>)}
              {sum.calculationAnswers.map((i) => <tr key={i.itemId}><td>{itemLabel(i.itemId)}</td><td>{i.computedReferenceValue}</td><td>{i.firstInput ?? '—'} {i.firstCorrect === true ? '✓' : i.firstCorrect === false ? '✗' : ''}</td><td>{i.finalInput ?? '—'} {i.finalCorrect === true ? '✓' : i.finalCorrect === false ? '✗' : ''}</td></tr>)}
              {sum.judgmentAnswers.map((i) => <tr key={i.itemId}><td>{itemLabel(i.itemId)}</td><td>{verdictLabel(sum.vehicleVerdict)}</td><td>{i.firstAnswer ? verdictLabel(i.firstAnswer) : '—'} {i.firstCorrect === true ? '✓' : i.firstCorrect === false ? '✗' : ''}</td><td>{i.finalAnswer ? verdictLabel(i.finalAnswer) : '—'} {i.finalCorrect === true ? '✓' : i.finalCorrect === false ? '✗' : ''}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
      {noRecord ? (
        <section className="card">
          <p>기록 없이 한 수행이라 결과는 이 화면에만 보입니다. 화면을 나가면 사라집니다.</p>
          <div className="row"><button className="primary" onClick={onNextStudent}>처음 화면으로</button></div>
        </section>
      ) : (
      <section className="card">
        <details>
          <summary>교사용 상세 기록 보기 (record.schema {payload.ok ? payload.value.schemaVersion : ''} 형식 · 시연이므로 researchEligible=false)</summary>
          {payload.ok && <textarea readOnly value={json} rows={12} aria-label="payload" />}
        </details>
        {!payload.ok && <p className="error">{payload.error}</p>}
        <div className="row">
          <button onClick={() => dl(json, `record-${session.anonymousStudentCode}-${session.recordId.slice(0, 8)}.json`, 'application/json')} disabled={!payload.ok}>JSON 내려받기</button>
          <button onClick={() => payload.ok && dl(toSummaryCsv([{ payload: payload.value, envelope: env }]), `record-${session.anonymousStudentCode}-${session.recordId.slice(0, 8)}.csv`, 'text/csv;charset=utf-8')} disabled={!payload.ok}>이 수행 CSV 내려받기</button>
          <button className="primary" onClick={next}>{unsaved && confirmLeave ? '저장 안 된 채로 다음 학생' : '다음 학생'}</button>
        </div>
        {unsaved && confirmLeave && <p className="error" role="alert">이 수행은 아직 이 기기에 확정 저장되지 않았습니다. ‘다시 저장’을 하거나 JSON을 내려받은 뒤 넘어가세요. 그래도 넘어가려면 버튼을 한 번 더 누르세요.</p>}
        <p className="small">‘다음 학생’은 화면과 현재 수행만 비웁니다. 이 기기에 저장된 확정 기록은 지워지지 않고, 교사가 교사 화면 ③ 수업 후에서 이 기기의 기록을 서버로 보냅니다.</p>
      </section>
      )}
    </main>
  )
}
