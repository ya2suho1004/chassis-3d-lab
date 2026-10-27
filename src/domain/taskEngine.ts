// 과제 엔진 — 단계 전이, 안전 인터록, 오류/안전/힌트 집계, 의미 이벤트
// 원칙(docs/design/docs/04 §3, §8; CLAUDE.md §5):
//  - 선행 단계·안전 조건이 충족되지 않은 조작은 차단하고 이유 코드와 피드백 키를 돌려준다.
//  - 안전 위반은 safetyViolationCount, 비안전 학습오류는 errorCount. 같은 actionId는 한 번만 센다.
//  - 힌트는 학생 요청만 센다. 프레임별 좌표 같은 값은 기록하지 않는다.
//  - 이벤트는 200개를 넘기면 자르지 않고 '한도 도달' 상태로 바꾼다.
//  - 화면·네트워크·저장소에 의존하지 않는다(순수 함수).
import { createResponseSheet, submitAnswer, type ResponseSheet, type SubmitResult } from './grading'
import type { ApprovedTask, TaskStep } from './types'
import { newUuid } from './uuid'

export type DifficultyMode = 'guided' | 'unguided' | 'timedAssessment'

export type EventType =
  | 'taskStarted' | 'stepCompleted' | 'actionBlocked' | 'answerSubmitted' | 'hintRequested'
  | 'feedbackShown' | 'npcInspected' | 'paused' | 'resumed' | 'displayModeChanged' | 'taskFinalized'

export type DisplayMode = 'threeD' | 'diagram'

export interface StepEvent {
  eventId: string
  sequence: number
  elapsedMs: number
  type: EventType
  stepId?: string
  actionId?: string
  reasonCode?: string
  itemId?: string
  feedbackKey?: string
  feedbackKind?: 'safety' | 'explanatory' | 'hint' | 'guidance'
  fromDisplayMode?: DisplayMode
  toDisplayMode?: DisplayMode
}

export interface EngineDeps {
  now: () => number
  newId: () => string
}

export interface TaskRun {
  task: ApprovedTask
  difficultyMode: DifficultyMode
  startedAtMs: number
  completedSteps: string[]
  nextStepId: string | null
  allStepsCompleted: boolean
  /** 충족된 선행 안전 조건(보호구 착용·주변 확인·차량 중앙 정렬) */
  satisfiedSafety: string[]
  motorOn: boolean
  /** off 단계 하위 행동 진행(U2). 완료 순서대로 쌓인다 */
  offProgress: OffSubStep[]
  responses: ResponseSheet
  events: StepEvent[]
  eventLimitReached: boolean
  errorCount: number
  errorTypes: Record<string, number>
  safetyViolationCount: number
  safetyViolationTypes: Record<string, number>
  hintCount: number
  /** 같은 수행 안에서 NPC 검사를 받은 횟수 */
  npcInspectionCount: number
  /** 일시중지 상태(화면 숨김 등). 조작 거부, 경과시간 정지 */
  paused: boolean
  pausedAtMs: number | null
  pauseCount: number
  resumeCount: number
  timeQuality: 'continuous' | 'resumed' | 'uncertain'
  /** 현재 화면 모드와 경험한 모드 목록(시작 모드는 기록의 displayMode) */
  displayMode: DisplayMode
  experiencedDisplayModes: DisplayMode[]
  /** 중복 집계 방지용 */
  countedActionIds: string[]
}

export type Attempt =
  | { type: 'step'; stepId: string }
  | { type: 'confirmSafety'; conditionId: string }
  | { type: 'subStep'; stepId: 'off'; action: OffSubStep }
  | { type: 'hazard'; hazardId: string }

export type Outcome = 'completed' | 'blocked' | 'incomplete' | 'alreadyCompleted' | 'confirmed' | 'ignored' | 'eventLimit' | 'invalid' | 'graded' | 'paused'

export interface AttemptResult {
  run: TaskRun
  outcome: Outcome
  reasonCode: string | null
  feedbackKey: string | null
}

export const EVENT_LIMIT = 200

/** 선행 조건형 안전 조건: 단계 진행 전에 참이어야 한다. */
const PRECONDITIONS = new Set(['s-ppe', 's-lift', 's-motor', 's-engine'])
/** 금지형 안전 조건: 위험 행동(hazard)으로 위반된다. 단계 진행 자체는 막지 않는다. */
const HAZARDS: Record<string, { conditionId: string; whenMotorOn: boolean }> = {
  accelerate: { conditionId: 's-accel', whenMotorOn: true },
  exitVehicle: { conditionId: 's-exit', whenMotorOn: true },
  engineOnInspection: { conditionId: 's-engine', whenMotorOn: false },
}
const SAFETY_FEEDBACK: Record<string, string> = {
  's-ppe': 'blocked_ppe',
  's-lift': 'blocked_safety_lift',
  's-motor': 'blocked_safety_motor',
  's-accel': 'blocked_safety_accel',
  's-exit': 'blocked_safety_exit',
  's-engine': 'blocked_safety_engine',
}
/** off 단계의 하위 행동(설계 13 §4·12 U2): 정지 → 주변 재확인 → 상승 → 이탈. 안전한 정지 행동(motorOff)은 막지 않는다. */
export const OFF_SUBSTEPS = ['motorOff', 'liftUp', 'exitVehicle'] as const
export type OffSubStep = (typeof OFF_SUBSTEPS)[number]
/** 완료 조건이 응답 제출을 요구하는 단계 */
const RESPONSE_REQUIREMENTS: Record<string, string[]> = {
  axleWeightRead: ['axleWeight'],
  readingsSubmitted: ['left', 'right'],
  answersSubmitted: ['deviation', 'sum', 'vehicleCondition'],
}

function defaultDeps(): EngineDeps {
  return { now: () => Date.now(), newId: () => newUuid() }
}

const depsByRun = new WeakMap<TaskRun, EngineDeps>()
function depsOf(run: TaskRun): EngineDeps {
  return depsByRun.get(run) ?? defaultDeps()
}
function carry<T extends TaskRun>(from: TaskRun, to: T): T {
  depsByRun.set(to, depsOf(from))
  return to
}

function nextStepOf(task: ApprovedTask, completed: string[]): string | null {
  const s = task.steps.find((st) => !completed.includes(st.stepId))
  return s ? s.stepId : null
}

/** 의미 이벤트 추가. 다른 도메인 모듈(NPC 검사 등)도 사용한다. */
export function appendEvent(run: TaskRun, ev: Omit<StepEvent, 'eventId' | 'sequence' | 'elapsedMs'>): { run: TaskRun; ok: boolean } {
  if (run.events.length >= EVENT_LIMIT) return { run: carry(run, { ...run, eventLimitReached: true }), ok: false }
  const d = depsOf(run)
  const e: StepEvent = { eventId: d.newId(), sequence: run.events.length + 1, elapsedMs: Math.max(0, d.now() - run.startedAtMs), ...ev }
  return { run: carry(run, { ...run, events: [...run.events, e] }), ok: true }
}

function bump(map: Record<string, number>, key: string): Record<string, number> {
  return { ...map, [key]: (map[key] ?? 0) + 1 }
}

function countBlocked(run: TaskRun, actionId: string, kind: 'safety' | 'error', key: string): TaskRun {
  if (run.countedActionIds.includes(actionId)) return run
  const counted = [...run.countedActionIds, actionId]
  if (kind === 'safety') {
    return carry(run, { ...run, countedActionIds: counted, safetyViolationCount: run.safetyViolationCount + 1, safetyViolationTypes: bump(run.safetyViolationTypes, key) })
  }
  return carry(run, { ...run, countedActionIds: counted, errorCount: run.errorCount + 1, errorTypes: bump(run.errorTypes, key) })
}

export function createTaskRun(task: ApprovedTask, opts: { difficultyMode: DifficultyMode; displayMode?: DisplayMode }, deps: EngineDeps = defaultDeps()): TaskRun {
  const startedAtMs = deps.now()
  const base: TaskRun = {
    task,
    difficultyMode: opts.difficultyMode,
    startedAtMs,
    completedSteps: [],
    nextStepId: nextStepOf(task, []),
    allStepsCompleted: false,
    satisfiedSafety: [],
    motorOn: false,
    offProgress: [],
    responses: createResponseSheet(task),
    events: [],
    eventLimitReached: false,
    errorCount: 0,
    errorTypes: {},
    safetyViolationCount: 0,
    safetyViolationTypes: {},
    hintCount: 0,
    npcInspectionCount: 0,
    paused: false,
    pausedAtMs: null,
    pauseCount: 0,
    resumeCount: 0,
    timeQuality: 'continuous',
    displayMode: opts.displayMode ?? 'threeD',
    experiencedDisplayModes: [opts.displayMode ?? 'threeD'],
    countedActionIds: [],
  }
  depsByRun.set(base, deps)
  return appendEvent(base, { type: 'taskStarted' }).run
}

function blocked(run: TaskRun, actionId: string, kind: 'safety' | 'error', key: string, reasonCode: string, feedbackKey: string, stepId?: string): AttemptResult {
  const ev = appendEvent(run, { type: 'actionBlocked', stepId, actionId, reasonCode, feedbackKey })
  if (!ev.ok) return { run: ev.run, outcome: 'eventLimit', reasonCode: 'EVENT_LIMIT', feedbackKey: null }
  return { run: countBlocked(ev.run, actionId, kind, key), outcome: 'blocked', reasonCode, feedbackKey }
}

function attemptStep(run: TaskRun, step: TaskStep, actionId: string): AttemptResult {
  if (run.completedSteps.includes(step.stepId)) return { run, outcome: 'alreadyCompleted', reasonCode: null, feedbackKey: null }

  // 1) 선행 안전 조건 (금지형은 hazard로 다루므로 제외)
  for (const cond of step.requiredSafetyConditions) {
    if (PRECONDITIONS.has(cond) && !run.satisfiedSafety.includes(cond)) {
      return blocked(run, actionId, 'safety', cond, `SAFETY_${cond}`, SAFETY_FEEDBACK[cond] ?? step.onBlockedFeedbackKey, step.stepId)
    }
  }
  // 2) 선행 단계
  const missing = step.prerequisites.find((p) => !run.completedSteps.includes(p))
  if (missing) return blocked(run, actionId, 'error', 'order', `ORDER_${missing}`, 'blocked_order', step.stepId)

  // 3) off 단계는 단일 수행으로 완료하지 않는다 — 하위 행동(subStep)으로만 진행(U2)
  if (step.stepId === 'off') {
    const next = OFF_SUBSTEPS.find((x) => !run.offProgress.includes(x))
    return { run, outcome: 'incomplete', reasonCode: `NEEDS_SUBSTEP_${next ?? 'exitVehicle'}`, feedbackKey: null }
  }
  // 3) 응답이 필요한 완료 조건
  const needed = RESPONSE_REQUIREMENTS[step.completionCondition] ?? []
  for (const itemId of needed) {
    const it = run.responses.items.find((i) => i.itemId === itemId)
    const answered = it ? it.firstInput !== null || it.firstAnswer !== null : false
    if (!answered) return { run, outcome: 'incomplete', reasonCode: `NEEDS_RESPONSE_${itemId}`, feedbackKey: null }
  }

  // 4) 완료 처리와 부수 효과
  const completedSteps = [...run.completedSteps, step.stepId]
  let satisfiedSafety = run.satisfiedSafety
  if (step.stepId === 'ppe' && !satisfiedSafety.includes('s-ppe')) satisfiedSafety = [...satisfiedSafety, 's-ppe']
  if (step.stepId === 'enter' && !satisfiedSafety.includes('s-motor')) satisfiedSafety = [...satisfiedSafety, 's-motor']
  let motorOn = run.motorOn
  if (step.stepId === 'motor') motorOn = true
  if (step.stepId === 'off') motorOn = false
  const nextStepId = nextStepOf(run.task, completedSteps)
  const updated = carry(run, { ...run, completedSteps, satisfiedSafety, motorOn, nextStepId, allStepsCompleted: nextStepId === null })
  const ev = appendEvent(updated, { type: 'stepCompleted', stepId: step.stepId, actionId })
  if (!ev.ok) return { run: ev.run, outcome: 'eventLimit', reasonCode: 'EVENT_LIMIT', feedbackKey: null }
  return { run: ev.run, outcome: 'completed', reasonCode: null, feedbackKey: null }
}

/** off 하위 행동. 검사 시점(13 §4): 상승·이탈 전 정지 확인(s-exit), 상승 직전 주변 재확인(s-lift, 하강 때 확인 재사용 안 함). */
function attemptOffSubStep(run: TaskRun, action: OffSubStep, actionId: string): AttemptResult {
  const step = run.task.steps.find((s) => s.stepId === 'off')
  if (!step) return { run, outcome: 'invalid', reasonCode: 'UNKNOWN_STEP', feedbackKey: null }
  if (run.completedSteps.includes('off') || run.offProgress.includes(action)) return { run, outcome: 'alreadyCompleted', reasonCode: null, feedbackKey: null }
  if (!run.satisfiedSafety.includes('s-ppe')) return blocked(run, actionId, 'safety', 's-ppe', 'SAFETY_s-ppe', 'blocked_ppe', 'off')
  const missing = step.prerequisites.find((p) => !run.completedSteps.includes(p))
  if (missing) return blocked(run, actionId, 'error', 'order', `ORDER_${missing}`, 'blocked_order', 'off')
  let satisfiedSafety = run.satisfiedSafety
  let motorOn = run.motorOn
  if (action === 'motorOff') {
    motorOn = false
    satisfiedSafety = satisfiedSafety.filter((c) => c !== 's-lift') // 하강 때의 주변 확인은 상승에 재사용하지 않는다
  } else if (action === 'liftUp') {
    if (run.motorOn || !run.offProgress.includes('motorOff')) return blocked(run, actionId, 'safety', 's-exit', 'SAFETY_s-exit', 'blocked_safety_exit', 'off')
    if (!satisfiedSafety.includes('s-lift')) return blocked(run, actionId, 'safety', 's-lift', 'SAFETY_s-lift', 'blocked_safety_lift', 'off')
  } else {
    if (run.motorOn || !run.offProgress.includes('motorOff') || !run.offProgress.includes('liftUp')) return blocked(run, actionId, 'safety', 's-exit', 'SAFETY_s-exit', 'blocked_safety_exit', 'off')
  }
  const offProgress = [...run.offProgress, action]
  let updated = carry(run, { ...run, offProgress, satisfiedSafety, motorOn })
  const sub = appendEvent(updated, { type: 'stepCompleted', stepId: `off:${action}`, actionId })
  if (!sub.ok) return { run: sub.run, outcome: 'eventLimit', reasonCode: 'EVENT_LIMIT', feedbackKey: null }
  updated = sub.run
  if (action !== 'exitVehicle') return { run: updated, outcome: 'completed', reasonCode: null, feedbackKey: null }
  const completedSteps = [...updated.completedSteps, 'off']
  const nextStepId = nextStepOf(updated.task, completedSteps)
  const done = carry(updated, { ...updated, completedSteps, nextStepId, allStepsCompleted: nextStepId === null })
  const ev = appendEvent(done, { type: 'stepCompleted', stepId: 'off', actionId })
  if (!ev.ok) return { run: ev.run, outcome: 'eventLimit', reasonCode: 'EVENT_LIMIT', feedbackKey: null }
  return { run: ev.run, outcome: 'completed', reasonCode: null, feedbackKey: null }
}

export function attempt(run: TaskRun, a: Attempt, actionId: string): AttemptResult {
  if (run.paused) return { run, outcome: 'paused', reasonCode: 'PAUSED', feedbackKey: null }
  if (run.eventLimitReached) return { run, outcome: 'eventLimit', reasonCode: 'EVENT_LIMIT', feedbackKey: null }
  if (a.type === 'step') {
    const step = run.task.steps.find((s) => s.stepId === a.stepId)
    if (!step) return { run, outcome: 'invalid', reasonCode: 'UNKNOWN_STEP', feedbackKey: null }
    return attemptStep(run, step, actionId)
  }
  if (a.type === 'subStep') return attemptOffSubStep(run, a.action, actionId)
  if (a.type === 'confirmSafety') {
    if (!PRECONDITIONS.has(a.conditionId)) return { run, outcome: 'invalid', reasonCode: 'UNKNOWN_CONDITION', feedbackKey: null }
    if (run.satisfiedSafety.includes(a.conditionId)) return { run, outcome: 'confirmed', reasonCode: null, feedbackKey: null }
    return { run: carry(run, { ...run, satisfiedSafety: [...run.satisfiedSafety, a.conditionId] }), outcome: 'confirmed', reasonCode: null, feedbackKey: null }
  }
  const hz = HAZARDS[a.hazardId]
  if (!hz) return { run, outcome: 'invalid', reasonCode: 'UNKNOWN_HAZARD', feedbackKey: null }
  if (hz.whenMotorOn && !run.motorOn) return { run, outcome: 'ignored', reasonCode: null, feedbackKey: null }
  return blocked(run, actionId, 'safety', hz.conditionId, `SAFETY_${hz.conditionId}`, SAFETY_FEEDBACK[hz.conditionId] ?? 'blocked_order')
}

export interface SubmitOutcome extends AttemptResult {
  grading: SubmitResult | null
}

export function submitResponse(run: TaskRun, itemId: string, rawInput: string, actionId: string): SubmitOutcome {
  if (run.paused) return { run, outcome: 'paused', reasonCode: 'PAUSED', feedbackKey: null, grading: null }
  if (run.eventLimitReached) return { run, outcome: 'eventLimit', reasonCode: 'EVENT_LIMIT', feedbackKey: null, grading: null }
  const { sheet, result } = submitAnswer(run.responses, itemId, rawInput)
  if (result.reasonCode === 'EMPTY_INPUT') return { run, outcome: 'ignored', reasonCode: 'EMPTY_INPUT', feedbackKey: null, grading: result }
  if (result.reasonCode) {
    // 형식 오류는 학습 사건으로 기록하되 채점하지 않는다
    const b = blocked(run, actionId, 'error', 'format', result.reasonCode, 'wrong_reading')
    return { ...b, outcome: b.outcome === 'blocked' ? 'invalid' : b.outcome, grading: result }
  }
  const withSheet = carry(run, { ...run, responses: sheet })
  const ev = appendEvent(withSheet, { type: 'answerSubmitted', itemId, actionId, reasonCode: result.correct ? undefined : 'INCORRECT' })
  if (!ev.ok) return { run: ev.run, outcome: 'eventLimit', reasonCode: 'EVENT_LIMIT', feedbackKey: null, grading: result }
  let out = ev.run
  if (result.correct === false) {
    const item = sheet.items.find((i) => i.itemId === itemId)!
    const key = item.kind === 'measurement' ? 'reading' : item.kind === 'calculation' ? 'calc' : 'verdict'
    out = countBlocked(out, actionId, 'error', key)
  }
  const item = sheet.items.find((i) => i.itemId === itemId)!
  const feedbackKey = result.correct ? null : item.kind === 'measurement' ? 'wrong_reading' : item.kind === 'calculation' ? 'wrong_calc' : 'wrong_verdict'
  return { run: out, outcome: 'graded', reasonCode: result.correct ? null : 'INCORRECT', feedbackKey, grading: result }
}

export function requestHint(run: TaskRun, actionId: string): AttemptResult {
  if (run.paused) return { run, outcome: 'paused', reasonCode: 'PAUSED', feedbackKey: null }
  if (run.eventLimitReached) return { run, outcome: 'eventLimit', reasonCode: 'EVENT_LIMIT', feedbackKey: null }
  const ev = appendEvent(run, { type: 'hintRequested', actionId, stepId: run.nextStepId ?? undefined })
  if (!ev.ok) return { run: ev.run, outcome: 'eventLimit', reasonCode: 'EVENT_LIMIT', feedbackKey: null }
  return { run: carry(ev.run, { ...ev.run, hintCount: ev.run.hintCount + 1 }), outcome: 'confirmed', reasonCode: null, feedbackKey: null }
}

/** 실제 화면에 피드백이 표시된 직후 UI가 호출한다. 읽음 증거가 아니다. */
export function markFeedbackShown(run: TaskRun, kind: NonNullable<StepEvent['feedbackKind']>, feedbackKey: string, itemId?: string): AttemptResult {
  const ev = appendEvent(run, { type: 'feedbackShown', feedbackKind: kind, feedbackKey, itemId })
  return { run: ev.run, outcome: ev.ok ? 'confirmed' : 'eventLimit', reasonCode: ev.ok ? null : 'EVENT_LIMIT', feedbackKey: null }
}

// ---------- 일시중지·재개·직렬화 (활성 학습시간 보존) ----------
// 원칙(04 §7 timing, 02 §8): 숨김·새로고침 공백은 학습시간에 넣지 않는다. 복원 시 모터 같은 순간 장비 상태는 안전한 정지 상태로 되돌린다.

export function pauseRun(run: TaskRun, reason: 'hidden' | 'manual'): AttemptResult {
  if (run.paused) return { run, outcome: 'ignored', reasonCode: 'ALREADY_PAUSED', feedbackKey: null }
  const ev = appendEvent(run, { type: 'paused', reasonCode: reason })
  const now = depsOf(run).now()
  return { run: carry(ev.run, { ...ev.run, paused: true, pausedAtMs: now, pauseCount: ev.run.pauseCount + 1 }), outcome: 'confirmed', reasonCode: null, feedbackKey: null }
}

export function resumeRun(run: TaskRun, reason: 'visible' | 'manual' | 'restored'): AttemptResult {
  if (!run.paused) return { run, outcome: 'ignored', reasonCode: 'NOT_PAUSED', feedbackKey: null }
  const now = depsOf(run).now()
  const gap = run.pausedAtMs === null ? 0 : Math.max(0, now - run.pausedAtMs)
  // 시작 기준점을 숨긴 시간만큼 뒤로 밀어 경과시간이 이어지게 한다
  const shifted = carry(run, { ...run, paused: false, pausedAtMs: null, startedAtMs: run.startedAtMs + gap, resumeCount: run.resumeCount + 1, timeQuality: run.timeQuality === 'uncertain' ? 'uncertain' : 'resumed' })
  const ev = appendEvent(shifted, { type: 'resumed', reasonCode: reason })
  return { run: ev.run, outcome: 'confirmed', reasonCode: null, feedbackKey: null }
}

/** 저장용 스냅샷: 모두 평범한 JSON 값이다(시계·ID 생성기는 들어 있지 않다). */
export type RunSnapshot = Omit<TaskRun, 'startedAtMs' | 'pausedAtMs'> & { lastElapsedMs: number; snapshotVersion: 1; /** 저장 시점 벽시계(ms). 복원 때 시계가 뒤로 갔는지 판단(Codex C-P2-1) */ serializedAtWallMs?: number }

export function serializeRun(run: TaskRun): RunSnapshot {
  const { startedAtMs: _s, pausedAtMs: _p, ...rest } = run
  const lastElapsedMs = run.events.length ? run.events[run.events.length - 1]!.elapsedMs : 0
  return { ...rest, lastElapsedMs, snapshotVersion: 1, serializedAtWallMs: depsOf(run).now() }
}

/** 새로고침·재시작 뒤 복원. 경과시간은 마지막 이벤트에서 이어 가고, 복원 이벤트와 resumeCount를 남긴다. */
export function rehydrateRun(snap: RunSnapshot, deps: EngineDeps = defaultDeps()): TaskRun {
  const { lastElapsedMs, snapshotVersion: _v, serializedAtWallMs, ...rest } = snap
  const now = deps.now()
  // 저장 시각보다 이른 벽시계로 복원되면 시계를 신뢰할 수 없다 → uncertain (04 §7, Codex C-P2-1)
  // 저장 시각 근거가 없는 옛 초안은 시계를 신뢰할 수 없으므로 보수적으로 uncertain (Codex D C-P2-1)
  const noWallClock = typeof serializedAtWallMs !== 'number'
  const clockWentBack = !noWallClock && now < serializedAtWallMs
  const timeQuality: TaskRun['timeQuality'] = rest.timeQuality === 'uncertain' || clockWentBack || noWallClock ? 'uncertain' : 'resumed'
  const base: TaskRun = { ...rest, offProgress: rest.offProgress ?? [], startedAtMs: now - lastElapsedMs, pausedAtMs: null, paused: false, motorOn: false, resumeCount: rest.resumeCount + 1, timeQuality }
  depsByRun.set(base, deps)
  return appendEvent(base, { type: 'resumed', reasonCode: 'restored' }).run
}

/** 3D ↔ 도식 전환. 시작 모드는 기록의 displayMode로 남고, 여기서는 경험 모드 목록과 전환 이벤트를 남긴다. */
export function changeDisplayMode(run: TaskRun, to: DisplayMode, reason: 'userChoice' | 'webglUnavailable' | 'performance'): AttemptResult {
  if (run.displayMode === to) return { run, outcome: 'ignored', reasonCode: 'SAME_MODE', feedbackKey: null }
  const ev = appendEvent(run, { type: 'displayModeChanged', fromDisplayMode: run.displayMode, toDisplayMode: to, reasonCode: reason })
  if (!ev.ok) return { run: ev.run, outcome: 'eventLimit', reasonCode: 'EVENT_LIMIT', feedbackKey: null }
  const experienced = ev.run.experiencedDisplayModes.includes(to) ? ev.run.experiencedDisplayModes : [...ev.run.experiencedDisplayModes, to]
  return { run: carry(ev.run, { ...ev.run, displayMode: to, experiencedDisplayModes: experienced }), outcome: 'confirmed', reasonCode: null, feedbackKey: null }
}
