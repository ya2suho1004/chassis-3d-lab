// 정리 화면(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 1-2): 검사 통과·중단 뒤 30초 동안 정리를 읽고
// "실습장으로 이동"(수행 뒤 둘러보기) 또는 "마치기"(시작 화면). 화면 이름(result)과 구성요소 이름은 그대로 쓴다.
// 기록(payload)에는 아무것도 더하지 않는다. 정리 글·공식은 app/debrief.ts.
// 2단계(설계 2-4): 검사 통과한 수행이면 뜰 때 한 번 AI 정리를 부르고 12초 기다린다. 오지 않거나 실패하면 규칙 정리. AI 글은 화면 상태뿐(기록·기기 저장 없음).
import { useEffect, useMemo, useState } from 'react'
import { buildRecordPayload, type RecordPayload, type SessionContext } from '../domain/record'
import { resolveResultPayload } from '../app/resultPayload'
import type { TaskRun } from '../domain/taskEngine'
import { summarizeResponses } from '../domain/grading'
import type { DeliveryEnvelope } from '../records/types'
import { WorkLog } from './WorkLog'
import { isRequestPassed } from '../app/cozyState'
import { itemLabel, verdictLabel } from '../app/resultLabels'
import {
  ANSWER_TABLE_WITHHELD_LINE, DEBRIEF_AI_LABEL, DEBRIEF_LOCK_SECONDS, DEBRIEF_WAITING_LINE, DEBRIEF_WITHHELD_LINE, answerCellText, debriefFacts, debriefInputOf, debriefNotes, debriefRequestFacts, debriefStats, debriefWaitLeft,
  endStep, settleDebrief, shouldAskDebrief, startLockTimer, type DebriefEvent, type DebriefNotes, type DebriefView,
} from '../app/debrief'
import { getChatEndpoint } from '../chat/chatClient'
import { askDebrief, askDebriefOnce } from '../chat/debriefClient'
import type { LabSound } from '../scene/sound'

/** 정리 화면 단추 줄: 잠긴 동안(secondsLeft > 0) 둘 다 누를 수 없고 주 단추에 남은 초를 보인다.
 *  남은 초는 화면 낭독기가 매번 읽지 않게 숨기고, 잠금 안내는 알림 영역이 아닌 설명 글로 둔다.
 *  알림 영역(숨김, polite)은 늘 있고 풀리는 순간에만 글이 들어가 한 번 읽힌다(새로 생기는 알림 칸은 읽히지 않는 일이 많다) */
export function DebriefActions({ secondsLeft, showToLab, onToLab, onEnd, endLabel = '마치기' }: {
  secondsLeft: number
  /** 저장 실패면 거짓(설계 1-2 끝) */
  showToLab: boolean
  onToLab: () => void
  onEnd: () => void
  endLabel?: string
}) {
  const locked = secondsLeft > 0
  const count = locked ? <span aria-hidden="true"> ({secondsLeft})</span> : null
  const desc = locked ? 'debrief-lock-note' : undefined
  return (
    <>
      <div className="row debrief-actions">
        {showToLab && <button className="primary" disabled={locked} aria-describedby={desc} onClick={onToLab}>실습장으로 이동{count}</button>}
        <button className={showToLab ? undefined : 'primary'} disabled={locked} aria-describedby={desc} onClick={onEnd}>{endLabel}{showToLab ? null : count}</button>
      </div>
      {locked && <p className="small" id="debrief-lock-note">{DEBRIEF_LOCK_SECONDS}초 동안 정리를 읽은 뒤 넘어갈 수 있어요.</p>}
      <p className="sr-only" aria-live="polite">{locked ? '' : '이제 넘어갈 수 있어요.'}</p>
    </>
  )
}

/** 교관의 정리 칸: 기다리는 중(한 줄) → AI 글(제목 옆 AI 표시) 또는 규칙 정리. 수치 줄은 늘 앱이 만든다 */
export function DebriefNotesCard({ view, ruleNotes, stats }: { view: DebriefView; ruleNotes: DebriefNotes; stats: string[] }) {
  const notes = view.kind === 'ai' ? view.notes : ruleNotes
  return (
    <section className="card debrief" aria-label="교관의 정리">
      <h2>교관의 정리{view.kind === 'ai' && <> <span className="debrief-ai">{DEBRIEF_AI_LABEL}</span></>}</h2>
      <p className="debrief-stats small">{stats.join(' · ')}</p>
      {view.kind === 'waiting'
        ? <p className="debrief-wait" role="status">{DEBRIEF_WAITING_LINE}</p>
        : (
          <div className="debrief-groups">
            <div><h3>잘한 점</h3><ul>{notes.good.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
            <div><h3>보완할 점</h3><ul>{notes.improve.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
            <div><h3>어려웠던 것으로 보이는 점</h3><ul>{notes.hard.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
          </div>
        )}
    </section>
  )
}

export function ResultScreen({ sound, session, run, completionStatus, envelope, saveError, frozenPayload = null, noRecord = false, nickname, onToLab, onEnd, onRetrySave, sendLine = null, chatEndpoint = getChatEndpoint() }: {
  /** 소리 엔진(설계 2026-11-12 §4.7): 실습 화면에서 켠 채 넘어왔으면 통과 도장에 소리가 난다. 이 화면에는 배경 소음도 소리 버튼도 없다 */
  sound?: Pick<LabSound, 'enabled' | 'play'>
  session: SessionContext; run: TaskRun; completionStatus: 'completed' | 'aborted'; envelope: DeliveryEnvelope | null; saveError: string | null
  /** 확정 저장한 원본(G2). 있으면 걸린 시간·통과 판단에 이것을 쓴다 */
  frozenPayload?: RecordPayload | null
  /** 비기록 모드(설계 2026-11-02): 저장·접수 상태를 숨긴다 */
  noRecord?: boolean
  /** 캐릭터 닉네임(화면 표시만, 기록에는 없음) */
  nickname?: string
  /** 수행 뒤 둘러보기로(설계 1-6). 저장 실패면 단추가 없다 */
  onToLab: () => void
  /** 마치기 = 예전 '다음 학생'(기록 모드면 현재 수행 포인터를 비우고 시작 화면) */
  onEnd: () => void
  /** 확정 저장 실패 뒤 같은 원본으로 다시 저장(D4). 성공하면 null, 실패하면 오류 코드 */
  onRetrySave?: () => Promise<string | null>
  /** 수업용 세션 기록의 전송 상태 한 줄(설계 2026-11-15-class-records §3-3, delivery/autoSend.ts). 정오·판정은 넣지 않는다 */
  sendLine?: string | null
  /** AI 정리를 부를 대화 주소(기본은 빌드의 VITE_CHAT_ENDPOINT). 없으면 규칙 정리만 */
  chatEndpoint?: string | null
}) {
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  /** 확정 기록이 저장되지 않은 채 '마치기'를 처음 누르면 한 번 더 확인한다(D4) */
  const [confirmLeave, setConfirmLeave] = useState(false)
  /** 30초 잠금(설계 1-2): 화면이 뜬 때부터. 모든 세션·조건에 같다 */
  const [left, setLeft] = useState(DEBRIEF_LOCK_SECONDS)
  useEffect(() => startLockTimer(performance.now(), setLeft), [])
  const unsaved = !noRecord && !!saveError
  const retry = async () => {
    if (!onRetrySave || retrying) return
    setRetrying(true)
    setRetryError(null)
    const err = await onRetrySave()
    setRetrying(false)
    if (err) setRetryError(err)
  }
  const end = () => {
    if (endStep({ unsaved, confirmed: confirmLeave }) === 'confirm') return setConfirmLeave(true)
    onEnd()
  }
  /** 저장 실패일 때만: 확정 원본을 기록 파일(JSON)로 내려받아 선생님께 전달한다(예전 결과 화면의 파일 이름 규칙 그대로) */
  const downloadRecord = () => {
    if (!frozenPayload) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(frozenPayload, null, 2)], { type: 'application/json' }))
    a.download = `record-${session.anonymousStudentCode}-${session.recordId.slice(0, 8)}.json`
    a.click()
  }
  const payload = useMemo(
    () => resolveResultPayload(frozenPayload, () => buildRecordPayload(run, session, { completedAtIso: new Date().toISOString(), completionStatus })),
    [frozenPayload, run, session, completionStatus],
  )
  const sum = summarizeResponses(run.responses)
  const notes = useMemo(() => debriefNotes(debriefInputOf(run, completionStatus)), [run, completionStatus])
  const facts = debriefFacts(run.task)
  const durationSeconds = payload.ok ? payload.value.durationSeconds : null
  const stats = debriefStats(run, durationSeconds, { withheld: notes.withheld })
  // AI 정리(설계 2-4): 확정 기록의 수행 번호로 한 번만 부른다. 12초는 화면이 뜬 때부터 센다(30초 잠금과 따로)
  const recordId = frozenPayload?.recordId ?? null
  const [shownAt] = useState(() => performance.now())
  const [view, setView] = useState<DebriefView>(() => (shouldAskDebrief({ completionStatus, noRecord, endpoint: chatEndpoint, recordId, saved: !saveError, online: typeof navigator === 'undefined' || navigator.onLine !== false }) ? { kind: 'waiting' } : { kind: 'rule' }))
  useEffect(() => {
    if (view.kind !== 'waiting' || !chatEndpoint || !recordId) return
    let live = true
    const settle = (e: DebriefEvent) => { if (live) setView((v) => settleDebrief(v, e)) }
    const t = setTimeout(() => settle({ type: 'timeout' }), debriefWaitLeft(shownAt, performance.now()))
    askDebriefOnce(recordId, () => askDebrief(chatEndpoint, { sessionCode: session.sessionCode, anonymousStudentCode: session.anonymousStudentCode, recordId, taskId: run.task.taskId, difficultyMode: run.difficultyMode, facts: debriefRequestFacts(run, durationSeconds) }))
      .then((r) => settle(r.ok ? { type: 'answer', notes: r.notes } : { type: 'fail' }))
    return () => { live = false; clearTimeout(t) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- 화면이 뜰 때 한 번만(같은 수행 번호에는 askDebriefOnce가 한 번만 보낸다)
  const savedHere = !noRecord && !unsaved && envelope?.localSaveStatus === 'saved'

  return (
    <main className="screen result wa">
      <h1>{nickname ? `${nickname}의 ` : ''}수행 결과 — {completionStatus === 'completed' ? 'NPC 검사 통과' : '중단'}</h1>
      <WorkLog run={run} passed={isRequestPassed(completionStatus, payload)} nickname={nickname} sound={sound} />
      {noRecord
        ? <p className="record-line">기록: <b>기록 없이 한 수행</b> — 이 기기에 저장하거나 보내지 않았습니다</p>
        : sendLine
          ? <p className="record-line"><span className="send-line" role="status">{sendLine}</span></p>
          : savedHere ? <p className="record-line">기록을 이 기기에 저장했어요.</p> : null}
      {unsaved && (
        <div className="card" role="alert">
          <p className="error">이 기기에 확정 기록을 저장하지 못했습니다 ({retryError ?? saveError}). 먼저 ‘다시 저장’을 눌러 보세요. 같은 수행 번호·같은 내용으로 다시 저장합니다.</p>
          <div className="row">
            {onRetrySave && <button className="primary" onClick={() => void retry()} disabled={retrying}>{retrying ? '저장 중…' : '다시 저장'}</button>}
            {frozenPayload && <button onClick={downloadRecord}>기록 파일 내려받기</button>}
          </div>
          <p className="small">{frozenPayload ? '계속 안 되면 기록 파일을 내려받아 선생님께 전달하세요.' : '계속 안 되면 선생님께 알려 주세요.'} 손실 방지를 보장하지는 않습니다.</p>
        </div>
      )}
      <section className="card" aria-label="내 답">
        <h2>판독·계산·판정</h2>
        <ul>
          {notes.withheld ? <li>{ANSWER_TABLE_WITHHELD_LINE}</li> : <><li>최초 판정 정오: {sum.judgmentCorrect === null ? '미응답' : sum.judgmentCorrect ? '정답' : '오답'} / 최종: {sum.finalJudgmentCorrect === null ? '미응답' : sum.finalJudgmentCorrect ? '정답' : '오답'}</li>
          <li>최초 정답 {sum.firstCorrectCount}/{sum.requiredCount}, 최종 정답 {sum.finalCorrectCount}/{sum.requiredCount}, 미응답 {sum.unansweredFirstCount}</li></>}
        </ul>
        <table className="sheet small">
          <thead><tr><th>항목</th><th>최초 답</th><th>최종 답</th></tr></thead>
          <tbody>
            {sum.measurementInputs.map((i) => <tr key={i.itemId}><td>{itemLabel(i.itemId)}</td><td>{answerCellText(i.firstInput, i.firstCorrect, notes.withheld)}</td><td>{answerCellText(i.finalInput, i.finalCorrect, notes.withheld)}</td></tr>)}
            {sum.calculationAnswers.map((i) => <tr key={i.itemId}><td>{itemLabel(i.itemId)}</td><td>{answerCellText(i.firstInput, i.firstCorrect, notes.withheld)}</td><td>{answerCellText(i.finalInput, i.finalCorrect, notes.withheld)}</td></tr>)}
            {sum.judgmentAnswers.map((i) => <tr key={i.itemId}><td>{itemLabel(i.itemId)}</td><td>{answerCellText(i.firstAnswer ? verdictLabel(i.firstAnswer) : null, i.firstCorrect, notes.withheld)}</td><td>{answerCellText(i.finalAnswer ? verdictLabel(i.finalAnswer) : null, i.finalCorrect, notes.withheld)}</td></tr>)}
          </tbody>
        </table>
        {/* 정답 값(실제 판독값·계산 기준값·정답 판정)은 이 화면에 보이지 않는다 — 사례가 둘뿐이라 옆 학생이 답을 볼 수 있다(마무리 §5) */}
        <p className="small">정답 값은 교사 화면에서 확인합니다.</p>
      </section>
      <DebriefNotesCard view={view} ruleNotes={notes} stats={stats} />
      <section className="card debrief-facts" aria-label="오늘 쓴 공식과 규정값">
        <h2>오늘 쓴 공식과 규정값</h2>
        {notes.withheld
          ? <p>{DEBRIEF_WITHHELD_LINE}</p>
          : <dl>{facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.text}</dd></div>)}</dl>}
      </section>
      <section className="card">
        {noRecord && <p>기록 없이 한 수행이라 결과는 이 화면에만 보입니다. 화면을 나가면 사라집니다.</p>}
        <DebriefActions secondsLeft={left} showToLab={!unsaved} onToLab={onToLab} onEnd={end} endLabel={unsaved && confirmLeave ? '저장 안 된 채로 마치기' : '마치기'} />
        {unsaved && confirmLeave && <p className="error" role="alert">이 수행은 아직 이 기기에 확정 저장되지 않았습니다. ‘다시 저장’을 한 뒤 넘어가세요. 그래도 넘어가려면 버튼을 한 번 더 누르세요.</p>}
        <p className="small">{noRecord || unsaved ? '‘마치기’를 누르면 처음 화면으로 돌아가요.' : '‘마치기’를 누르면 처음 화면으로 돌아가요. 저장된 기록은 지워지지 않아요.'}</p>
      </section>
    </main>
  )
}
