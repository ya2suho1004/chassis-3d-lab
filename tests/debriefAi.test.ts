// tests/debriefAi.test.ts — 정리 화면의 AI 정리(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2-4)
// 부르는 조건, 보내는 사실(정오는 불리언만, 값 없음), 8초 기다림과 규칙 정리, 늦게 온 답 무시, 같은 수행에 한 번, AI 표시, 빈 묶음.
// 화면 시험 도구(jsdom)가 없어 그리기는 renderToStaticMarkup, 타이머 배선은 소스로 고정한다(1단계와 같은 방식).
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  aiDebriefNotes, debriefNotes, debriefInputOf, debriefRequestFacts, debriefWaitLeft, settleDebrief, shouldAskDebrief,
  DEBRIEF_AI_LABEL, DEBRIEF_WAITING_LINE, type DebriefView,
} from '../src/app/debrief'
import { askDebrief, askDebriefOnce, buildDebriefBody, forgetDebriefAsks, parseDebriefResponse, DEBRIEF_WAIT_MS, type DebriefAsk } from '../src/chat/debriefClient'
import { DebriefNotesCard, ResultScreen } from '../src/screens/ResultScreen'
import { createDemoSession, listTasks } from '../src/app/session'
import { createTaskRun, submitResponse } from '../src/domain/taskEngine'
import { buildRecordPayload } from '../src/domain/record'
import type { DeliveryEnvelope } from '../src/records/types'
import { parseDebriefRequest } from '../supabase/functions/_shared/chat/debriefCore'
import labels from '../supabase/functions/_shared/chat/debriefContext.generated.json'

const read = (p: string) => fs.readFileSync(p, 'utf8')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const tasks = listTasks()
const task = tasks.find((t) => t.taskId === 'braking-force')!
const turn = tasks.find((t) => t.taskId === 'min-turning-radius')!
const session = createDemoSession({ studentCode: 'D-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', task, difficultyMode: 'unguided' })
const env: DeliveryEnvelope = { recordId: session.recordId, localSaveStatus: 'saved', uploadStatus: 'pending', uploadedAt: null, receiptId: null, payloadHash: null, uploadAttemptCount: 0, lastErrorCode: null, nextRetryAt: null }
let n = 0
const run = (answers: Record<string, string> = { left: '241', right: '200', axleWeight: '600', deviation: '6.6', sum: '73.3', vehicleCondition: 'pass' }, t = task) => {
  let r = createTaskRun(t, { difficultyMode: 'unguided' })
  for (const [k, v] of Object.entries(answers)) r = submitResponse(r, k, v, `a${++n}`).run
  return { ...r, npcInspectionCount: 2, hintCount: 1, safetyViolationTypes: { 's-ppe': 1 }, safetyViolationCount: 1 }
}

describe('보내는 사실(facts)', () => {
  test('항목 정오는 불리언만, 값(학생 입력·사례 값)은 없다', () => {
    const f = debriefRequestFacts(run(), 400.4)
    expect(f.items).toEqual([
      { itemId: 'left', first: false, final: false }, { itemId: 'right', first: true, final: true }, { itemId: 'axleWeight', first: true, final: true },
      { itemId: 'deviation', first: true, final: true }, { itemId: 'sum', first: true, final: true }, { itemId: 'vehicleCondition', first: true, final: true },
    ])
    expect(f).toMatchObject({ errorTypes: { reading: 1 }, safetyViolationTypes: { 's-ppe': 1 }, hintCount: 1, npcInspectionCount: 2, durationSeconds: 400 })
    const s = JSON.stringify(f)
    for (const v of ['241', '240', '200', '600', '6.6', '73.3', 'pass', 'fail', '양호', '불량', 'case-']) expect(s).not.toContain(v)
  })
  test('답하지 않은 항목은 null, 모르는 키·0번은 빼고 횟수는 999에서 자르며, 시간은 정수 초(모르면 null)', () => {
    const r = { ...run({ left: '240' }), errorTypes: { reading: 0, calc: 1500, 이상한키: 2 }, safetyViolationTypes: { 's-ppe': 2, 's-zzz': 1 }, hintCount: 2000 }
    const f = debriefRequestFacts(r, null)
    expect(f.items.find((i) => i.itemId === 'sum')).toEqual({ itemId: 'sum', first: null, final: null })
    expect(f).toMatchObject({ errorTypes: { calc: 999 }, safetyViolationTypes: { 's-ppe': 2 }, hintCount: 999, durationSeconds: null })
    expect(debriefRequestFacts(r, Number.NaN).durationSeconds).toBeNull()
    expect(debriefRequestFacts(r, 90000).durationSeconds).toBeNull()
  })
  test('만든 요청은 서버의 허용 목록 검사를 통과한다(두 과제)', () => {
    for (const [t, ans] of [[task, undefined], [turn, { leftAngle: '35', rightAngle: '30', radius: '5.5', vehicleCondition: 'pass' }]] as const) {
      const body = buildDebriefBody({ sessionCode: 'DEMO-ONLY', anonymousStudentCode: 'D-01', recordId: '0d9c8b7a-6f5e-4d3c-8b2a-1f0e9d8c7b6a', taskId: t.taskId, difficultyMode: 'unguided', facts: debriefRequestFacts(run(ans as any, t), 61) })
      expect(parseDebriefRequest('text/plain', body, labels), t.taskId).not.toBeNull()
    }
  })
})

describe('부르는 조건', () => {
  const base = { completionStatus: 'completed' as const, noRecord: false, endpoint: 'https://x.supabase.co/functions/v1/chat', recordId: 'rec-1', online: true, saved: true }
  test('검사 통과·기록 모드·대화 주소·확정 기록 번호·저장됨·온라인이 모두 있을 때만', () => {
    expect(shouldAskDebrief(base)).toBe(true)
    expect(shouldAskDebrief({ ...base, completionStatus: 'aborted' })).toBe(false)
    expect(shouldAskDebrief({ ...base, noRecord: true })).toBe(false)
    expect(shouldAskDebrief({ ...base, endpoint: null })).toBe(false)
    expect(shouldAskDebrief({ ...base, recordId: null })).toBe(false)
    expect(shouldAskDebrief({ ...base, online: false })).toBe(false)
    // 확정 저장에 실패했으면 부르지 않는다(다시 저장에 성공해도 그 화면에서는 규칙 정리 그대로)
    expect(shouldAskDebrief({ ...base, saved: false })).toBe(false)
  })
})

describe('기다림과 결정(한번 보인 글은 바꾸지 않는다)', () => {
  const notes = { good: ['좋았어요.'], improve: [], hard: [] }
  test('기다리는 중에 답이 오면 AI 글, 실패·8초가 먼저면 규칙 정리', () => {
    expect(settleDebrief({ kind: 'waiting' }, { type: 'answer', notes })).toEqual({ kind: 'ai', notes: aiDebriefNotes(notes) })
    expect(settleDebrief({ kind: 'waiting' }, { type: 'fail' })).toEqual({ kind: 'rule' })
    expect(settleDebrief({ kind: 'waiting' }, { type: 'timeout' })).toEqual({ kind: 'rule' })
  })
  test('늦게 온 답·늦은 실패는 무시한다', () => {
    const rule: DebriefView = { kind: 'rule' }
    expect(settleDebrief(rule, { type: 'answer', notes })).toBe(rule)
    const ai = settleDebrief({ kind: 'waiting' }, { type: 'answer', notes })
    expect(settleDebrief(ai, { type: 'timeout' })).toBe(ai)
    expect(settleDebrief(ai, { type: 'fail' })).toBe(ai)
    expect(settleDebrief(ai, { type: 'answer', notes: { good: ['다른 글'], improve: [], hard: [] } })).toBe(ai)
  })
  test('8초는 화면이 뜬 때부터(다시 그려져도 남은 시간만)', () => {
    expect(DEBRIEF_WAIT_MS).toBe(8000)
    expect(debriefWaitLeft(1000, 1000)).toBe(8000)
    expect(debriefWaitLeft(1000, 6000)).toBe(3000)
    expect(debriefWaitLeft(1000, 20000)).toBe(0)
  })
  test('빈 묶음은 지금의 고정 문장으로', () => {
    const empty = aiDebriefNotes({ good: [], improve: [], hard: [] })
    expect(empty).toEqual({ good: ['다음에 다시 해 보면 잘한 점이 더 보일 거예요.'], improve: ['이번 수행에서 보완할 점은 없었어요.'], hard: ['크게 막힌 곳은 없었어요.'], withheld: false })
    expect(aiDebriefNotes(notes)).toEqual({ good: ['좋았어요.'], improve: ['이번 수행에서 보완할 점은 없었어요.'], hard: ['크게 막힌 곳은 없었어요.'], withheld: false })
  })
})

describe('정리 요청 보내기(debriefClient)', () => {
  const ask: DebriefAsk = { sessionCode: 'DEMO-ONLY', anonymousStudentCode: 'D-01', recordId: 'rec-1', taskId: 'braking-force', difficultyMode: 'guided', facts: debriefRequestFacts(run(), 10) }
  afterEach(() => { forgetDebriefAsks(); vi.useRealTimers() })
  test('본문은 debrief-1, 정해진 키만', () => {
    const v = JSON.parse(buildDebriefBody(ask))
    expect(Object.keys(v).sort()).toEqual(['anonymousStudentCode', 'difficultyMode', 'facts', 'protocolVersion', 'recordId', 'sessionCode', 'taskId'])
    expect(v.protocolVersion).toBe('debrief-1')
  })
  test('응답 읽기: 정상·실패·모양이 틀리면 INVALID_RESPONSE', () => {
    const notes = { good: ['가.'], improve: [], hard: ['나.'] }
    expect(parseDebriefResponse(JSON.stringify({ protocolVersion: 'debrief-1', ok: true, notes, logged: true, chatId: 'c', reused: false }))).toEqual({ ok: true, notes, reused: false })
    expect(parseDebriefResponse(JSON.stringify({ protocolVersion: 'debrief-1', ok: false, code: 'LIMIT_STUDENT', retryable: false }))).toEqual({ ok: false, code: 'LIMIT_STUDENT' })
    // 옛 서버(대화만 앎)는 chat-1 INVALID_REQUEST로 답한다 → 실패로 읽어 규칙 정리
    expect(parseDebriefResponse(JSON.stringify({ protocolVersion: 'chat-1', ok: false, code: 'INVALID_REQUEST', retryable: false }))).toEqual({ ok: false, code: 'INVALID_REQUEST' })
    for (const bad of ['', '{x', JSON.stringify({ protocolVersion: 'chat-1', ok: true, answer: '답' }), JSON.stringify({ protocolVersion: 'debrief-1', ok: true, notes: { good: 'x', improve: [], hard: [] } }),
      JSON.stringify({ protocolVersion: 'debrief-1', ok: true, notes: { good: ['a', 'b', 'c', 'd'], improve: [], hard: [] } }), JSON.stringify({ protocolVersion: 'debrief-1', ok: true, notes: { good: ['가'.repeat(121)], improve: [], hard: [] } })]) {
      expect(parseDebriefResponse(bad), bad).toEqual({ ok: false, code: 'INVALID_RESPONSE' })
    }
  })
  test('text/plain으로 보내고(사전 확인 요청 없음) 끊기면 NETWORK', async () => {
    let seen: any
    const res = await askDebrief('https://e', ask, (async (u: string, init: any) => { seen = { u, init }; return new Response(JSON.stringify({ protocolVersion: 'debrief-1', ok: true, notes: { good: [], improve: [], hard: [] }, logged: true, chatId: null, reused: true })) }) as any)
    expect(res).toEqual({ ok: true, notes: { good: [], improve: [], hard: [] }, reused: true })
    expect(seen.init).toMatchObject({ method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=UTF-8' } })
    expect(await askDebrief('https://e', ask, (async () => { throw new TypeError('x') }) as any)).toEqual({ ok: false, code: 'NETWORK' })
  })
  test('8초가 지나면 요청을 끊고 TIMEOUT', async () => {
    vi.useFakeTimers()
    let aborted = false
    const p = askDebrief('https://e', ask, ((_u: string, init: any) => new Promise((_r, rej) => { init.signal.addEventListener('abort', () => { aborted = true; rej(new Error('abort')) }) })) as any)
    await vi.advanceTimersByTimeAsync(DEBRIEF_WAIT_MS)
    expect(await p).toEqual({ ok: false, code: 'TIMEOUT' })
    expect(aborted).toBe(true)
  })
  test('같은 수행 번호에는 한 번만 부른다(다시 그려지거나 두 번 마운트돼도 같은 답을 기다린다)', async () => {
    const start = vi.fn(async () => ({ ok: true as const, notes: { good: [], improve: [], hard: [] }, reused: false }))
    const a = askDebriefOnce('rec-1', start)
    const b = askDebriefOnce('rec-1', start)
    expect(a).toBe(b)
    await askDebriefOnce('rec-2', start)
    expect(start).toHaveBeenCalledTimes(2)
  })
})

describe('정리 화면 — AI 정리 그리기', () => {
  const ruleNotes = debriefNotes(debriefInputOf(run(), 'completed'))
  const card = (view: DebriefView) => text(renderToStaticMarkup(createElement(DebriefNotesCard, { view, ruleNotes, stats: ['걸린 시간 1분 0초', '힌트 1번'] })))
  test('기다리는 동안: "교관이 정리를 쓰고 있어요…"(묶음·AI 표시 없음), 수치 줄은 그대로', () => {
    const t = card({ kind: 'waiting' })
    expect(DEBRIEF_WAITING_LINE).toBe('교관이 정리를 쓰고 있어요…')
    expect(t).toContain(DEBRIEF_WAITING_LINE)
    expect(t).toContain('걸린 시간 1분 0초 · 힌트 1번')
    expect(t).not.toContain('잘한 점')
    expect(t).not.toContain(DEBRIEF_AI_LABEL)
  })
  test('AI 글: 제목 옆에 "AI 교관이 쓴 글이에요(사람 아님)."와 AI가 쓴 세 묶음, 빈 묶음은 고정 문장', () => {
    const t = card({ kind: 'ai', notes: aiDebriefNotes({ good: ['좌 제동력을 다시 확인해 보세요.'], improve: [], hard: ['판독이 어려웠던 것 같아요.'] }) })
    expect(DEBRIEF_AI_LABEL).toBe('AI 교관이 쓴 글이에요(사람 아님).')
    expect(t).toMatch(/교관의 정리 AI 교관이 쓴 글이에요\(사람 아님\)\./)
    expect(t).toContain('좌 제동력을 다시 확인해 보세요.')
    expect(t).toContain('이번 수행에서 보완할 점은 없었어요.')
    expect(t).toContain('판독이 어려웠던 것 같아요.')
    for (const l of ruleNotes.good) expect(t).not.toContain(l)
  })
  test('규칙 정리: AI 표시 없이 지금 글 그대로', () => {
    const t = card({ kind: 'rule' })
    expect(t).not.toContain(DEBRIEF_AI_LABEL)
    for (const l of [...ruleNotes.good, ...ruleNotes.improve, ...ruleNotes.hard]) expect(t).toContain(l)
  })
  // 검사 통과 사건 없이 만든 수행이라 확정 원본은 중단으로 만든다(화면이 쓰는 것은 수행 번호뿐)
  const frozen = (r = run()) => buildRecordPayload(r, session, { completedAtIso: new Date().toISOString(), completionStatus: 'aborted' })
  const screen = (p: Record<string, unknown>) => text(renderToStaticMarkup(createElement(ResultScreen, { session, run: run(), completionStatus: 'completed', envelope: env, saveError: null, onToLab: () => {}, onEnd: () => {}, ...p })))
  test('대화 주소가 있고 부를 조건이면 처음엔 기다림, 주소가 없거나 조건이 아니면 처음부터 규칙 정리', () => {
    const r = run()
    expect(screen({ run: r, frozenPayload: frozen(r), chatEndpoint: 'https://e' })).toContain(DEBRIEF_WAITING_LINE)
    for (const p of [{ frozenPayload: frozen(r), chatEndpoint: 'https://e', envelope: null, saveError: 'QUOTA' }, { frozenPayload: frozen(r), chatEndpoint: null }, { frozenPayload: frozen(r), chatEndpoint: 'https://e', noRecord: true, envelope: null }, { frozenPayload: null, chatEndpoint: 'https://e' }, { frozenPayload: frozen(r), chatEndpoint: 'https://e', completionStatus: 'aborted' }]) {
      const t = screen({ run: r, ...p })
      expect(t, JSON.stringify(Object.keys(p))).not.toContain(DEBRIEF_WAITING_LINE)
      expect(t).toContain('잘한 점')
    }
  })
  test('배선: 화면이 뜰 때 한 번(같은 수행 번호에 한 번) 부르고, 남은 기다림만큼 타이머를 걸며, 떠날 때 멈춘다. AI 글은 기록·저장에 넣지 않는다', () => {
    const src = read('src/screens/ResultScreen.tsx')
    expect(src).toMatch(/askDebriefOnce\(recordId, \(\) => askDebrief\(/)
    expect(src).toMatch(/setTimeout\(\(\) => settle\(\{ type: 'timeout' \}\), debriefWaitLeft\(shownAt, performance\.now\(\)\)\)/)
    expect(src).toMatch(/return \(\) => \{ live = false; clearTimeout\(t\) \}/)
    expect(src).toContain('const [shownAt] = useState(() => performance.now())')
    expect(src).toMatch(/shouldAskDebrief\(\{[^}]*saved: !saveError/)
    // AI 글(view)은 화면 상태뿐: 저장소·기록 만들기·전송으로 가지 않는다
    expect(src).not.toMatch(/saveDraft|freeze|outbox|localStorage|indexedDB/i)
    const client = read('src/chat/debriefClient.ts')
    expect(client).not.toMatch(/records\/|delivery\/(?!timeout)|localStorage|indexedDB/)
  })
})
