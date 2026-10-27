// 3D 배치 눈검토 패널(교사용) — 항목을 누르면 캐릭터가 그 자리로 가고, 항목마다 학교와 비슷한지 표시한다.
// 결과는 이 기기 초안(localStorage)과 JSON 내려받기로만 남는다. 전송하지 않으며 layoutConfirmed를 바꾸지 않는다.
import { useEffect, useMemo, useState } from 'react'
import { APP_VERSION } from '../app/session'
import { buildReviewItems, buildReviewResult, emptyDraft, fillUnansweredOk, GROUP_LABEL, kstDate, progressOf, VERDICT_LABEL, type ReviewDraft, type ReviewGroup, type ReviewItem, type Verdict } from '../review/layoutReview'
import type { SceneLayout } from '../scene/layoutModel'

const DRAFT_KEY = 'chassis.layoutReview3d.v1'
const VERDICTS: Verdict[] = ['ok', 'slightlyOff', 'veryOff', 'notPresent']
const GROUPS: ReviewGroup[] = ['boundary', 'pillar', 'equipment', 'place']
const BASIS_LABEL: Record<string, string> = { measured: '실측', 'measured-partial': '부분 실측', sketch: '스케치', assumption: '가정', teacher: '교사 답' }

function loadDraft(): ReviewDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) return { ...emptyDraft(), ...(JSON.parse(raw) as Partial<ReviewDraft>) }
  } catch { /* 저장소를 못 쓰면 빈 초안 */ }
  return emptyDraft()
}

export function LayoutReviewPanel({ layout, activeId, onFocus, onClose }: {
  layout: SceneLayout
  activeId: string | null
  onFocus: (item: ReviewItem) => void
  onClose: () => void
}) {
  const items = useMemo(() => buildReviewItems(layout), [layout])
  const [draft, setDraft] = useState<ReviewDraft>(loadDraft)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* 초안 저장 실패는 무시(내려받기는 가능) */ }
  }, [draft])

  const prog = progressOf(items, draft)
  const setAnswer = (id: string, patch: Partial<{ verdict: Verdict | null; note: string }>) =>
    setDraft((d) => ({ ...d, answers: { ...d.answers, [id]: { verdict: d.answers[id]?.verdict ?? null, note: d.answers[id]?.note ?? '', ...patch } } }))
  const resultText = () => JSON.stringify(buildReviewResult(layout, items, draft, { appVersion: APP_VERSION, now: new Date() }), null, 2)
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([resultText()], { type: 'application/json' }))
    a.download = `LAYOUT_3D_REVIEW_${kstDate(new Date())}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(resultText()); setCopied(true) } catch { setCopied(false); window.alert('복사하지 못했습니다. ‘결과 내려받기’를 쓰세요.') }
  }

  return (
    <div className="card review">
      <b>3D 배치 눈검토 (교사용)</b>
      <p className="small">학교 실습장과 <b>위치·모양이 비슷한지</b>만 봅니다. 치수 확인이 아닙니다. 항목 이름을 누르면 캐릭터가 그 자리로 갑니다. 모르는 항목은 비워 두세요.</p>
      <p className="small">진행 {prog.answered}/{prog.total} · 이 기기에 자동 저장 · 전송하지 않음</p>
      {GROUPS.map((g) => (
        <div key={g}>
          <h3>{GROUP_LABEL[g]}</h3>
          <ul className="reviewlist">
            {items.filter((i) => i.group === g).map((i) => {
              const a = draft.answers[i.itemId]
              return (
                <li key={i.itemId} className={activeId === i.itemId ? 'active' : ''}>
                  <button className="link" onClick={() => onFocus(i)}>{i.label}</button> <span className="small">[{BASIS_LABEL[i.basis] ?? i.basis}]</span>
                  <div className="verdicts">
                    {VERDICTS.map((v) => (
                      <button key={v} className={a?.verdict === v ? 'on' : ''} aria-pressed={a?.verdict === v} onClick={() => setAnswer(i.itemId, { verdict: a?.verdict === v ? null : v })}>{VERDICT_LABEL[v]}</button>
                    ))}
                  </div>
                  {a?.verdict && a.verdict !== 'ok' && (
                    <input value={a.note} onChange={(e) => setAnswer(i.itemId, { note: e.target.value })} placeholder="어떻게 다른지 (예: 더 북쪽, 더 큼)" aria-label={`${i.label} 메모`} />
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <h3>전체</h3>
      <div className="verdicts">
        <span className="small">전체 느낌:</span>
        {(['ok', 'slightlyOff', 'veryOff'] as const).map((v) => (
          <button key={v} className={draft.overall === v ? 'on' : ''} aria-pressed={draft.overall === v} onClick={() => setDraft((d) => ({ ...d, overall: d.overall === v ? null : v }))}>{v === 'ok' ? '비슷함' : VERDICT_LABEL[v]}</button>
        ))}
      </div>
      <label className="small">빠진 장비(있으면)<input value={draft.missingEquipment} onChange={(e) => setDraft((d) => ({ ...d, missingEquipment: e.target.value }))} /></label>
      <label className="small">기타 메모<input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} /></label>
      <div className="row">
        <button onClick={() => setDraft((d) => fillUnansweredOk(items, d))} disabled={prog.answered === prog.total}>남은 항목 모두 ‘맞음’</button>
        <button className="primary" onClick={download}>결과 내려받기</button>
        <button onClick={() => void copy()}>{copied ? '복사됨' : '결과 복사'}</button>
        <button className="link" onClick={onClose}>닫기</button>
      </div>
      <p className="small">내려받은 파일(LAYOUT_3D_REVIEW_날짜.json)을 Claude에게 전달하면 배치에 반영합니다. ‘실제 배치 아님’ 표시는 결과를 본 뒤 따로 정합니다.</p>
    </div>
  )
}
