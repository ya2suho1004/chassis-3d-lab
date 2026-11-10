import { ITEM_LABEL } from '../app/resultLabels'
import { useEffect, useRef, useState } from 'react'
import { feedbackFor, guidanceFor } from '../app/session'
import { answerFeedbackAllowed } from '../domain/feedbackPolicy'
import type { RecordPayload, SessionContext } from '../domain/record'
import { attempt, markFeedbackShown, pauseRun, requestHint, resumeRun, serializeRun, submitResponse, OFF_SUBSTEPS, type OffSubStep, type TaskRun } from '../domain/taskEngine'
import { buildRecordPayload } from '../domain/record'
import type { Repository } from '../records/repository'
import { createSaveTracker, type SaveState } from '../app/saveRecovery'
import type { DeliveryEnvelope } from '../records/types'
import { inspectPerformance, visibleInspection, type InspectionIssue } from '../domain/npcInspection'
import type { FeedbackText } from '../domain/types'
import { newUuid } from '../domain/uuid'
import type { PanelReadout } from '../scene/panelReadout'
import { TURNING_TASK_ID } from '../domain/grading'
import { focusResponse, responseInputId } from '../app/focusResponse'
import { FeedbackBox } from './FeedbackBox'

const newId = () => newUuid()

/** focusItem: 이 안내가 가리키는 기록 칸(값이 필요한 단계). 있으면 그 칸으로 가는 버튼을 보인다 */
export type Shown = { kind: 'safety' | 'explanatory' | 'hint' | 'guidance'; title: string; text: FeedbackText | null; plain?: string; focusItem?: string }

/** 단계 하나에서 누를 수 있는 버튼(목록과 게임 화면 행동 버튼이 같은 것을 쓴다) */
export interface TaskAction { key: string; label: string; onClick: () => void; disabled?: boolean; cls?: string }
/** 게임 화면(퀘스트 표시·행동 버튼·알림)에 넘기는 현재 상태. 안내 없음 모드에서는 다음 단계를 넘기지 않는다 */
export interface TaskContext {
  guided: boolean
  next: { num: number; text: string } | null
  nextActions: TaskAction[]
  shown: Shown | null
  clearShown: () => void
  doneCount: number
  total: number
  hint: () => void
  inspect: () => void
  /** 3D 조작부 계기 화면에 보일 값(숫자식 계기와 같음) */
  panel: PanelReadout
  /** 이 기기 초안 저장 상태(D4) — 게임 화면 배지에 늘 보인다 */
  saveStatus: SaveState
  /** 지금 상태로 초안을 다시 저장(D4) */
  retrySave: () => void
}

// 항목 표시 이름은 app/resultLabels(결과 화면과 같은 이름)
const DIR_LABEL = { left: '좌회전', right: '우회전' } as const
const ISSUE_LABEL: Record<string, string> = { STEP_NOT_COMPLETED: '단계 미완료', UNANSWERED: '미응답', FINAL_INCORRECT: '최종 답 오답', NOT_EVALUABLE: '채점 불가', SAFETY_NOT_SATISFIED: '안전 조건 미충족' }

const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** 페달을 밟는 동안 계기 숫자가 0에서 올라가 최대값에 멈추는 표시(연출 전용, 판독 정답·기록과 무관) */
function useCountUp(active: boolean, ms = 1500): number {
  const [t, setT] = useState(active ? (reduceMotion ? 1 : 0) : 0)
  useEffect(() => {
    if (!active) { setT(0); return }
    if (reduceMotion) { setT(1); return }
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms)
      setT(1 - (1 - k) ** 3)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, ms])
  return t
}

export interface Proximity { nearIds: string[]; labelOf: (id: string) => string }

export function TaskScreen({ repo, noRecord = false, session, initialRun, onFinish, embedded = false, proximity = null, onRunChange, onContext, initialSaveStatus = 'saved', onSaveStatus }: {
  /** 비기록 모드: 저장 상태 대신 "기록 안 됨"을 보인다 */
  noRecord?: boolean
  repo: Repository; session: SessionContext; initialRun: TaskRun
  onFinish: (run: TaskRun, status: 'completed' | 'aborted', envelope: DeliveryEnvelope | null, saveError: string | null, payload?: RecordPayload | null) => void
  /** 실습장 화면 안에 끼워 넣을 때 true(머리글 생략) */
  embedded?: boolean
  /** 3D 모드에서 장비 근접 여부. null이면 게이팅 없음(도식 모드) */
  proximity?: Proximity | null
  onRunChange?: (run: TaskRun) => void
  /** 게임 화면용 상태 알림 */
  onContext?: (c: TaskContext) => void
  /** 화면 전환으로 패널이 새로 붙을 때 이어받을 저장 상태(D4) */
  initialSaveStatus?: SaveState
  onSaveStatus?: (s: SaveState) => void
}) {
  const [run, setRun] = useState(initialRun)
  // 부모와 마지막으로 주고받은 run. 부모→패널 갱신과 패널→부모 알림이 서로 되돌리지 않게 한다.
  const externalRef = useRef(initialRun)
  useEffect(() => {
    if (initialRun !== externalRef.current) { externalRef.current = initialRun; setRun(initialRun) }
  }, [initialRun])
  useEffect(() => {
    if (run !== externalRef.current) { externalRef.current = run; onRunChange?.(run) }
  }, [run, onRunChange])
  const [saveStatus, setSaveStatus] = useState<SaveState>(initialSaveStatus)
  useEffect(() => { onSaveStatus?.(saveStatus) }, [saveStatus, onSaveStatus])
  const runRef = useRef(run)
  runRef.current = run
  /** 결과 확정(finish)을 시작했는지. 그 뒤로는 초안을 다시 저장하지 않고 finish도 한 번만 한다(독립 검토 2번 —
   *  확정 저장이 지운 초안이 다시 생겨 새로고침 때 '끝내지 않은 수행' 화면이 잘못 뜨던 것) */
  const finishingRef = useRef(false)
  const needsMove = (stepId: string) => {
    if (!proximity) return null
    const st = task.steps.find((x) => x.stepId === stepId)
    if (!st?.equipmentId) return null
    return proximity.nearIds.includes(st.equipmentId) ? null : proximity.labelOf(st.equipmentId)
  }

  // 의미 있는 상태 변화마다 초안을 자동 저장한다(네트워크 없음). 실패는 화면에 표시한다.
  const [trackSave] = useState(() => createSaveTracker(setSaveStatus, () => finishingRef.current))
  const saveDraftOf = (r: TaskRun) => trackSave(() => repo.saveDraft({ recordId: session.recordId, session, snapshot: serializeRun(r), savedAt: new Date().toISOString() }))
  useEffect(() => {
    if (run === initialRun || finishingRef.current) return
    saveDraftOf(run)
  }, [run, repo, session, initialRun]) // eslint-disable-line react-hooks/exhaustive-deps
  /** 저장 실패 뒤 지금 상태로 다시 저장(D4). 확정을 시작한 뒤에는 하지 않는다(지운 초안이 다시 생기지 않게) */
  const retrySave = () => {
    if (finishingRef.current) return
    saveDraftOf(runRef.current)
  }
  // 저장 중에 화면이 바뀌면 앞 패널의 결과를 받을 길이 없어 '저장 중'에 멈춘다. 지금 상태를 다시 저장해 결과를 받는다(같은 수행 초안 덮어쓰기, 독립 검토 4번)
  useEffect(() => {
    if (initialSaveStatus === 'saving') retrySave()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- 패널이 붙을 때 한 번만

  // 화면 숨김 → 일시중지, 복귀 → 재개 (학습시간에서 숨김 구간 제외)
  useEffect(() => {
    const onVis = () => {
      const cur = runRef.current
      if (finishingRef.current) return
      if (document.visibilityState === 'hidden') { const r = pauseRun(cur, 'hidden'); if (r.outcome === 'confirmed') setRun(r.run) }
      else { const r = resumeRun(cur, 'visible'); if (r.outcome === 'confirmed') setRun(r.run) }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const finish = async (finalRun: TaskRun, status: 'completed' | 'aborted') => {
    // 결과 확정: payload + envelope를 같은 트랜잭션으로 저장(초안 삭제). 저장이 끝난 뒤에만 결과 화면으로.
    if (finishingRef.current) return
    finishingRef.current = true
    // G2: 여기서 만든 원본 하나를 저장·결과 화면·내려받기에 함께 쓴다(결과 화면이 다시 만들지 않게)
    let payload: RecordPayload | null = null
    try {
      payload = buildRecordPayload(finalRun, session, { completedAtIso: new Date().toISOString(), completionStatus: status })
      const r = await repo.freezeRecord(payload)
      if (r.status === 'failed') return onFinish(finalRun, status, null, r.errorCode ?? 'FREEZE_FAILED', payload)
      const stored = await repo.loadRecord(session.recordId)
      onFinish(finalRun, status, stored?.envelope ?? null, null, stored?.payload ?? payload)
    } catch (e) {
      onFinish(finalRun, status, null, (e as Error).message, payload)
    }
  }
  const [shown, setShown] = useState<Shown | null>(null)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [graded, setGraded] = useState<Record<string, boolean | null>>({})
  const [inspection, setInspection] = useState<{ result: string; issues: InspectionIssue[]; answersLocked: boolean } | null>(null)
  const [action, setAction] = useState('')

  const task = run.task
  const m = task.measurement
  /** 최소회전반경 과제(설계 2026-11-02) — 오른쪽 기록표·계기·위험 버튼이 제동력과 다르다 */
  const isTurning = task.taskId === TURNING_TASK_ID
  const dirLabel = m.turnDirection ? DIR_LABEL[m.turnDirection] : '-'
  const done = (id: string) => run.completedSteps.includes(id)
  const guidance = guidanceFor(run)
  const showMarks = answerFeedbackAllowed(run)
  const mark = (id: string) => (!showMarks ? (graded[id] !== undefined ? '저장' : '') : graded[id] === true ? '✓' : graded[id] === false ? '✗' : '')
  const markClass = (id: string) => (!showMarks ? '' : graded[id] === true ? 'ok' : graded[id] === false ? 'bad' : '')

  const show = (r: TaskRun, s: Shown, feedbackKey: string | null, itemId?: string) => {
    // 실제로 화면에 표시한 직후에만 feedbackShown을 기록한다 (읽음 증거 아님)
    const next = feedbackKey ? markFeedbackShown(r, s.kind, feedbackKey, itemId).run : r
    setRun(next)
    setShown(s)
  }

  const doStep = (stepId: string) => {
    const far = needsMove(stepId)
    if (far) return setShown({ kind: 'guidance', title: '장비로 이동하세요', text: null, plain: `${far} 접근점에 서야 이 단계를 할 수 있습니다. 바닥을 탭해 이동하세요.` })
    const res = attempt(run, { type: 'step', stepId }, newId())
    if (res.outcome === 'completed') { setRun(res.run); setShown(null); return }
    if (res.outcome === 'blocked') {
      const kind = res.reasonCode?.startsWith('SAFETY_') ? 'safety' : 'explanatory'
      return show(res.run, { kind, title: kind === 'safety' ? '안전 위반 — 진행이 막혔습니다' : '순서가 틀렸습니다', text: feedbackFor(task, res.feedbackKey) }, res.feedbackKey)
    }
    if (res.outcome === 'incomplete') {
      const item = res.reasonCode?.replace('NEEDS_RESPONSE_', '') ?? ''
      return setShown({ kind: 'guidance', title: '이 단계를 끝내려면 값을 먼저 입력하세요', text: null, plain: `${ITEM_LABEL[item] ?? item} 입력이 필요합니다.`, focusItem: item })
    }
    setRun(res.run)
  }

  const confirmLift = () => { setRun(attempt(run, { type: 'confirmSafety', conditionId: 's-lift' }, newId()).run); setShown({ kind: 'guidance', title: '주변 확인 완료', text: null, plain: done('read') ? '리프트 주변에 사람·장애물이 없음을 확인했습니다. 이제 상승할 수 있습니다.' : '리프트 주변에 사람이 없음을 확인했습니다. 이제 하강할 수 있습니다.' }) }
  const confirmEngine = () => { setRun(attempt(run, { type: 'confirmSafety', conditionId: 's-engine' }, newId()).run); setShown({ kind: 'guidance', title: '시동 OFF 확인', text: null, plain: '시동이 꺼진 상태를 확인했습니다. 점검을 진행하세요.' }) }
  // off 단계 하위 행동(U2): 정지 → 주변 재확인 → 상승 → 이탈. 근접 게이팅은 off 단계 장비(조작부) 기준.
  const OFF_LABEL: Record<OffSubStep, string> = { motorOff: 'MOTOR OFF', liftUp: '리프트 상승', exitVehicle: '차량 빼기' }
  const doOffSub = (action: OffSubStep) => {
    const far = needsMove('off')
    if (far) return setShown({ kind: 'guidance', title: '장비로 이동하세요', text: null, plain: `${far} 접근점에 서야 이 단계를 할 수 있습니다.` })
    const res = attempt(run, { type: 'subStep', stepId: 'off', action }, newId())
    if (res.outcome === 'completed') { setRun(res.run); setShown({ kind: 'guidance', title: OFF_LABEL[action], text: null, plain: action === 'motorOff' ? '롤러 정지. 상승 전에 주변을 다시 확인하세요.' : action === 'liftUp' ? '리프트가 올라갔습니다. 이제 차량을 뺄 수 있습니다.' : '차량을 뺐습니다. 산출·판정을 기록하세요.' }); return }
    if (res.outcome === 'blocked') return show(res.run, { kind: 'safety', title: `안전 위반 — ${OFF_LABEL[action]}`, text: feedbackFor(task, res.feedbackKey) }, res.feedbackKey)
    setRun(res.run)
  }

  const hazard = (hazardId: string, label: string) => {
    const res = attempt(run, { type: 'hazard', hazardId }, newId())
    if (res.outcome === 'blocked') return show(res.run, { kind: 'safety', title: `안전 위반 — ${label}`, text: feedbackFor(task, res.feedbackKey) }, res.feedbackKey)
    setShown({ kind: 'guidance', title: label, text: null, plain: '지금 상태에서는 위험하지 않은 행동입니다(기록하지 않음).' })
  }

  const submit = (itemId: string) => {
    const raw = inputs[itemId] ?? ''
    const res = submitResponse(run, itemId, raw, newId())
    if (res.outcome === 'ignored') return setShown({ kind: 'guidance', title: '값을 입력하세요', text: null, plain: `${ITEM_LABEL[itemId]} 칸이 비어 있습니다.` })
    if (res.outcome === 'invalid') return show(res.run, { kind: 'explanatory', title: '입력 형식 오류', text: null, plain: res.reasonCode === 'FORMAT_INTEGER_REQUIRED' ? (isTurning ? '정수만 입력합니다 (예: 30).' : '정수만 입력합니다 (예: 240).') : '숫자만 입력합니다 (예: 6.6).' }, null)
    setGraded((g) => ({ ...g, [itemId]: res.grading?.correct ?? null }))
    // 무안내 모드: 필수 응답 6개의 최초 답이 모두 저장되기 전에는 정오를 알려 주지 않는다(feedbackPolicy, 제안 상태)
    if (!answerFeedbackAllowed(res.run)) {
      setRun(res.run)
      const remaining = res.run.responses.items.filter((i) => i.firstInput === null && i.firstAnswer === null).length
      return setShown({ kind: 'guidance', title: `${ITEM_LABEL[itemId]} 입력 저장`, text: null, plain: remaining > 0 ? `저장했습니다. 남은 입력 ${remaining}개를 모두 제출하면 정오를 알려 줍니다.` : '모든 최초 응답이 저장되었습니다.' })
    }
    if (res.grading?.correct === false) return show(res.run, { kind: 'explanatory', title: `${ITEM_LABEL[itemId]} — 다시 확인하세요`, text: feedbackFor(task, res.feedbackKey) }, res.feedbackKey, itemId)
    setRun(res.run)
    const wrongNow = res.run.responses.items.filter((i) => i.finalCorrect === false).map((i) => ITEM_LABEL[i.itemId] ?? i.itemId)
    if (run.difficultyMode === 'unguided' && !answerFeedbackAllowed(run) && wrongNow.length > 0) {
      // 방금 마지막 최초 응답이 저장됨 → 틀린 항목 이름만 알려 준다(정답은 알려 주지 않음)
      return setShown({ kind: 'explanatory', title: '최초 응답이 모두 저장되었습니다', text: null, plain: `다시 확인할 항목: ${wrongNow.join(', ')}. 해당 칸을 고쳐 다시 입력하면 설명을 보여 줍니다.` })
    }
    setShown({ kind: 'guidance', title: `${ITEM_LABEL[itemId]} 입력 확인`, text: null, plain: '맞습니다. 다음으로 진행하세요.' })
  }

  const hint = () => {
    const res = requestHint(run, newId())
    if (res.outcome === 'eventLimit') { setRun(res.run); return setShown({ kind: 'guidance', title: '기록 한도', text: null, plain: '이벤트 기록 한도(200개)에 닿아 힌트를 기록할 수 없습니다. ‘중단하고 끝내기’로 저장하고 교사에게 알리세요.' }) }
    const next = task.steps.find((s) => s.stepId === run.nextStepId)
    show(res.run, { kind: 'hint', title: '힌트', text: null, plain: next ? `다음 할 일: ${next.instruction}` : '남은 단계가 없습니다. NPC 검사를 받으세요.' }, 'hint_next_step')
  }

  const inspect = () => {
    const r = inspectPerformance(run)
    setRun(r.run)
    if (!r.recorded) return setShown({ kind: 'guidance', title: '기록 한도', text: null, plain: '이벤트 기록 한도(200개)에 닿아 NPC 검사를 기록할 수 없습니다. ‘중단하고 끝내기’로 저장하고 교사에게 알리세요.' })
    // G1: 무안내·최초 답 미완료면 적은 칸의 정오를 숨긴 목록만 보인다(게임 화면 교관 검사도 이 함수를 거친다)
    setInspection({ result: r.result, ...visibleInspection(r.run, r.issues) })
    if (r.result === 'passed') void finish(r.run, 'completed')
  }

  // U1 근사(교사 허용 2026-10-27, 장비 수리 후 확인): 페달을 끝까지 밟으면 버튼 없이 최대값이 자동 고정된다고 가정. 새 버튼·성공 사건 없음
  const rise = useCountUp(done('press'))
  const shownL = m.left === null ? null : Math.round(m.left * rise)
  const shownR = m.right === null ? null : Math.round(m.right * rise)
  const gauge = { axle: done('enter') ? `${m.axleWeight} ${m.unit}` : '---', lr: done('press') ? `L ${shownL}   R ${shownR}  (${m.unit})` : done('motor') ? '측정 대기 — 페달을 밟으세요' : '---', hold: done('press') && rise >= 1 }

  const actionsFor = (stepId: string): TaskAction[] => {
    const out: TaskAction[] = []
    if ((stepId === 'tire' || stepId === 'equip') && !run.satisfiedSafety.includes('s-engine')) out.push({ key: 'engine', label: '시동 OFF 확인', onClick: confirmEngine })
    if (stepId === 'lower' && !run.satisfiedSafety.includes('s-lift')) out.push({ key: 'lift', label: '주변 확인', onClick: confirmLift })
    if (stepId === 'off') {
      for (const a of OFF_SUBSTEPS) {
        if (a === 'liftUp' && run.offProgress.includes('motorOff') && !run.satisfiedSafety.includes('s-lift')) out.push({ key: 'lift-' + a, label: '주변 확인', onClick: confirmLift })
        const isDone = run.offProgress.includes(a)
        out.push({ key: a, label: OFF_LABEL[a] + (isDone ? ' ✓' : ''), onClick: () => doOffSub(a), disabled: isDone, cls: isDone ? 'done' : '' })
      }
    } else {
      const far = needsMove(stepId)
      out.push({ key: 'do', label: far ? '이동 필요' : '수행', onClick: () => doStep(stepId), cls: far ? 'far' : '' })
    }
    return out
  }

  const nextIdx = task.steps.findIndex((s) => s.stepId === run.nextStepId)
  const nearKey = proximity ? proximity.nearIds.join(',') : ''
  useEffect(() => {
    if (!onContext) return
    const g = run.difficultyMode === 'guided' && nextIdx >= 0
    onContext({
      guided: run.difficultyMode === 'guided',
      next: g ? { num: nextIdx + 1, text: task.steps[nextIdx]!.instruction } : null,
      nextActions: g ? actionsFor(task.steps[nextIdx]!.stepId).filter((a) => !a.disabled) : [],
      shown, clearShown: () => setShown(null),
      doneCount: run.completedSteps.length, total: task.steps.length,
      hint, inspect,
      saveStatus, retrySave,
      panel: { axle: done('enter') ? m.axleWeight : null, left: done('press') ? shownL : run.motorOn ? 0 : null, right: done('press') ? shownR : run.motorOn ? 0 : null, hold: gauge.hold, unit: m.unit ?? '' },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, shown, nearKey, onContext, shownL, shownR, gauge.hold, saveStatus])

  return (
    <main className={embedded ? 'embedded task' : 'screen task'}>
      <header className="topbar">
        <div><b>{task.title}</b> · {embedded ? '' : `코드 ${session.anonymousStudentCode} · `}{run.difficultyMode === 'guided' ? '안내 있음' : '안내 없음'}</div>
        <div className="small">{showMarks ? `오류 ${run.errorCount} · ` : ''}안전 위반 {run.safetyViolationCount} · 힌트 {run.hintCount} · {noRecord ? <span>기록 안 됨</span> : <span className={saveStatus === 'failed' ? 'bad' : ''}>{saveStatus === 'saved' ? '이 기기 저장됨' : saveStatus === 'saving' ? '저장 중…' : '저장 실패!'}</span>}{!noRecord && saveStatus === 'failed' && <> <button className="link" onClick={retrySave}>다시 저장</button></>}{run.paused && ' · 일시중지'}</div>
      </header>

      {/* 안내는 교관 칸 밖에 두고 위에 붙인다: 작업 목록을 내려 칸에 값을 넣어도 정오·설명이 보이게(2026-11-10) */}
      {shown && <FeedbackBox className={`panel-feedback feedback ${shown.kind}`} shown={shown} onClose={() => setShown(null)} onFocusItem={(id) => focusResponse(document, id)} />}

      <section className="npc card">
        {isTurning
          ? <><b>NPC 교관:</b> 오늘은 최소회전반경을 측정해 산출하고 차량 상태를 판정합니다. 작업지시서: {dirLabel}, 축거 L {m.wheelbaseM} m, r {m.kingpinOffsetM} m.</>
          : <><b>NPC 교관:</b> 오늘은 뒤축 제동력을 측정해 편차와 합을 계산하고 차량 상태를 판정합니다. 작업지시서: 후륜, 단위 {m.unit}.</>}
        {guidance && <div className="guidance">다음 할 일 → <b>{guidance.text}</b></div>}
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
                      {actionsFor(s.stepId).map((a) => <button key={a.key} onClick={a.onClick} disabled={a.disabled} className={a.cls}>{a.label}</button>)}
                    </span>
                  )}
                  {isDone && <span className="ok">완료</span>}
                </li>
              )
            })}
          </ol>
          <div className="row">
            <button onClick={hint}>힌트 요청</button>
            {!isTurning && <button className="danger" onClick={() => hazard('accelerate', '가속 페달 밟기')}>가속 페달 밟기</button>}
            {!isTurning && <button className="danger" onClick={() => hazard('exitVehicle', '차량 빼기')}>차량 빼기</button>}
          </div>
          {!isTurning && <p className="small">빨간 버튼은 잘못된 조작을 시험해 보는 용도입니다(실제 실습장에서는 하지 마세요).</p>}
        </section>

{isTurning ? (
        <section className="card">
          <h2>회전반경 측정판 (숫자식)</h2>
          <div className="gauge">
            <div><span>좌측 바퀴</span><b>{done('steer') && !done('return') ? `${m.leftAngleDeg}°` : '0°'}</b></div>
            <div><span>우측 바퀴</span><b>{done('steer') && !done('return') ? `${m.rightAngleDeg}°` : '0°'}</b></div>
          </div>
          <h3>판독 입력 (정수, °)</h3>
          {(['leftAngle', 'rightAngle'] as const).map((id) => (
            <div className="field" key={id}>
              <label>{ITEM_LABEL[id]}</label>
              <input id={responseInputId(id)} inputMode="numeric" value={inputs[id] ?? ''} onChange={(e) => setInputs({ ...inputs, [id]: e.target.value })} disabled={!done('steer')} aria-label={ITEM_LABEL[id]} />
              <button onClick={() => submit(id)} disabled={!done('steer')}>입력</button>
              <span className={`mark ${markClass(id)}`}>{mark(id)}</span>
            </div>
          ))}

          <h3>시험 결과 기록표 (섀시 5 — 최소회전반경)</h3>
          <table className="sheet">
            <tbody>
              <tr><td>회전 방향</td><td colSpan={3}><b>{dirLabel}</b> <span className="small">(시험위원 지정)</span></td></tr>
              <tr><td>제시값</td><td colSpan={3}>축거 L = {m.wheelbaseM} m, r = {m.kingpinOffsetM} m</td></tr>
              <tr><td>최소회전반경 (m)</td><td><input id={responseInputId('radius')} inputMode="decimal" value={inputs.radius ?? ''} onChange={(e) => setInputs({ ...inputs, radius: e.target.value })} disabled={!done('return')} aria-label="최소회전반경" /></td><td>{task.ruleset.radiusMaxM} m 이하</td><td><button onClick={() => submit('radius')} disabled={!done('return')}>입력</button> <span className={`mark ${markClass('radius')}`}>{mark('radius')}</span></td></tr>
              <tr><td>판정</td><td>
                <label className="radio"><input id={responseInputId('vehicleCondition')} type="radio" name="verdict" disabled={!done('return')} checked={inputs.vehicleCondition === 'pass'} onChange={() => setInputs({ ...inputs, vehicleCondition: 'pass' })} /> 양호</label>
                <label className="radio"><input type="radio" name="verdict" disabled={!done('return')} checked={inputs.vehicleCondition === 'fail'} onChange={() => setInputs({ ...inputs, vehicleCondition: 'fail' })} /> 불량</label>
              </td><td>기준 이하이면 양호</td><td><button onClick={() => submit('vehicleCondition')} disabled={!done('return')}>입력</button> <span className={`mark ${markClass('vehicleCondition')}`}>{mark('vehicleCondition')}</span></td></tr>
              <tr><td>산출 근거</td><td colSpan={3}><input value={action} onChange={(e) => setAction(e.target.value)} placeholder="예: L ÷ sin α + r" aria-label="산출 근거" /> <span className="small">(비채점 설명 칸 — 점수·기록 없음)</span></td></tr>
            </tbody>
          </table>
          <p className="small">산출식: R = L ÷ sin α + r (α = 회전할 때 바깥쪽 앞바퀴의 최대 조향각). 소수 첫째 자리까지 적고 둘째 자리는 버립니다.</p>
          {m.sinTable && <p className="small sintable">{Object.entries(m.sinTable).map(([a, v]) => `sin ${a}° = ${v}`).join(' · ')}</p>}
        </section>
        ) : (
        <section className="card">
          <h2>조작부 계기 화면 (숫자식)</h2>
          <div className="gauge">
            <div><span>AXLE Load</span><b>{gauge.axle}</b></div>
            <div><span>BRAKE L / R</span><b>{gauge.lr}</b></div>
            {gauge.hold && <div><span>MAX HOLD</span><b>최대값 고정</b></div>}
          </div>
          {gauge.hold && <p className="small">임시 표시: 실제 장비의 값 고정 방식은 수리 후 확인 예정(U1). 지금은 페달을 끝까지 밟으면 최대값이 자동으로 고정된다고 가정합니다.</p>}
          <h3>판독 입력 (정수, {m.unit})</h3>
          {(['axleWeight', 'left', 'right'] as const).map((id) => (
            <div className="field" key={id}>
              <label>{ITEM_LABEL[id]}</label>
              <input id={responseInputId(id)} inputMode="numeric" value={inputs[id] ?? ''} onChange={(e) => setInputs({ ...inputs, [id]: e.target.value })} disabled={id === 'axleWeight' ? !done('enter') : !done('press')} aria-label={ITEM_LABEL[id]} />
              <button onClick={() => submit(id)} disabled={id === 'axleWeight' ? !done('enter') : !done('press')}>입력</button>
              <span className={`mark ${markClass(id)}`}>{mark(id)}</span>
            </div>
          ))}

          <h3>시험 결과 기록표 (섀시 5)</h3>
          <table className="sheet">
            <thead><tr><th>항목</th><th>산출값</th><th>기준</th><th></th></tr></thead>
            <tbody>
              <tr><td>편차 (%)</td><td><input id={responseInputId('deviation')} inputMode="decimal" value={inputs.deviation ?? ''} onChange={(e) => setInputs({ ...inputs, deviation: e.target.value })} disabled={!done('off')} aria-label="편차" /></td><td>{task.ruleset.deviationMaxPercent}% 이내</td><td><button onClick={() => submit('deviation')} disabled={!done('off')}>입력</button> <span className={`mark ${markClass('deviation')}`}>{mark('deviation')}</span></td></tr>
              <tr><td>합 (%)</td><td><input id={responseInputId('sum')} inputMode="decimal" value={inputs.sum ?? ''} onChange={(e) => setInputs({ ...inputs, sum: e.target.value })} disabled={!done('off')} aria-label="합" /></td><td>뒤축 {task.ruleset.sumMinRearPercent}% 이상</td><td><button onClick={() => submit('sum')} disabled={!done('off')}>입력</button> <span className={`mark ${markClass('sum')}`}>{mark('sum')}</span></td></tr>
              <tr><td>판정</td><td>
                <label className="radio"><input id={responseInputId('vehicleCondition')} type="radio" name="verdict" disabled={!done('off')} checked={inputs.vehicleCondition === 'pass'} onChange={() => setInputs({ ...inputs, vehicleCondition: 'pass' })} /> 양호</label>
                <label className="radio"><input type="radio" name="verdict" disabled={!done('off')} checked={inputs.vehicleCondition === 'fail'} onChange={() => setInputs({ ...inputs, vehicleCondition: 'fail' })} /> 불량</label>
              </td><td>편차·합 모두 기준 안이면 양호</td><td><button onClick={() => submit('vehicleCondition')} disabled={!done('off')}>입력</button> <span className={`mark ${markClass('vehicleCondition')}`}>{mark('vehicleCondition')}</span></td></tr>
              <tr><td>정비 및 조치할 사항</td><td colSpan={3}><input value={action} onChange={(e) => setAction(e.target.value)} placeholder="양호면 '없음'" aria-label="조치" /> <span className="small">(비채점 설명 칸 — 교사 확인 0E: 점수·기록 없음)</span></td></tr>
            </tbody>
          </table>
          <p className="small">산출식: 편차 = (큰 값 − 작은 값) ÷ 축중 × 100, 합 = (좌 + 우) ÷ 축중 × 100. 소수 첫째 자리까지 적고 둘째 자리는 버립니다.</p>
        </section>
        )}
      </div>

      <section className="card">
        <div className="row">
          <button className="primary" onClick={inspect}>NPC 검사 받기</button>
          <button onClick={() => void finish(run, 'aborted')}>중단하고 끝내기</button>
        </div>
        {inspection && inspection.result !== 'passed' && (
          <div className="feedback explanatory"><b>NPC: 보완이 필요합니다 ({inspection.issues.length}건)</b>
            <ul>{inspection.issues.map((i, k) => (<li key={k}>{i.kind === 'step' ? `${task.steps.findIndex((s) => s.stepId === i.stepId) + 1}번 단계` : i.kind === 'response' ? ITEM_LABEL[i.itemId] ?? i.itemId : i.conditionId}: {ISSUE_LABEL[i.reasonCode] ?? i.reasonCode}</li>))}</ul>
            {inspection.answersLocked && <p className="small">입력한 답이 맞는지는 모든 칸에 처음 답을 적은 뒤 알려 줍니다.</p>}
          </div>
        )}
      </section>
    </main>
  )
}
