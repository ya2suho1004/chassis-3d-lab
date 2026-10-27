// 교사 화면 — 수업 설정(기기별 기본값·잠금)과 기록 관리(요약 CSV, 대기 기록 전송)를 한곳에 모은다.
// PIN은 화면 안 입력칸으로 받는다(시연용 0000, 보안 통제 아님). 설정은 이 기기에만 저장되고 전송하지 않는다.
import { useState } from 'react'
import { caseKey, ENTRY_LABEL, MODE_LABEL, PHASE_LABEL, savePreset, type TeacherPreset } from '../app/teacherPreset'
import { processOutbox, type OutboxItemResult } from '../delivery/outbox'
import { getSubmitEndpoint } from '../delivery/config'
import type { UsagePhase } from '../domain/record'
import type { ApprovedTask } from '../domain/types'
import { toSummaryCsv } from '../records/csv'
import type { Repository } from '../records/repository'

const TEACHER_PIN = '0000' // 시연용. 화면 숨김·공통 PIN은 보안 통제가 아니다(설계 03 §7).
const OUTCOME_LABEL: Record<OutboxItemResult['outcome'], string> = { acknowledged: '서버 접수 확인됨', rejected: '거절(제출자료 확인 필요)', conflict: '기록 충돌', pending: '대기(잠시 뒤 재시도)', confirmationPending: '접수 확인 필요(같은 ID로 재전송)', skipped: '건너뜀', saveFailed: '이 기기 저장 실패' }

export function TeacherPanel({ repo, tasks, preset, counts, onPresetChange, onCountsChange, onClose }: {
  repo: Repository
  tasks: ApprovedTask[]
  preset: TeacherPreset | null
  counts: { records: number; outbox: number } | null
  onPresetChange: (p: TeacherPreset | null) => void
  onCountsChange: () => Promise<void>
  onClose: () => void
}) {
  const [pin, setPin] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [form, setForm] = useState<TeacherPreset>(preset ?? { caseId: caseKey(tasks[0]!), usagePhase: 'preview', difficultyMode: 'guided', vehicleEntryDirection: null, locked: true })
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendLog, setSendLog] = useState<OutboxItemResult[] | null>(null)
  const endpoint = getSubmitEndpoint()

  if (!unlocked) {
    return (
      <section className="card teacherpanel">
        <h2>교사 화면</h2>
        <label>PIN (시연용 0000)<input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" type="password" aria-label="교사 PIN" /></label>
        {pin !== '' && pin.length >= TEACHER_PIN.length && pin !== TEACHER_PIN && <p className="error">PIN이 다릅니다.</p>}
        <div className="row">
          <button className="primary" onClick={() => setUnlocked(pin === TEACHER_PIN)} disabled={pin !== TEACHER_PIN}>열기</button>
          <button className="link" onClick={onClose}>닫기</button>
        </div>
      </section>
    )
  }

  const save = (p: TeacherPreset | null) => {
    const ok = savePreset(p)
    onPresetChange(p)
    setSaveMsg(ok ? (p ? '저장했습니다. 시작 화면에 바로 적용됩니다.' : '설정을 지웠습니다. 학생이 직접 고르는 화면으로 돌아갑니다.') : '이 기기에 저장하지 못했습니다(브라우저 저장 제한). 이번 화면에서만 적용됩니다.')
  }

  const downloadCsv = async () => {
    const rows = await repo.listRecords()
    const csv = toSummaryCsv(rows.map((r) => ({ payload: r.payload, envelope: r.envelope })))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `chassis-records-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  // 교사 조작으로만 전송한다(설계 05 §6). 대기열의 같은 ID·같은 원본을 보내고, 서버 ack를 검증한 뒤에만 '접수 확인됨'으로 저장한다.
  const send = async (force: boolean) => {
    if (!endpoint) return
    setSending(true)
    try {
      const results = await processOutbox(repo, { fetch: (u, i) => fetch(u, i), endpointUrl: endpoint, now: () => new Date() }, { force })
      setSendLog(results)
    } finally {
      setSending(false)
      await onCountsChange()
    }
  }

  return (
    <section className="card teacherpanel">
      <h2>교사 화면</h2>

      <h3>수업 설정 (이 기기)</h3>
      <p className="small">수업 전에 한 번 정해 두면 시작 화면의 기본값이 됩니다. ‘학생이 바꾸지 못하게’를 켜면 학생은 익명 코드만 입력합니다.</p>
      <div className="field-group">
        <span className="small">과제 사례</span>
        {tasks.map((t) => (
          <label key={t.measurement.caseId} className="radio"><input type="radio" name="t-case" checked={form.caseId === caseKey(t)} onChange={() => setForm({ ...form, caseId: caseKey(t) })} /> {t.title}</label>
        ))}
      </div>
      <div className="field-group">
        <span className="small">수업 시점</span>
        {(['preview', 'review', 'other'] as UsagePhase[]).map((p) => (
          <label key={p} className="radio"><input type="radio" name="t-phase" checked={form.usagePhase === p} onChange={() => setForm({ ...form, usagePhase: p })} /> {PHASE_LABEL[p]}</label>
        ))}
      </div>
      <div className="field-group">
        <span className="small">도움 방식</span>
        {(['guided', 'unguided'] as const).map((m) => (
          <label key={m} className="radio"><input type="radio" name="t-mode" checked={form.difficultyMode === m} onChange={() => setForm({ ...form, difficultyMode: m })} /> {MODE_LABEL[m]}</label>
        ))}
      </div>
      <div className="field-group">
        <span className="small">차량 진입 방향</span>
        {([null, 'north', 'south'] as const).map((d) => (
          <label key={String(d)} className="radio"><input type="radio" name="t-entry" checked={form.vehicleEntryDirection === d} onChange={() => setForm({ ...form, vehicleEntryDirection: d })} /> {ENTRY_LABEL(d)}{d === null ? ' — 3D 진입 연출 없음' : ''}</label>
        ))}
      </div>
      <label className="radio"><input type="checkbox" checked={form.locked} onChange={(e) => setForm({ ...form, locked: e.target.checked })} /> 학생이 바꾸지 못하게(익명 코드만 입력)</label>
      <div className="row">
        <button className="primary" onClick={() => save(form)}>설정 저장</button>
        {preset && <button onClick={() => save(null)}>설정 지우기</button>}
      </div>
      {saveMsg && <p className="small" role="status">{saveMsg}</p>}

      <h3>기록 관리</h3>
      <p className="small">이 기기에 저장된 확정 기록 {counts?.records ?? '…'}건 · 전송 대기 {counts?.outbox ?? '…'}건</p>
      <div className="row">
        <button onClick={() => void downloadCsv()}>요약 CSV 내려받기</button>
        {endpoint ? (
          <>
            <button onClick={() => void send(false)} disabled={sending || !counts?.outbox}>{sending ? '전송 중…' : '대기 기록 지금 전송'}</button>
            <button onClick={() => void send(true)} disabled={sending || !counts?.outbox} title="재시도 대기 시각을 무시하고 보냄(거절·충돌은 제외)">강제 재전송</button>
          </>
        ) : (
          <span className="small">전송 주소 미설정(VITE_SUBMIT_ENDPOINT)</span>
        )}
      </div>
      {sendLog && (
        <ul className="sendlog" aria-label="전송 결과">
          {sendLog.length === 0 && <li>보낼 기록이 없습니다.</li>}
          {sendLog.map((r) => (<li key={r.recordId}>{r.recordId.slice(0, 8)}… — {r.code === 'RATE_LIMITED' ? '신규 접수 상한 도달 — 교사 설정 확인(자동 회복 없음)' : OUTCOME_LABEL[r.outcome]}{r.code && r.outcome !== 'acknowledged' ? ` (${r.code})` : ''}</li>))}
        </ul>
      )}
      <p className="small">전송 경로는 로그인 없는 공개 수신점입니다. 세션 코드·익명 코드·접수번호는 학생 신원을 인증하지 않으며, 접수번호는 특정 내용의 접수 확인일 뿐 수행·정답·연구 적격의 증명이 아닙니다.</p>
      <button className="link" onClick={onClose}>교사 화면 닫기</button>
    </section>
  )
}
