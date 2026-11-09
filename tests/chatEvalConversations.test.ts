// E1(Codex 회의 2026-11-08): 실제 서버 조건에 맞춘 AI 시험 묶음과 사람 판독표. 가짜 모델만 쓴다 — 네트워크·DB 없음.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { MAX_OUTPUT_TOKENS, TRUNCATED_NOTE, refusalFallback } from '../supabase/functions/_shared/chat/chatCore'
import type { ModelCall, ModelResult } from '../supabase/functions/_shared/chat/providers'
import context from '../supabase/functions/_shared/chat/taskContext.generated.json'
// @ts-expect-error — 개발 도구의 .mjs 모듈(타입 선언 없음)
import { CONVERSATIONS, DIMENSIONS, SUITE_CHECK } from '../scripts/chat-eval/conversations.mjs'
// @ts-expect-error — 개발 도구의 .mjs 모듈(타입 선언 없음)
import { renderSheet, runConversation, suiteAsConversations } from '../scripts/chat-eval/conversation-run.mjs'
// @ts-expect-error — 개발 도구의 .mjs 모듈(타입 선언 없음)
import { SUITE } from '../scripts/chat-eval/questions-turning.mjs'

type Turn = { text: string; expect: string; check: string[]; stepId?: string | null; leak?: string[] }
type Conv = { id: string; title: string; taskId: string | null; mode: string; stepId: string | null; turns: Turn[] }
const T = 'min-turning-radius'
const conv = (texts: string[], o: Partial<Conv> = {}): Conv => ({ id: 'X1', title: '시험', taskId: T, mode: 'guided', stepId: 'read', turns: texts.map((text) => ({ text, expect: '기대', check: ['accuracy'] })), ...o })
const okModel = (over: (c: ModelCall, n: number) => Partial<ModelResult> = () => ({})) => {
  const calls: ModelCall[] = []
  const callModel = async (c: ModelCall): Promise<ModelResult> => {
    calls.push(c)
    return { ok: true, status: 200, text: `답${calls.length}.`, finishReason: 'STOP', modelVersion: 'fake-1', ...over(c, calls.length) }
  }
  return { calls, opts: { callModel, provider: 'fake', model: 'fake-model', apiKey: 'x', context, pause: async () => {} } }
}

describe('대화 묶음 자료', () => {
  test('두 과제·두 도움 방식을 모두 다루고, 판독 항목 다섯을 빠짐없이 쓴다', () => {
    const combos = new Set((CONVERSATIONS as Conv[]).map((c) => `${c.taskId === T ? 'turn' : 'brake'}-${c.mode}`))
    expect([...combos].sort()).toEqual(['brake-guided', 'brake-unguided', 'turn-guided', 'turn-unguided'])
    const used = new Set((CONVERSATIONS as Conv[]).flatMap((c) => c.turns.flatMap((t) => t.check)))
    expect([...used].sort()).toEqual(Object.keys(DIMENSIONS).sort())
  })

  test('번호가 겹치지 않고, 모든 차례에 기대 동작과 판독 항목이 있으며 질문은 서버 길이 제한 안이다', () => {
    const ids = (CONVERSATIONS as Conv[]).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of CONVERSATIONS as Conv[]) {
      expect(c.turns.length).toBeGreaterThanOrEqual(2)
      for (const t of c.turns) {
        expect(t.expect.length).toBeGreaterThan(0)
        expect(t.check.length).toBeGreaterThan(0)
        for (const k of t.check) expect(Object.keys(DIMENSIONS)).toContain(k)
        expect(t.text.length).toBeLessThanOrEqual(300)
      }
    }
  })

  test('단계 이름은 그 과제에 실제로 있는 것만 쓴다', () => {
    const stepsOf = (taskId: string | null) => (taskId === T ? context.turning!.steps : context.steps).map((s) => s.stepId)
    for (const c of CONVERSATIONS as Conv[]) {
      for (const t of c.turns) {
        const step = t.stepId === undefined ? c.stepId : t.stepId
        if (step !== null) expect(stepsOf(c.taskId), `${c.id} ${step}`).toContain(step)
      }
    }
  })

  test('기존 질문 20개도 판독 항목을 갖고 한 번짜리 대화로 함께 돈다', () => {
    const list = suiteAsConversations(SUITE) as Conv[]
    expect(list.length).toBe(SUITE.length)
    for (const c of list) {
      expect(c.turns.length).toBe(1)
      expect(c.turns[0]!.check.length, c.id).toBeGreaterThan(0)
    }
    expect(Object.keys(SUITE_CHECK).sort()).toEqual(SUITE.map((q: { id: string }) => q.id).sort())
  })

  test('모든 차례가 서버 요청 검사를 통과한다(가짜 모델로 끝까지)', async () => {
    for (const c of [...(CONVERSATIONS as Conv[]), ...(suiteAsConversations(SUITE) as Conv[])]) {
      const { opts } = okModel()
      const r = await runConversation(c, opts)
      expect(r.turns.map((t: { error: string | null }) => t.error), c.id).toEqual(c.turns.map(() => null))
    }
  })
})

describe('실제 서버 조건 그대로', () => {
  test('답 길이 제한은 서버 값(400)이고 시스템 프롬프트는 과제·도움 방식을 따른다', async () => {
    expect(MAX_OUTPUT_TOKENS).toBe(400)
    const { calls, opts } = okModel()
    await runConversation(conv(['질문'], { mode: 'unguided' }), opts)
    expect(calls[0]!.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS)
    expect(calls[0]!.system).toContain('최소회전반경')
    expect(calls[0]!.system).toContain('안내 없음(정비사)')
  })

  test('앞 대화는 실제 받은 답으로 쌓이고 최근 3번만 간다', async () => {
    const { calls, opts } = okModel()
    await runConversation(conv(['1번', '2번', '3번', '4번', '5번']), opts)
    expect(calls[0]!.history).toEqual([])
    expect(calls[1]!.history).toEqual([{ q: '1번', a: '답1.' }])
    expect(calls[4]!.history).toEqual([{ q: '2번', a: '답2.' }, { q: '3번', a: '답3.' }, { q: '4번', a: '답4.' }])
  })

  test('개인정보는 질문과 앞 대화 모두 가려져 나간다', async () => {
    const { calls, opts } = okModel()
    const r = await runConversation(conv(['제 번호 010-1234-5678이에요', '아까 번호 뭐였죠?']), opts)
    expect(JSON.stringify(calls)).not.toContain('010-1234-5678')
    expect(r.turns[0].sent).toContain('[가림]')
    expect(r.turns[0].masked).toEqual(['phone'])
  })

  test('실패한 차례는 앱처럼 앞 대화에서 빠지고 오류로 남는다', async () => {
    const { calls, opts } = okModel((_c, n) => (n === 1 ? { ok: false, status: 500, text: undefined } : {}))
    const r = await runConversation(conv(['1번', '2번']), opts)
    expect(r.turns[0].error).toBe('UPSTREAM_ERROR')
    expect(r.turns[0].answer).toBeNull()
    expect(calls[1]!.history).toEqual([])
  })

  test('막힌 답은 과제별 거절 문구, 끊긴 답은 알림까지 서버 처리 그대로 표시된다', async () => {
    const blocked = okModel(() => ({ text: '남은 글', finishReason: 'SAFETY' }))
    const b = await runConversation(conv(['질문']), blocked.opts)
    expect(b.turns[0].refused).toBe(true)
    expect(b.turns[0].answer).toBe(refusalFallback(T))
    expect(b.turns[0].finishReason).toBe('SAFETY')
    const cut = okModel(() => ({ text: '앞 문장은 끝까지 썼습니다. 뒷 문장은 잘', finishReason: 'MAX_TOKENS' }))
    const c = await runConversation(conv(['질문']), cut.opts)
    expect(c.turns[0].truncated).toBe(true)
    expect(c.turns[0].answer.endsWith(TRUNCATED_NOTE)).toBe(true)
  })

  test('금지 문자열은 표시만 하고, 차례마다 쉰다', async () => {
    let paused = 0
    const { opts } = okModel(() => ({ text: '정답은 5.5 m입니다.' }))
    const c = conv(['정답?', '또?'])
    c.turns[0]!.leak = ['5.5', '없는말']
    const r = await runConversation(c, { ...opts, pause: async () => { paused++ } })
    expect(r.turns[0].leaks).toEqual(['5.5'])
    expect(r.turns[1].leaks).toEqual([])
    expect(paused).toBe(2)
  })

  test('시험기는 서버 처리 본체만 부르고 직접 통신하거나 DB를 건드리지 않는다', () => {
    const src = fs.readFileSync('scripts/chat-eval/conversation-run.mjs', 'utf8')
    expect(src).toMatch(/handleChat/)
    expect(src).not.toMatch(/\bfetch\(|createClient|SUPABASE/)
  })

  test('기존 묶음 시험도 서버 답 길이 제한을 쓴다', () => {
    const src = fs.readFileSync('scripts/chat-eval/run-suite.mjs', 'utf8')
    expect(src).toMatch(/maxOutputTokens: MAX_OUTPUT_TOKENS/)
    expect(src).not.toMatch(/maxOutputTokens: 600/)
  })
})

describe('사람 판독표', () => {
  const meta = { provider: 'fake', model: 'fake-model', promptVersion: 'p-1', ranAt: '2026-11-09T00:00:00.000Z' }

  test('정답 기준은 승인된 과제 자료에서 가져오고 시험 조건을 밝힌다', async () => {
    const { opts } = okModel()
    const md = renderSheet([await runConversation(conv(['질문']), opts)], meta, context)
    expect(md).toContain(`${context.turning!.ruleset.radiusMaxM} m 이하`)
    expect(md).toContain(`${context.ruleset.deviationMaxPercent}% 이하`)
    expect(md).toContain(`앞축 ${context.ruleset.sumMinFrontPercent}% 이상`)
    expect(md).toContain(`뒤축 ${context.ruleset.sumMinRearPercent}% 이상`)
    expect(md).toContain('답 길이 제한 400')
    expect(md).toContain('최근 3번')
    expect(md).toContain('연구 자료가 아니')
    for (const label of Object.values(DIMENSIONS) as Array<{ label: string }>) expect(md).toContain(label.label)
  })

  test('차례마다 빈 판독·메모 칸이 있고, 표를 깨는 글자와 줄바꿈을 처리한다', async () => {
    const { opts } = okModel(() => ({ text: 'A | B\n\nC' }))
    const md = renderSheet([await runConversation(conv(['질문 | 하나']), opts)], meta, context)
    expect(md).toContain('질문 \\| 하나')
    expect(md).toContain('A \\| B C')
    const row = md.split('\n').find((l: string) => l.startsWith('| 1 |'))!
    expect(row.endsWith('|  |  |')).toBe(true)
  })

  test('요약에 판독 항목별 대상 수와 자동 표시 건수가 맞게 나온다', async () => {
    const { opts } = okModel((_c, n) => (n === 1 ? { text: '잘린 문장입니다. 뒤', finishReason: 'MAX_TOKENS' } : n === 2 ? { text: '남은 글', finishReason: 'SAFETY' } : n === 3 ? { ok: false, status: 500, text: undefined } : { text: '5.5' }))
    const c = conv(['1', '2', '3', '4'])
    c.turns[3]!.leak = ['5.5']
    c.turns[3]!.check = ['leak', 'safety']
    const md = renderSheet([await runConversation(c, opts)], meta, context)
    expect(md).toContain('끊김 1 · 거절 1 · 오류 1 · 금지 문자열 1')
    expect(md).toContain('| 정확성 | 3 |  |  |')
    expect(md).toContain('| 답 누설 | 1 |  |  |')
    expect(md).toContain('| 안전 | 1 |  |  |')
    expect(md).toContain('| 모르는 내용 | 0 |  |  |')
  })
})

describe('실행 명령', () => {
  const cli = 'scripts/chat-eval/run-conversations.mjs'

  test('--run 없이는 호출 계획만 보여 주고 아무것도 부르지 않는다', () => {
    const out = execFileSync('node', [cli, 'gemini'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    expect(out).toContain('호출하지 않았습니다')
    expect(out).toContain('--run')
  })

  test('연결 코드가 없는 공급자는 부르기 전에 멈춘다', () => {
    const r = spawnSync('node', [cli, 'openai', '--run'], { encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('연결 코드')
  })
})
