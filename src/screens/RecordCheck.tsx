// 교사 화면 수업 후 탭 — 접수 대조(C2, 설계 05 §12). 건수는 로그인 없이, 기록별 목록·내려받기·서버 대조는 교사 로그인 뒤에 쓴다(독립 검토 1번, 공통 PIN은 보호 수단이 아니다). 지우는 기능은 두지 않는다.
import { useEffect, useState } from 'react'
import { summarizeDevice, UPLOAD_STATUS_LABEL, VERDICT_LABEL, type DeviceSummary, type ReconcileResult } from '../records/reconcile'
import type { Repository } from '../records/repository'

const shortId = (id: string) => `${id.slice(0, 8)}…`

/** showList: 익명 코드·기록 번호가 보이는 목록. 교사 로그인 뒤에만 켠다 */
export function DeviceSummaryView({ summary: s, showList = false }: { summary: DeviceSummary; showList?: boolean }) {
  return (
    <section className="record-check" aria-label="이 기기 전송 상태">
      <h4>이 기기 전송 상태</h4>
      <p className="small">확정 기록 {s.total}건: 접수 확인 {s.acknowledged} · 전송 대기 {s.waiting} · 접수 확인 필요 {s.needsConfirm} · 거절 {s.rejected} · 충돌 {s.conflict}</p>
      {s.drafts > 0 && <p className="small">끝내지 않은 수행 {s.drafts}건은 확정 전이라 전송되지 않습니다. 같은 익명 코드로 들어가면 이어서 할 수 있습니다.</p>}
      {s.attention.length === 0
        ? <p className="small">보낼 기록이 없습니다.</p>
        : !showList ? null : (
          <ul className="record-check-list">
            {s.attention.map((a) => (
              <li key={a.recordId}><b>{a.code}</b> <span className="small">{shortId(a.recordId)} · {UPLOAD_STATUS_LABEL[a.uploadStatus]}</span><br /><span className="small">{a.action}</span></li>
            ))}
          </ul>
        )}
    </section>
  )
}

/** 이 기기 학생 기록 내려받기. 원본·가명 코드가 들어 있어 교사 로그인 뒤에만 버튼을 보인다(독립 검토 1번) */
export function DeviceExports({ open, hasRecords, onCsv, onBundle }: { open: boolean; hasRecords: boolean; onCsv: () => void; onBundle: () => void }) {
  if (!open) return <p className="small" role="note">요약 CSV·연구용 묶음·기록별 목록에는 학생 기록이 들어 있어, 아래에서 교사 계정으로 로그인해야 열립니다. 인터넷이 끊겨 로그인할 수 없어도 기록은 이 기기에 그대로 있습니다. 연결된 뒤 내려받으세요.</p>
  return (
    <div className="row">
      <button onClick={onCsv}>요약 CSV 내려받기</button>
      <button onClick={onBundle} disabled={!hasRecords}>연구용 묶음(ZIP) 내려받기</button>
    </div>
  )
}

/** 전송 결과가 바뀌면(refreshKey) 다시 읽는다 */
export function DeviceRecordCheck({ repo, refreshKey, showList = false }: { repo: Repository; refreshKey: unknown; showList?: boolean }) {
  const [summary, setSummary] = useState<DeviceSummary | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    void Promise.all([repo.listRecords(), repo.listDrafts()])
      .then(([records, drafts]) => { if (live) { setSummary(summarizeDevice(records, drafts)); setFailed(false) } })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [repo, refreshKey])
  if (failed) return <p className="error">이 기기 기록을 읽지 못했습니다. 기록은 그대로 있습니다. 다시 열어 주세요.</p>
  return summary ? <DeviceSummaryView summary={summary} showList={showList} /> : null
}

export function ReconcileView({ result: r, onDownload }: { result: ReconcileResult; onDownload: () => void }) {
  const problems = r.rows.filter((x) => x.verdict !== 'matched')
  return (
    <section className="record-check" aria-label={`${r.sessionCode} 접수 대조 결과`}>
      <h4>{r.sessionCode} 접수 대조</h4>
      <p className="small">서버 기록 {r.serverCount}건을 끝까지 읽어 이 기기 기록 {r.rows.length}건과 대조했습니다. 이 기기 기록만 대조하므로 학생 기기마다 따로 확인해야 합니다.</p>
      <p className={r.needsAction > 0 ? 'error' : 'small'} role="status">{r.needsAction > 0 ? `회수·확인이 필요한 기록 ${r.needsAction}건` : '회수가 필요한 기록은 없습니다(이 기기 기준).'}</p>
      <p className="small">일치 {r.counts.matched} · 서버에 같은 내용 있음 {r.counts.serverHasSame} · 미접수 {r.counts.notReceived} · 서버 내용과 다름 {r.counts.mismatch} · 서버에 없음 {r.counts.missingOnServer}</p>
      {problems.length > 0 && (
        <ul className="record-check-list">
          {problems.map((x) => (
            <li key={x.recordId}><b>{x.code}</b> <span className="small">{shortId(x.recordId)} · {VERDICT_LABEL[x.verdict]}{x.receiptId ? ` · 접수번호 ${x.receiptId}` : ''}</span><br /><span className="small">{x.action}</span></li>
          ))}
        </ul>
      )}
      {r.serverOnly.length > 0 && <p className="small">서버에만 있는 기록 {r.serverOnly.length}건은 다른 기기에서 보낸 것일 수 있습니다. 문제로 세지 않습니다.</p>}
      {r.drafts > 0 && <p className="small">이 세션의 끝내지 않은 수행 {r.drafts}건은 확정 전이라 대조하지 않았습니다.</p>}
      {r.otherSessionRecords > 0 && <p className="small">다른 세션의 이 기기 기록 {r.otherSessionRecords}건은 대조에서 뺐습니다.</p>}
      {r.receivedByCode.length > 0 && (
        <details>
          <summary>서버에 접수된 익명 코드 {r.receivedByCode.length}개 (명단과 맞춰 보기)</summary>
          <p className="small">{r.receivedByCode.map((c) => `${c.code} ${c.count}건`).join(' · ')}</p>
        </details>
      )}
      <button onClick={onDownload}>대조표 CSV</button>
      <p className="small">대조표에는 가명 코드가 들어 있습니다. 연구자 전용 파일로 관리하고 일반 내려받기 폴더에 두지 마세요. 이 화면은 어떤 기록도 지우거나 보내지 않습니다.</p>
    </section>
  )
}
