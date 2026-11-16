// src/app/debrief.ts
// 정리 화면(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 1-3·1-4·1-5)의 순수 로직.
// - 교관의 정리: 고정 틀에 항목 이름·횟수만 끼운다. 사례의 측정값·계산 기준값·정답 판정·학생이 넣은 값은 넣지 않는다.
// - 오늘 쓴 공식과 규정값: 과제 자료의 feedback.wrong_calc.why·wrong_verdict.why 그대로(사례 값 없음).
// - 30초 잠금: 남은 초 계산과 타이머(가짜 타이머로 시험).
// - AI 정리(2단계, 설계 2-4): 부르는 조건, 보내는 사실(정오는 불리언만), 8초 기다림과 결정(한번 보인 글은 바꾸지 않음), 빈 묶음 고정 문장.
// 기록(payload)에는 아무것도 더하지 않는다. 채점·기록 로직은 읽기만 한다.
import { answerFeedbackAllowed } from '../domain/feedbackPolicy'
import { summarizeResponses, type ResponseSummary } from '../domain/grading'
import type { DifficultyMode, TaskRun } from '../domain/taskEngine'
import type { ApprovedTask } from '../domain/types'
import { COUNT_LABEL, countLabel, itemLabel } from './resultLabels'
import { DEBRIEF_WAIT_MS, type DebriefAiNotes, type DebriefRequestFacts } from '../chat/debriefClient'

export interface DebriefInput {
  /** 응답 요약 — 정오(✓✗)만 읽는다. 값 칸(제시값·기준값·입력값)은 읽지 않는다 */
  summary: ResponseSummary
  errorTypes: Record<string, number>
  safetyViolationCount: number
  safetyViolationTypes: Record<string, number>
  hintCount: number
  npcInspectionCount: number
  completionStatus: 'completed' | 'aborted'
  difficultyMode: DifficultyMode
  /** 정답 관련 정리를 보여도 되는가(검사 통과면 늘 참, 중단이면 answerFeedbackAllowed) */
  answersOpen: boolean
}

export interface DebriefNotes { good: string[]; improve: string[]; hard: string[]; withheld: boolean }

export interface DebriefFact { label: '공식' | '판정 기준'; text: string }

/** 안내 없음 중단에서 공식·규정값과 정오 문장 대신 보이는 한 줄(설계 1-5) */
export const DEBRIEF_WITHHELD_LINE = '과제를 끝까지 마치면 공식과 규정값을 볼 수 있어요.'

/** 정답에 기대는 오류 유형(판독·계산·판정). 가림일 때 '가장 자주 막힌 곳'에서 뺀다 */
const ANSWER_ERROR_KEYS = new Set(['reading', 'calc', 'verdict'])
/** 같은 횟수면 이 순서로 고른다(같은 입력이면 같은 출력) */
const ERROR_ORDER = ['order', 'format', 'reading', 'calc', 'verdict']

const EMPTY = {
  good: '다음에 다시 해 보면 잘한 점이 더 보일 거예요.',
  improve: '이번 수행에서 보완할 점은 없었어요.',
  hard: '크게 막힌 곳은 없었어요.',
}

/** 받침이 있으면 a, 없으면 b(한글이 아니면 b) */
function josa(word: string, a: string, b: string): string {
  const c = word.charCodeAt(word.length - 1)
  if (c < 0xac00 || c > 0xd7a3) return b
  return (c - 0xac00) % 28 ? a : b
}

export function debriefInputOf(run: TaskRun, completionStatus: 'completed' | 'aborted'): DebriefInput {
  return {
    summary: summarizeResponses(run.responses),
    errorTypes: run.errorTypes,
    safetyViolationCount: run.safetyViolationCount,
    safetyViolationTypes: run.safetyViolationTypes,
    hintCount: run.hintCount,
    npcInspectionCount: run.npcInspectionCount,
    completionStatus,
    difficultyMode: run.difficultyMode,
    answersOpen: completionStatus === 'completed' || answerFeedbackAllowed(run),
  }
}

export function debriefNotes(i: DebriefInput): DebriefNotes {
  const s = i.summary
  const completed = i.completionStatus === 'completed'
  const withheld = !i.answersOpen
  const groups: Array<{ name: string; items: Array<{ itemId: string; firstCorrect: boolean | null; finalCorrect: boolean | null }> }> = [
    { name: '판독', items: s.measurementInputs },
    { name: '계산', items: s.calculationAnswers },
    { name: '판정', items: s.judgmentAnswers },
  ]
  const allItems = groups.flatMap((g) => g.items)
  const good: string[] = []
  const improve: string[] = []
  const hard: string[] = []

  if (!withheld) {
    const perfect = groups.filter((g) => g.items.length > 0 && g.items.every((x) => x.firstCorrect === true))
    if (perfect.length === groups.length) good.push('판독·계산·판정을 처음부터 모두 맞혔어요.')
    else for (const g of perfect) good.push(`${g.name}${josa(g.name, '을', '를')} 처음부터 모두 맞혔어요.`)
  }
  // 통과한 수행에서만(받자마자 중단해도 칭찬하지 않게)
  if (completed && i.safetyViolationCount === 0) good.push('안전 수칙을 한 번도 어기지 않았어요.')
  if (completed && i.npcInspectionCount === 1) good.push('검사를 한 번에 통과했어요.')
  if (completed && i.hintCount === 0) good.push('힌트 없이 끝까지 해냈어요.')

  if (!withheld) {
    const fixed = allItems.filter((x) => x.firstCorrect === false && x.finalCorrect === true).map((x) => itemLabel(x.itemId))
    if (fixed.length) improve.push(`처음에 틀렸다가 고친 항목이 있어요: ${fixed.join(', ')}.`)
    const wrong = allItems.filter((x) => x.finalCorrect === false).map((x) => itemLabel(x.itemId))
    if (wrong.length) improve.push(`끝까지 맞히지 못한 항목이 있어요: ${wrong.join(', ')}.`)
  }
  const safety = Object.entries(i.safetyViolationTypes).filter(([, v]) => v > 0)
  if (safety.length) improve.push(`안전 수칙을 놓친 곳이 있어요: ${safety.map(([k, v]) => `${countLabel(k)} ${v}번`).join(', ')}.`)
  const order = i.errorTypes.order ?? 0
  if (order > 0) improve.push(`작업 순서가 ${order}번 어긋났어요.`)
  if (!completed) improve.push('과제를 끝까지 마치지 못했어요.')

  const errs = Object.entries(i.errorTypes)
    .filter(([k, v]) => v > 0 && !(withheld && ANSWER_ERROR_KEYS.has(k)))
    .sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]))
  const top = errs[0]
  if (top) { const name = countLabel(top[0]); hard.push(`가장 자주 막힌 곳은 ${name}${josa(name, '이었어요', '였어요')}(${top[1]}번).`) }
  if (i.hintCount > 0) hard.push(`힌트를 ${i.hintCount}번 썼어요.`)
  if (i.npcInspectionCount >= 2) hard.push(`검사를 ${i.npcInspectionCount}번 받았어요.`)

  return {
    good: good.length ? good : [EMPTY.good],
    improve: improve.length ? improve : [EMPTY.improve],
    hard: hard.length ? hard : [EMPTY.hard],
    withheld,
  }
}

function rank(k: string): number {
  const r = ERROR_ORDER.indexOf(k)
  return r < 0 ? ERROR_ORDER.length : r
}

/** 오늘 쓴 공식과 규정값(설계 1-4): 과제 자료의 학교 승인 문구 그대로. 사례 값(measurement·caseId)은 읽지 않는다 */
export function debriefFacts(task: Pick<ApprovedTask, 'feedback'>): DebriefFact[] {
  const out: DebriefFact[] = []
  const calc = task.feedback.wrong_calc?.why
  const verdict = task.feedback.wrong_verdict?.why
  if (calc) out.push({ label: '공식', text: calc })
  if (verdict) out.push({ label: '판정 기준', text: verdict })
  return out
}

/** 정리 위의 짧은 수치 줄(설계 1-2 남기는 수치).
 *  withheld(안내 없음 중단 가림)면 학습 오류 수를 뺀다 — 판독·계산·판정 오답이 더해진 수라 숫자만으로 오답 수가 드러난다 */
export function debriefStats(run: Pick<TaskRun, 'errorCount' | 'safetyViolationCount' | 'hintCount' | 'npcInspectionCount'>, durationSeconds: number | null, opts: { withheld?: boolean } = {}): string[] {
  return [
    `걸린 시간 ${durationText(durationSeconds)}`,
    ...(opts.withheld ? [] : [`학습 오류 ${run.errorCount}번`]),
    `안전 위반 ${run.safetyViolationCount}번`,
    `힌트 ${run.hintCount}번`,
    `검사 ${run.npcInspectionCount}번`,
  ]
}

/** 정리 화면의 마치기(D4): 확정 저장이 안 됐으면 첫 누름은 확인을 묻고(confirm), 확인한 뒤에는 넘어간다(leave) */
export function endStep(s: { unsaved: boolean; confirmed: boolean }): 'confirm' | 'leave' {
  return s.unsaved && !s.confirmed ? 'confirm' : 'leave'
}

function durationText(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '—'
  const t = Math.max(0, Math.round(sec))
  const m = Math.floor(t / 60)
  return m ? `${m}분 ${t % 60}초` : `${t}초`
}

/** 정리 화면 단추가 잠겨 있는 시간(모든 세션·조건에 같다) */
export const DEBRIEF_LOCK_SECONDS = 30

/** 화면이 뜬 시각(startMs)에서 지금(nowMs)까지 — 단추가 풀릴 때까지 남은 초(올림, 0 이상) */
export function lockLeft(startMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((startMs + DEBRIEF_LOCK_SECONDS * 1000 - nowMs) / 1000))
}

/** 남은 초가 바뀔 때마다 onLeft를 부르고 0이 되면 스스로 멈춘다. 돌려준 함수로 멈출 수 있다.
 *  시계는 뒤로 가지 않는 performance.now(기기 시계를 바꿔도 30초가 늘거나 줄지 않음). 탭이 가려진 동안에도 시간은 흐른다 */
export function startLockTimer(startMs: number, onLeft: (secondsLeft: number) => void, now: () => number = () => performance.now()): () => void {
  let last = lockLeft(startMs, now())
  if (last === 0) return () => {}
  const id = setInterval(() => {
    const left = lockLeft(startMs, now())
    if (left === last) return
    last = left
    onLeft(left)
    if (left === 0) clearInterval(id)
  }, 250)
  return () => clearInterval(id)
}

// ---------- AI 정리(2단계, 설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2-4) ----------

/** AI 글일 때 '교관의 정리' 제목 옆에 늘 보이는 표시 */
export const DEBRIEF_AI_LABEL = 'AI 교관이 쓴 글이에요(사람 아님).'
/** AI 글을 기다리는 동안(최대 8초) 묶음 자리에 보이는 한 줄 */
export const DEBRIEF_WAITING_LINE = '교관이 정리를 쓰고 있어요…'

const COUNT_MAX = 999
const DURATION_MAX_SECONDS = 86_400
const ERROR_KEYS = Object.keys(COUNT_LABEL).filter((k) => !k.startsWith('s-'))
const SAFETY_KEYS = Object.keys(COUNT_LABEL).filter((k) => k.startsWith('s-'))
const clampCount = (n: number): number => Math.min(COUNT_MAX, Math.max(0, Math.floor(n)))
/** 알려진 키·1번 이상만, 999에서 자른다(서버 허용 목록과 같은 이름표에서 온 키) */
function knownCounts(m: Record<string, number>, keys: string[]): Record<string, number> {
  return Object.fromEntries(keys.filter((k) => Number.isFinite(m[k]) && (m[k] ?? 0) > 0).map((k) => [k, clampCount(m[k]!)]))
}

/** 서버로 보낼 수행 사실. 항목은 정오(불리언)만 — 학생이 넣은 값·제시값·기준값은 읽지 않는다. 시간은 정수 초(모르거나 하루를 넘으면 null) */
export function debriefRequestFacts(run: Pick<TaskRun, 'responses' | 'errorTypes' | 'safetyViolationTypes' | 'hintCount' | 'npcInspectionCount'>, durationSeconds: number | null): DebriefRequestFacts {
  const s = summarizeResponses(run.responses)
  const items = [...s.measurementInputs, ...s.calculationAnswers, ...s.judgmentAnswers].map((i) => ({ itemId: i.itemId, first: i.firstCorrect, final: i.finalCorrect }))
  const d = durationSeconds !== null && Number.isFinite(durationSeconds) ? Math.max(0, Math.round(durationSeconds)) : null
  return {
    items,
    errorTypes: knownCounts(run.errorTypes, ERROR_KEYS),
    safetyViolationTypes: knownCounts(run.safetyViolationTypes, SAFETY_KEYS),
    hintCount: clampCount(run.hintCount),
    npcInspectionCount: clampCount(run.npcInspectionCount),
    durationSeconds: d !== null && d <= DURATION_MAX_SECONDS ? d : null,
  }
}

/** 정리 화면이 AI 정리를 부르는가: 검사 통과한 수행, 기록 모드, 대화 주소, 확정 기록의 수행 번호, 온라인이 모두 있을 때만 */
export function shouldAskDebrief(o: { completionStatus: 'completed' | 'aborted'; noRecord: boolean; endpoint: string | null; recordId: string | null; online: boolean }): boolean {
  return o.completionStatus === 'completed' && !o.noRecord && !!o.endpoint && !!o.recordId && o.online
}

/** 교관의 정리 칸의 상태: 기다리는 중 → AI 글 또는 규칙 정리(한번 정해지면 바뀌지 않는다) */
export type DebriefView = { kind: 'waiting' } | { kind: 'ai'; notes: DebriefNotes } | { kind: 'rule' }
export type DebriefEvent = { type: 'answer'; notes: DebriefAiNotes } | { type: 'fail' } | { type: 'timeout' }

/** 기다리는 중에만 정해진다. 이미 AI 글이나 규칙 정리가 보이면 늦게 온 답·실패·시간 끝을 무시한다 */
export function settleDebrief(view: DebriefView, e: DebriefEvent): DebriefView {
  if (view.kind !== 'waiting') return view
  return e.type === 'answer' ? { kind: 'ai', notes: aiDebriefNotes(e.notes) } : { kind: 'rule' }
}

/** 화면이 뜬 시각(shownAtMs)에서 지금까지 — AI 글을 더 기다릴 시간(ms, 0 이상). 다시 그려져도 처음부터 세지 않는다 */
export function debriefWaitLeft(shownAtMs: number, nowMs: number): number {
  return Math.max(0, shownAtMs + DEBRIEF_WAIT_MS - nowMs)
}

/** AI 글을 화면 모양으로: 빈 묶음은 규칙 정리와 같은 고정 문장. AI는 검사 통과한 수행만 쓰므로 가림이 없다 */
export function aiDebriefNotes(n: DebriefAiNotes): DebriefNotes {
  return {
    good: n.good.length ? [...n.good] : [EMPTY.good],
    improve: n.improve.length ? [...n.improve] : [EMPTY.improve],
    hard: n.hard.length ? [...n.hard] : [EMPTY.hard],
    withheld: false,
  }
}
