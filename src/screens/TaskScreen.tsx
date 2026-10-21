import { useState } from 'react'
import { feedbackFor, guidanceFor } from '../app/session'
import type { SessionContext } from '../domain/record'
import { attempt, markFeedbackShown, requestHint, submitResponse, type TaskRun } from '../domain/taskEngine'
import { inspectPerformance, type InspectionIssue } from '../domain/npcInspection'
import type { FeedbackText } from '../domain/types'

const newId = () => crypto.randomUUID()

type Shown = { kind: 'safety' | 'explanatory' | 'hint' | 'guidance'; title: string; text: FeedbackText | null; plain?: string }

const ITEM_LABEL: Record<string, string> = { left: '좌 제동력', right: '우 제동력', axleWeight: '축중', deviation: '편차(%)', sum: '합(%)', vehicleCondition: '판정' }
const ISSUE_LABEL: Record<string, string> = { STEP_NOT_COMPLETED: '단계 미완료', UNANSWERED: '미응답', FINAL_INCORRECT: '최종 답 오답', NOT_EVALUABLE: '채점 불가', SAFETY_NOT_SATISFIED: '안전 조건 미충족' }

export function TaskScreen({ session, initialRun, onFinish }: { session: SessionContext; initialRun: TaskRun; onFinish: (run: TaskRun, status: 'completed' | 'aborted') => void }) {
  const [run, setRun] = useState(initialRun)
  const [shown, setShown] = useState<Shown | null>(null)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [graded, setGraded] = useState<Record<string, boolean | null>>({})
  const [inspection, setInspection] = useState<{ result: string; issues: InspectionIssue[] } | null>(null)
  const [action, setAction] = useState('')

  const task = run.task
  const m = task.measurement
  const done = (id: string) => run.completedSteps.includes(id)
  const guidance = guidanceFor(run)

  const show = (r: TaskRun, s: Shown, feedbackKey: string | null, itemId?: string) => {
    // 실제로 화면에 표시한 직후에만 feedbackShown을 기록한다 (읽음 증거 아님)
    const next = feedbackKey ? markFeedbackShown(r, s.kind, feedbackKey, itemId).run : r
    setRun(next)
    setShown(s)
  }

  const doStep = (stepId: string) => {
    const res = attempt(run, { type: 'step', stepId }, newId())
    if (res.outcome === 'completed') { setRun(res.run); setShown(null); return }
    if (res.outcome === 'blocked') {
      const kind = res.reasonCode?.startsWith('SAFETY_') ? 'safety' : 'explanatory'
      return show(res.run, { kind, title: kind === 'safety' ? '안전 위반 — 진행이 막혔습니다' : '순서가 틀렸습니다', text: feedbackFor(task, res.feedbackKey) }, res.feedbackKey)
    }
    if (res.outcome === 'incomplete') {
      const item = res.reasonCode?.replace('NEEDS_RESPONSE_', '') ?? ''
      return setShown({ kind: 'guidance', title: '이 단계를 끝내려면 값을 먼저 입력하세요', text: null, plain: `${ITEM_LABEL[item] ?? item} 입력이 필요합니다.` })
    }
    setRun(res.run)
  }

  const confirmLift = () => { setRun(attempt(run, { type: 'confirmSafety', conditionId: 's-lift' }, newId()).run); setShown({ kind: 'guidance', title: '주변 확인 완료', text: null, plain: '리프트 주변에 사람이 없음을 확인했습니다. 이제 하강할 수 있습니다.' }) }

  const hazard = (hazardId: string, label: string) => {
    const res = attempt(run, { type: 'hazard', hazardId }, newId())
    if (res.outcome === 'blocked') return show(res.run, { kind: 'safety', title: `안전 위반 — ${label}`, text: feedbackFor(task, res.feedbackKey) }, res.feedbackKey)
    setShown({ kind: 'guidance', title: label, text: null, plain: '지금 상태에서는 위험하지 않은 행동입니다(기록하지 않음).' })
  }

  const submit = (itemId: string) => {
    const raw = inputs[itemId] ?? ''
    const res = submitResponse(run, itemId, raw, newId())
    if (res.outcome === 'ignored') return setShown({ kind: 'guidance', title: '값을 입력하세요', text: null, plain: `${ITEM_LABEL[itemId]} 칸이 비어 있습니다.` })
    if (res.outcome === 'invalid') return show(res.run, { kind: 'explanatory', title: '입력 형식 오류', text: null, plain: res.reasonCode === 'FORMAT_INTEGER_REQUIRED' ? '정수만 입력합니다 (예: 240).' : '숫자만 입력합니다 (예: 6.6).' }, null)
    setGraded((g) => ({ ...g, [itemId]: res.grading?.correct ?? null }))
    if (res.grading?.correct === false) return show(res.run, { kind: 'explanatory', title: `${ITEM_LABEL[itemId]} — 다시 확인하세요`, text: feedbackFor(task, res.feedbackKey) }, res.feedbackKey, itemId)
    setRun(res.run)
    setShown({ kind: 'guidance', title: `${ITEM_LABEL[itemId]} 입력 확인`, text: null, plain: '맞습니다. 다음으로 진행하세요.' })
  }

  const hint = () => {
    const res = requestHint(run, newId())
    const next = task.steps.find((s) => s.stepId === run.nextStepId)
    show(res.run, { kind: 'hint', title: '힌트', text: null, plain: next ? `다음 할 일: ${next.instruction}` : '남은 단계가 없습니다. NPC 검사를 받으세요.' }, 'hint_next_step')
  }

  const inspect = () => {
    const r = inspectPerformance(run)
    setRun(r.run)
    setInspection({ result: r.result, issues: r.issues })
    if (r.result === 'passed') onFinish(r.run, 'completed')
  }

  const gauge = { axle: done('enter') ? `${m.axleWeight} ${m.unit}` : '---', lr: done('press') ? `L ${m.left}   R ${m.right}  (${m.unit})` : done('motor') ? '측정 대기 — 페달을 밟으세요' : '---' }

  return (
    <main className="screen task">
      <header className="topbar">
        <div><b>{task.title}</b> · 코드 {session.anonymousStudentCode} · {run.difficultyMode === 'guided' ? '안내 있음' : '안내 없음'}</div>
        <div className="small">오류 {run.errorCount} · 안전 위반 {run.safetyViolationCount} · 힌트 {run.hintCount}</div>
      </header>

      <section className="npc card">
        <b>NPC 교관:</b> 오늘은 뒤축 제동력을 측정해 편차와 합을 계산하고 차량 상태를 판정합니다. 작업지시서: 후륜, 단위 {m.unit}.
        {guidance && <div className="guidance">다음 할 일 → <b>{guidance.text}</b></div>}
        {shown && (
          <div className={`feedback ${shown.kind}`} role="alert">
            <b>{shown.title}</b>
            {shown.text ? (<ul><li>무엇: {shown.text.what}</li><li>왜: {shown.text.why}</li><li>어떻게: {shown.text.how}</li></ul>) : <p>{shown.plain}</p>}
          </div>
        )}
      </section>

      <div className="columns">
        <section className="card">
          <h2>검사 작업 순서</h2>
          <ol className="steps">
            {task.steps.map((s, i) => {
              const isDone = done(s.stepId)
              const isNext = run.nextStepId === s.stepId
              return (
                <li key={s.stepId} className={isDone ? 'done' : isNext && run.difficultyMode === 'guided' ? 'next' : ''}>
                  <span className="num">{i + 1}</span>
                  <span className="text">{s.instruction}{s.requiredSafetyConditions.some((c) => c !== 's-ppe') && <em className="safe"> 안전</em>}</span>
                  {!isDone && (
                    <span className="btns">
                      {s.stepId === 'lower' && !run.satisfiedSafety.includes('s-lift') && <button onClick={confirmLift}>주변 확인</button>}
                      <button onClick={() => doStep(s.stepId)}>수행</button>
                    </span>
                  )}
                  {isDone && <span className="ok">완료</span>}
                </li>
              )
            })}
          </ol>
          <div className="row">
            <button onClick={hint}>힌트 요청</button>
            <button className="danger" onClick={() => hazard('accelerate', '가속 페달 밟기')}>가속 페달 밟기</button>
            <button className="danger" onClick={() => hazard('exitVehicle', '차량 빼기')}>차량 빼기</button>
          </div>
          <p className="small">빨간 버튼은 잘못된 조작을 시험해 보는 용도입니다(실제 실습장에서는 하지 마세요).</p>
        </section>

        <section className="card">
          <h2>조작부 계기 화면 (숫자식)</h2>
          <div className="gauge">
            <div><span>AXLE Load</span><b>{gauge.axle}</b></div>
            <div><span>BRAKE L / R</span><b>{gauge.lr}</b></div>
          </div>
          <h3>판독 입력 (정수, {m.unit})</h3>
          {(['axleWeight', 'left', 'right'] as const).map((id) => (
            <div className="field" key={id}>
              <label>{ITEM_LABEL[id]}</label>
              <input inputMode="numeric" value={inputs[id] ?? ''} onChange={(e) => setInputs({ ...inputs, [id]: e.target.value })} disabled={id === 'axleWeight' ? !done('enter') : !done('press')} aria-label={ITEM_LABEL[id]} />
              <button onClick={() => submit(id)} disabled={id === 'axleWeight' ? !done('enter') : !done('press')}>입력</button>
              <span className={`mark ${graded[id] === true ? 'ok' : graded[id] === false ? 'bad' : ''}`}>{graded[id] === true ? '✓' : graded[id] === false ? '✗' : ''}</span>
            </div>
          ))}

          <h3>시험 결과 기록표 (섀시 5)</h3>
          <table className="sheet">
            <thead><tr><th>항목</th><th>산출값</th><th>기준</th><th></th></tr></thead>
            <tbody>
              <tr><td>편차 (%)</td><td><input inputMode="decimal" value={inputs.deviation ?? ''} onChange={(e) => setInputs({ ...inputs, deviation: e.target.value })} disabled={!done('off')} aria-label="편차" /></td><td>{task.ruleset.deviationMaxPercent}% 이내</td><td><button onClick={() => submit('deviation')} disabled={!done('off')}>입력</button> <span className={`mark ${graded.deviation === true ? 'ok' : graded.deviation === false ? 'bad' : ''}`}>{graded.deviation === true ? '✓' : graded.deviation === false ? '✗' : ''}</span></td></tr>
              <tr><td>합 (%)</td><td><input inputMode="decimal" value={inputs.sum ?? ''} onChange={(e) => setInputs({ ...inputs, sum: e.target.value })} disabled={!done('off')} aria-label="합" /></td><td>뒤축 {task.ruleset.sumMinRearPercent}% 이상</td><td><button onClick={() => submit('sum')} disabled={!done('off')}>입력</button> <span className={`mark ${graded.sum === true ? 'ok' : graded.sum === false ? 'bad' : ''}`}>{graded.sum === true ? '✓' : graded.sum === false ? '✗' : ''}</span></td></tr>
              <tr><td>판정</td><td>
                <label className="radio"><input type="radio" name="verdict" disabled={!done('off')} checked={inputs.vehicleCondition === 'pass'} onChange={() => setInputs({ ...inputs, vehicleCondition: 'pass' })} /> 양호</label>
                <label className="radio"><input type="radio" name="verdict" disabled={!done('off')} checked={inputs.vehicleCondition === 'fail'} onChange={() => setInputs({ ...inputs, vehicleCondition: 'fail' })} /> 불량</label>
              </td><td>편차·합 모두 기준 안이면 양호</td><td><button onClick={() => submit('vehicleCondition')} disabled={!done('off')}>입력</button> <span className={`mark ${graded.vehicleCondition === true ? 'ok' : graded.vehicleCondition === false ? 'bad' : ''}`}>{graded.vehicleCondition === true ? '✓' : graded.vehicleCondition === false ? '✗' : ''}</span></td></tr>
              <tr><td>정비 및 조치할 사항</td><td colSpan={3}><input value={action} onChange={(e) => setAction(e.target.value)} placeholder="양호면 '없음'" aria-label="조치" /> <span className="small">(시연에서는 채점·기록하지 않음)</span></td></tr>
            </tbody>
          </table>
          <p className="small">산출식: 편차 = (큰 값 − 작은 값) ÷ 축중 × 100, 합 = (좌 + 우) ÷ 축중 × 100. 소수 첫째 자리까지 적고 둘째 자리는 버립니다.</p>
        </section>
      </div>

      <section className="card">
        <div className="row">
          <button className="primary" onClick={inspect}>NPC 검사 받기</button>
          <button onClick={() => onFinish(run, 'aborted')}>중단하고 끝내기</button>
        </div>
        {inspection && inspection.result !== 'passed' && (
          <div className="feedback explanatory"><b>NPC: 보완이 필요합니다 ({inspection.issues.length}건)</b>
            <ul>{inspection.issues.map((i, k) => (<li key={k}>{i.kind === 'step' ? `${task.steps.findIndex((s) => s.stepId === i.stepId) + 1}번 단계` : i.kind === 'response' ? ITEM_LABEL[i.itemId] ?? i.itemId : i.conditionId}: {ISSUE_LABEL[i.reasonCode] ?? i.reasonCode}</li>))}</ul>
          </div>
        )}
      </section>
    </main>
  )
}
