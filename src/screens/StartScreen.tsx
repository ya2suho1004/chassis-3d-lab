import { useEffect, useState } from 'react'
import { createDemoSession, listTasks, validateStudentCode, APP_VERSION } from '../app/session'
import type { SessionContext } from '../domain/record'
import type { DifficultyMode } from '../domain/taskEngine'
import type { UsagePhase } from '../domain/record'
import type { ApprovedTask } from '../domain/types'
import type { Repository } from '../records/repository'
import { toSummaryCsv } from '../records/csv'
import { processOutbox, type OutboxItemResult } from '../delivery/outbox'
import { getSubmitEndpoint, SUBMIT_IS_FAKE } from '../delivery/config'

const TEACHER_PIN = '0000' // 시연용. 화면 숨김·공통 PIN은 보안 통제가 아니다(설계 03 §7).

export function StartScreen({ repo, onStart }: { repo: Repository; onStart: (s: SessionContext, t: ApprovedTask, m: DifficultyMode) => Promise<string | null> }) {
  const tasks = listTasks()
  const [code, setCode] = useState('')
  const [sessionCode] = useState('DEMO-ONLY')
  const [taskIdx, setTaskIdx] = useState(0)
  const [mode, setMode] = useState<DifficultyMode>('guided')
  const [phase, setPhase] = useState<UsagePhase>('preview')
  const [entryDir, setEntryDir] = useState<'north' | 'south' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [counts, setCounts] = useState<{ records: number; outbox: number } | null>(null)
  const [sending, setSending] = useState(false)
  const [sendLog, setSendLog] = useState<OutboxItemResult[] | null>(null)
  const endpoint = getSubmitEndpoint()

  const refreshCounts = async () => {
    const all = await repo.listRecords()
    const outbox = await repo.listOutbox()
    setCounts({ records: all.length, outbox: outbox.length })
  }
  useEffect(() => { void refreshCounts() }, [repo]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    const v = validateStudentCode(code)
    if (!v.ok) return setError(v.reason)
    setError(null)
    setBusy(true)
    const task = tasks[taskIdx]!
    const err = await onStart(createDemoSession({ studentCode: v.code, sessionCode, attemptRole: phase === 'review' ? 'remediation' : mode === 'guided' ? 'practice' : 'primary', usagePhase: phase, vehicleEntryDirection: entryDir, task, difficultyMode: mode }), task, mode)
    setBusy(false)
    if (err) setError(err)
  }

  const teacherCsv = async () => {
    const pin = window.prompt('교사용 CSV: PIN을 입력하세요 (시연용 0000)')
    if (pin !== TEACHER_PIN) return
    const rows = await repo.listRecords()
    const csv = toSummaryCsv(rows.map((r) => ({ payload: r.payload, envelope: r.envelope })))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `chassis-records-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  // 교사 조작으로만 전송한다(설계 05 §6). 대기열의 같은 ID·같은 원본을 보내고, 서버 ack를 검증한 뒤에만 '접수 확인됨'으로 저장한다.
  const teacherSend = async (force: boolean) => {
    if (!endpoint) return
    const pin = window.prompt('교사용 전송: PIN을 입력하세요 (시연용 0000)')
    if (pin !== TEACHER_PIN) return
    setSending(true)
    try {
      const results = await processOutbox(repo, { fetch: (u, i) => fetch(u, i), endpointUrl: endpoint, now: () => new Date() }, { force })
      setSendLog(results)
    } finally {
      setSending(false)
      await refreshCounts()
    }
  }
  const OUTCOME_LABEL: Record<OutboxItemResult['outcome'], string> = { acknowledged: '서버 접수 확인됨', rejected: '거절(제출자료 확인 필요)', conflict: '기록 충돌', pending: '대기(잠시 뒤 재시도)', confirmationPending: '접수 확인 필요(같은 ID로 재전송)', skipped: '건너뜀', saveFailed: '이 기기 저장 실패' }

  return (
    <main className="screen start">
      <h1>섀시 가상 실습장 — 제동력 측정 과제</h1>
      <p className="banner">시연용(demo) · 이 기기에 먼저 저장 · 전송은 교사 조작으로만{SUBMIT_IS_FAKE ? '(개발용 가짜 수신점)' : ''} · 연구 기록으로 쓰이지 않음 · 앱 {APP_VERSION}</p>
      <section className="card">
        <label>
          수업 세션 코드
          <input value={sessionCode} readOnly aria-label="세션 코드" />
        </label>
        <label>
          익명 코드 (예: A-01)
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="A-01" inputMode="text" aria-label="익명 코드" />
        </label>
        <span className="small">이름·학번·연락처는 입력하지 않습니다. 코드 형식 검사는 본인 확인이 아닙니다. 전송 시험 중에는 합성 코드 D-01 같은 D-xx만 수신점이 받습니다.</span>
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
        <h2>수업 시점 (언제 하는가)</h2>
        <label className="radio"><input type="radio" name="phase" checked={phase === 'preview'} onChange={() => setPhase('preview')} /> 대기 중 예습 — 실제 실습 순번을 기다리는 동안</label>
        <label className="radio"><input type="radio" name="phase" checked={phase === 'review'} onChange={() => setPhase('review')} /> 실습 후 복습 — 실제 실습을 마치고 다시 확인</label>
        <label className="radio"><input type="radio" name="phase" checked={phase === 'other'} onChange={() => setPhase('other')} /> 기타(시연·연습)</label>
      </section>
      <section className="card">
        <h2>도움 방식 (어떻게 돕는가)</h2>
        <label className="radio"><input type="radio" name="mode" checked={mode === 'guided'} onChange={() => setMode('guided')} /> 안내 있음 (견습) — 다음 할 일을 알려 줌</label>
        <label className="radio"><input type="radio" name="mode" checked={mode === 'unguided'} onChange={() => setMode('unguided')} /> 안내 없음 (정비사) — 순서를 스스로 찾음, 안전 경고는 유지</label>
      </section>
      <section className="card">
        <h2>차량 진입 방향 (교사 설정 · 세션 값)</h2>
        <label className="radio"><input type="radio" name="entry" checked={entryDir === null} onChange={() => setEntryDir(null)} /> 미설정 — 3D는 북쪽 자리를 가정으로 표시하고 진입 연출을 하지 않음</label>
        <label className="radio"><input type="radio" name="entry" checked={entryDir === 'north'} onChange={() => setEntryDir('north')} /> 북쪽에서 진입 (차체가 롤러 북쪽)</label>
        <label className="radio"><input type="radio" name="entry" checked={entryDir === 'south'} onChange={() => setEntryDir('south')} /> 남쪽에서 진입 (차체가 롤러 남쪽)</label>
        <span className="small">실제 실습실은 북·남 모두 가능(교사 확인 2026-10-21). 기록 계약 1.1.0에는 이 필드가 없어 연구 기록에 저장되지 않습니다(Codex 계약 개정 제안).</span>
      </section>
      <button className="primary" onClick={start} disabled={busy}>{busy ? '초안 저장 중…' : '과제 수령하러 가기'}</button>
      <footer className="small teacher">
        교사용 · 이 기기에 저장된 확정 기록 {counts?.records ?? '…'}건 (전송 대기 {counts?.outbox ?? '…'}건) ·{' '}
        <button className="link" onClick={teacherCsv}>요약 CSV 내려받기</button>
        {' · '}
        {endpoint ? (
          <>
            <button className="link" onClick={() => teacherSend(false)} disabled={sending || !counts?.outbox}>{sending ? '전송 중…' : '대기 기록 지금 전송'}</button>
            {' · '}
            <button className="link" onClick={() => teacherSend(true)} disabled={sending || !counts?.outbox} title="재시도 대기 시각을 무시하고 보냄(거절·충돌은 제외)">강제 재전송</button>
          </>
        ) : (
          <span>전송 주소 미설정(VITE_SUBMIT_ENDPOINT)</span>
        )}
        {sendLog && (
          <ul className="sendlog" aria-label="전송 결과">
            {sendLog.length === 0 && <li>보낼 기록이 없습니다.</li>}
            {sendLog.map((r) => (<li key={r.recordId}>{r.recordId.slice(0, 8)}… — {r.code === 'RATE_LIMITED' ? '신규 접수 상한 도달 — 교사 설정 확인(자동 회복 없음)' : OUTCOME_LABEL[r.outcome]}{r.code && r.outcome !== 'acknowledged' ? ` (${r.code})` : ''}</li>))}
          </ul>
        )}
        <div>전송 경로는 로그인 없는 공개 수신점입니다. 세션 코드·익명 코드·접수번호는 학생 신원을 인증하지 않으며, 접수번호는 특정 내용의 접수 확인일 뿐 수행·정답·연구 적격의 증명이 아닙니다.</div>
      </footer>
    </main>
  )
}
