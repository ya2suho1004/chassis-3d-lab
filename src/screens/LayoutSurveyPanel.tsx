// 3D 배치 실측 입력 패널(교사용) — 항목을 누르면 캐릭터가 그 자리로 가고, 잰 크기·거리를 m로 적는다.
// 결과는 이 기기 초안(localStorage)과 JSON 내려받기로만 남는다. 전송하지 않으며 3D 배치를 바로 바꾸지 않는다.
import { useEffect, useMemo, useState } from 'react'
import { APP_VERSION } from '../app/session'
import { kstDate } from '../review/layoutReview'
import { buildSurveyItems, buildSurveyResult, emptySurveyDraft, FIELD_LABEL, parseLength, PRIORITY_LABEL, surveyProgress, type SurveyDraft, type SurveyField, type SurveyItem } from '../review/layoutSurvey'
import type { SceneLayout } from '../scene/layoutModel'

const DRAFT_KEY = 'chassis.layoutSurvey3.v1'
const BASIS_LABEL: Record<string, string> = { measured: '실측', 'measured-partial': '부분 실측', sketch: '스케치', assumption: '가정', teacher: '교사 답' }

function loadDraft(): SurveyDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) return { ...emptySurveyDraft(), ...(JSON.parse(raw) as Partial<SurveyDraft>) }
  } catch { /* 저장소를 못 쓰면 빈 초안 */ }
  return emptySurveyDraft()
}

export function LayoutSurveyPanel({ layout, activeId, onFocus, onClose }: {
  layout: SceneLayout
  activeId: string | null
  onFocus: (item: SurveyItem) => void
  onClose: () => void
}) {
  const items = useMemo(() => buildSurveyItems(layout), [layout])
  const [draft, setDraft] = useState<SurveyDraft>(loadDraft)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* 초안 저장 실패는 무시(내려받기는 가능) */ }
  }, [draft])

  const prog = surveyProgress(items, draft)
  const setValue = (id: string, f: SurveyField, v: string) => setDraft((d) => ({ ...d, values: { ...d.values, [id]: { ...d.values[id], [f]: v } } }))
  const resultText = () => JSON.stringify(buildSurveyResult(layout, items, draft, { appVersion: APP_VERSION, now: new Date() }), null, 2)
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([resultText()], { type: 'application/json' }))
    a.download = `LAYOUT_SURVEY3_${kstDate(new Date())}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(resultText()); setCopied(true) } catch { setCopied(false); window.alert('복사하지 못했습니다. ‘결과 내려받기’를 쓰세요.') }
  }
  const groups = ([1, 2, 3, 4, 5] as const).filter((p) => items.some((i) => i.priority === p))

  return (
    <div className="card review survey">
      <b>실측 입력 (교사용)</b>
      <p className="small">단위는 <b>m</b>(예: 2.35). 거리는 모두 <b>북쪽 벽</b>과 <b>동쪽 벽</b>(건물 외벽 안쪽 면)에서 잽니다. 서·남쪽은 트여 있어 기준으로 쓰지 않습니다.</p>
      <ul className="small">
        <li>가로 = 동서 방향 길이, 세로 = 남북 방향 길이</li>
        <li>‘북쪽 벽 → 북쪽 끝’ = 벽에서 그 물건의 북쪽 가장자리까지 직각 거리(벽에 붙어 있으면 0)</li>
        <li>‘동쪽 벽 → 동쪽 끝’ = 벽에서 그 물건의 동쪽 가장자리까지 직각 거리</li>
      </ul>
      <p className="small">칸 안의 회색 숫자는 지금 3D의 짐작값입니다. 모르는 칸은 비워 두고, 다르게 쟀으면 메모에 적어 주세요. 위에서부터 중요한 순서이며 한 번에 다 재지 않아도 됩니다.</p>
      <label className="small">도구(예: 줄자, 레이저 거리측정기)<input value={draft.tool} onChange={(e) => setDraft((d) => ({ ...d, tool: e.target.value }))} /></label>
      <p className="small">잰 항목 {prog.measuredItems}/{prog.totalItems}{prog.invalidFields ? ` · 고칠 칸 ${prog.invalidFields}` : ''} · 이 기기에 자동 저장 · 전송하지 않음</p>
      {groups.map((p) => (
        <details key={p} open={p <= 2}>
          <summary><h3>{PRIORITY_LABEL[p]}</h3></summary>
          <ul className="reviewlist">
            {items.filter((i) => i.priority === p).map((i) => (
              <li key={i.itemId} className={activeId === i.itemId ? 'active' : ''}>
                {i.review ? <button className="link" onClick={() => onFocus(i)}>{i.label}</button> : <b>{i.label}</b>} <span className="small">[{BASIS_LABEL[i.basis] ?? i.basis}]</span>
                <div className="surveyfields">
                  {i.fields.map((f) => {
                    const raw = draft.values[i.itemId]?.[f] ?? ''
                    const parsed = parseLength(raw, f)
                    const cur = i.current[f]
                    return (
                      <label key={f} className="small">
                        {FIELD_LABEL[f]}
                        <input value={raw} onChange={(e) => setValue(i.itemId, f, e.target.value)} inputMode="decimal" placeholder={cur === null || cur === undefined ? '모름' : `지금 ${cur.toFixed(2)}`} aria-label={`${i.label} ${FIELD_LABEL[f]}`} aria-invalid={!parsed.ok} />
                        {!parsed.ok && <span className="error">{parsed.reason}</span>}
                      </label>
                    )
                  })}
                </div>
                <input value={draft.notes[i.itemId] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, notes: { ...d.notes, [i.itemId]: e.target.value } }))} placeholder="메모(예: 중심까지 잼, 바퀴 포함)" aria-label={`${i.label} 메모`} />
              </li>
            ))}
          </ul>
        </details>
      ))}
      <label className="small">기타 메모<input value={draft.generalNotes} onChange={(e) => setDraft((d) => ({ ...d, generalNotes: e.target.value }))} /></label>
      <div className="row">
        <button className="primary" onClick={download}>결과 내려받기</button>
        <button onClick={() => void copy()}>{copied ? '복사됨' : '결과 복사'}</button>
        <button className="link" onClick={onClose}>닫기</button>
      </div>
      <p className="small">내려받은 파일(LAYOUT_SURVEY3_날짜.json)을 Claude에게 전달하면 3D 배치의 위치·크기를 실측값으로 바꿉니다.</p>
    </div>
  )
}
