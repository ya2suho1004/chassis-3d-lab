// 기록 창 안 내용(설계 2026-11-10 §4): 단계마다 계기 그림과 그 단계의 칸만 보인다.
// 표시창 값은 작업 목록의 숫자식 계기와 같다(새로 보여 주는 값 없음). 계산 단계에는 실제 값 대신 학생이 제출한 값
// (내가 적은 값)을 보인다 — 판독 실수를 화면이 몰래 고쳐 주지 않게. 비채점 칸(조치·산출 근거)은 점수·기록이 없다.
import { calculatorKindOf, type TaskRun } from '../domain/taskEngine'
import type { TurningRig } from '../scene/turningRig'
import { NumberField, VerdictField, type FieldIo } from './RecordFields'
import { dialCaption, ReviewToggle, TurningDialPicture } from './TurningDialPicture'
import type { CalcEvaluation } from '../app/calculator'
import { CalculatorPanel } from './Calculator'

/** 제동력 표시창(TaskScreen의 gauge와 같은 값) */
export interface BrakeGauge { axle: string; lr: string; hold: boolean; measuring: boolean }

const DIR_LABEL = { left: '좌회전', right: '우회전' } as const
/** 창의 판정 라디오 이름(작업 목록의 'verdict'와 따로) */
const RADIO = 'rec-verdict'

export function RecordSheet({ run, stepId, io, gauge, needles, reviewing, canReview, onToggleReview, note, onNote, onCalc }: {
  run: TaskRun
  stepId: string
  io: FieldIo
  gauge: BrakeGauge
  /** 그림에 그릴 바늘(다시 보기 중이면 측정 당시 각도) */
  needles: TurningRig
  reviewing: boolean
  canReview: boolean
  onToggleReview: () => void
  /** 비채점 칸(정비 및 조치할 사항·산출 근거) */
  note: string
  onNote: (v: string) => void
  /** 계산기에서 = 를 누를 때(계산기 기록, 계산기 설계 §3) */
  onCalc: (e: CalcEvaluation) => void
}) {
  const task = run.task
  const m = task.measurement
  const cond = task.steps.find((s) => s.stepId === stepId)?.completionCondition
  const mine = (id: string) => run.responses.items.find((i) => i.itemId === id)?.finalInput ?? '—'

  if (cond === 'axleWeightRead') return (
    <div className="rec-row led">
      <div className="gauge"><div><span>AXLE Load</span><b>{gauge.axle}</b></div></div>
      <div><NumberField itemId="axleWeight" io={io} /></div>
    </div>
  )
  if (cond === 'readingsSubmitted') return (
    <div className="rec-row led">
      <div className="gauge">
        <div><span>BRAKE L / R</span><b>{gauge.lr}</b></div>
        <div><span>MAX HOLD</span><b>{gauge.hold ? '최대값 고정' : gauge.measuring ? '측정 중…' : '---'}</b></div>
      </div>
      <div>
        <NumberField itemId="left" io={io} />
        <NumberField itemId="right" io={io} />
        {gauge.measuring && <p className="small">최대값이 고정되면 적을 수 있습니다.</p>}
      </div>
    </div>
  )
  if (cond === 'answersSubmitted') return (
    <>
      <p className="rec-mine">내가 적은 값: 축중 {mine('axleWeight')} · 좌 {mine('left')} · 우 {mine('right')} ({m.unit})</p>
      <p className="small">산출식: 편차 = (큰 값 − 작은 값) ÷ 축중 × 100, 합 = (좌 + 우) ÷ 축중 × 100. 소수 첫째 자리까지 적고 둘째 자리는 버립니다.</p>
      <p className="small">기준: 편차 {task.ruleset.deviationMaxPercent}% 이내 · 합 뒤축 {task.ruleset.sumMinRearPercent}% 이상 · 둘 다 기준 안이면 양호</p>
      <CalculatorPanel kind={calculatorKindOf(task)} onEvaluate={onCalc} />
      <NumberField itemId="deviation" io={io} decimal />
      <NumberField itemId="sum" io={io} decimal />
      <VerdictField io={io} radioName={RADIO} />
      <label className="rec-note">정비 및 조치할 사항 <span className="small">(채점·기록 없음)</span>
        <input value={note} onChange={(e) => onNote(e.target.value)} placeholder="양호면 '없음'" />
      </label>
    </>
  )
  if (cond === 'anglesRead') return (
    <>
      {(['left', 'right'] as const).map((side) => (
        <div className="rec-row" key={side}>
          <TurningDialPicture side={side} deg={side === 'left' ? needles.leftDeg : needles.rightDeg} caption={dialCaption(side, reviewing)} />
          <NumberField itemId={side === 'left' ? 'leftAngle' : 'rightAngle'} io={io} />
        </div>
      ))}
      {canReview && <ReviewToggle reviewing={reviewing} onToggle={onToggleReview} />}
    </>
  )
  if (cond === 'radiusSubmitted') return (
    <>
      <p className="rec-mine">작업지시서: {m.turnDirection ? DIR_LABEL[m.turnDirection] : '-'} · 축거 L {m.wheelbaseM} m · r {m.kingpinOffsetM} m<br />내가 적은 조향각: 좌 {mine('leftAngle')}° · 우 {mine('rightAngle')}°</p>
      <p className="small">산출식: R = L ÷ sin α + r (α = 회전할 때 바깥쪽 앞바퀴의 최대 조향각). 소수 첫째 자리까지 적고 둘째 자리는 버립니다.</p>
      {m.sinTable && <p className="small sintable">{Object.entries(m.sinTable).map(([a, v]) => `sin ${a}° = ${v}`).join(' · ')}</p>}
      <p className="small">기준: {task.ruleset.radiusMaxM} m 이하이면 양호</p>
      <CalculatorPanel kind={calculatorKindOf(task)} onEvaluate={onCalc} />
      <NumberField itemId="radius" io={io} decimal />
      <VerdictField io={io} radioName={RADIO} />
      <label className="rec-note">산출 근거 <span className="small">(채점·기록 없음)</span>
        <input value={note} onChange={(e) => onNote(e.target.value)} placeholder="예: L ÷ sin α + r" />
      </label>
    </>
  )
  return null
}
