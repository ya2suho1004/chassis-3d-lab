// AI 교관 챗봇 서버(supabase/functions/_shared/chat) — 요청 검사, 켜짐·한도, 가림, 정답 유출 차단, 재시도, 기록, 모델 교체 지점
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { handleChat, parseChatRequest, startOfTodayKstIso, REFUSAL_FALLBACK, type ChatDeps, type ChatLogRow } from '../supabase/functions/_shared/chat/chatCore'
import { callModel, type ModelCall, type ModelResult } from '../supabase/functions/_shared/chat/providers'
import { PROMPT_VERSION } from '../supabase/functions/_shared/chat/prompt'
import context from '../supabase/functions/_shared/chat/taskContext.generated.json'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import lv2 from '../src/data/tasks/task.braking-force.case-lv2.json'
// @ts-expect-error — 생성 스크립트(.mjs)는 타입 선언이 없다
import { buildChatContext } from '../scripts/build-chat-context.mjs'

const NOW = Date.parse('2026-10-28T05:00:00.000Z')
const req = (o: Record<string, unknown> = {}) => JSON.stringify({
  protocolVersion: 'chat-1', sessionCode: 'DEMO-ONLY', anonymousStudentCode: 'D-01', recordId: 'rec-1', stepId: 'calc', difficultyMode: 'guided',
  question: '편차는 어떻게 계산해요?', history: [], turnIndex: 0, ...o,
})

function harness(o: { session?: Partial<{ active: boolean; chatbotEnabled: boolean; capPerStudent: number; dailyCap: number }> | null; mine?: number; all?: number; results?: ModelResult[]; failLog?: boolean } = {}) {
  const calls: ModelCall[] = []
  const logs: ChatLogRow[] = []
  const sleeps: number[] = []
  const results = [...(o.results ?? [{ ok: true, status: 200, text: '편차는 큰 쪽에서 작은 쪽을 뺀 뒤 축중으로 나눠요.', modelVersion: 'gemini-3.5-flash-lite' }])]
  const deps: ChatDeps = {
    context,
    getSession: async () => (o.session === null ? null : { active: true, chatbotEnabled: true, capPerStudent: 20, dailyCap: 300, ...(o.session ?? {}) }),
    countToday: async (_s, student) => (student ? o.mine ?? 0 : o.all ?? 0),
    insertLog: async (row) => { if (o.failLog) throw new Error('db'); logs.push(row); return `chat-${logs.length}` },
    model: () => ({ provider: 'gemini', model: 'gemini-3.5-flash-lite', apiKey: 'TEST-KEY' }),
    callModel: async (c) => { calls.push(c); return results.shift() ?? { ok: true, status: 200, text: 'ok' } },
    now: () => NOW,
    sleep: async (ms) => { sleeps.push(ms) },
  }
  return { deps, calls, logs, sleeps, chat: (body: string, type: string | null = 'text/plain;charset=UTF-8') => handleChat(type, body, deps) }
}

describe('요청 검사', () => {
  test('정상 요청은 통과하고 질문 앞뒤 공백을 다듬는다', () => {
    expect(parseChatRequest('text/plain', req({ question: '  안녕?  ' }))?.question).toBe('안녕?')
  })
  test('잘못된 요청은 INVALID_REQUEST, 모델 호출·기록 없음', async () => {
    const h = harness()
    const bad: Array<[string, string, string | null]> = [
      ['MIME', req(), 'application/json'], ['빈 본문', '', 'text/plain'], ['JSON 아님', '{x', 'text/plain'], ['프로토콜', req({ protocolVersion: 'chat-2' }), 'text/plain'],
      ['추가 필드', req({ extra: 1 }), 'text/plain'], ['세션 코드 형식', req({ sessionCode: '수업 1' }), 'text/plain'], ['학생 코드 형식', req({ anonymousStudentCode: 'a b' }), 'text/plain'],
      ['빈 질문', req({ question: '   ' }), 'text/plain'], ['301자', req({ question: '가'.repeat(301) }), 'text/plain'], ['문맥 4턴', req({ history: Array(4).fill({ q: 'a', a: 'b' }) }), 'text/plain'],
      ['문맥 모양', req({ history: [{ q: 'a' }] }), 'text/plain'], ['단계 모드', req({ difficultyMode: 'easy' }), 'text/plain'], ['turnIndex', req({ turnIndex: -1 }), 'text/plain'],
    ]
    for (const [name, body, type] of bad) expect((await h.chat(body, type)) as any, name).toMatchObject({ ok: false, code: 'INVALID_REQUEST', retryable: false })
    expect(h.calls).toHaveLength(0); expect(h.logs).toHaveLength(0)
  })
})

describe('켜짐·한도', () => {
  test('세션 없음·비활성·챗봇 꺼짐은 CHAT_DISABLED', async () => {
    for (const session of [null, { active: false }, { chatbotEnabled: false }]) {
      const h = harness({ session })
      expect(await h.chat(req())).toMatchObject({ ok: false, code: 'CHAT_DISABLED' })
      expect(h.calls).toHaveLength(0)
    }
  })
  test('학생 한도(20)에 닿으면 LIMIT_STUDENT·남은 0, 세션 하루 한도면 LIMIT_SESSION', async () => {
    expect(await harness({ mine: 20 }).chat(req())).toMatchObject({ ok: false, code: 'LIMIT_STUDENT', remaining: 0 })
    expect(await harness({ mine: 3, all: 300 }).chat(req())).toMatchObject({ ok: false, code: 'LIMIT_SESSION', remaining: 17 })
  })
  test('정상 답변은 남은 질문 수를 하나 줄여 알려 준다', async () => {
    expect(await harness({ mine: 5 }).chat(req())).toMatchObject({ ok: true, remaining: 14, logged: true, refused: false })
  })
  test('하루 기준은 한국 시각 0시', () => {
    expect(startOfTodayKstIso(Date.parse('2026-10-28T05:00:00Z'))).toBe('2026-10-27T15:00:00.000Z')
    expect(startOfTodayKstIso(Date.parse('2026-10-27T15:30:00Z'))).toBe('2026-10-27T15:00:00.000Z')
    expect(startOfTodayKstIso(Date.parse('2026-10-27T14:59:00Z'))).toBe('2026-10-26T15:00:00.000Z')
  })
})

describe('개인정보·정답 유출 차단', () => {
  test('질문과 이전 질문의 전화번호·학년반은 AI로 가기 전에 가린다. 가명 코드·기록 ID·세션 코드는 보내지 않는다', async () => {
    const h = harness()
    await h.chat(req({ anonymousStudentCode: 'D-77', recordId: 'REC-SECRET-1', question: '저 2학년 3반인데 010-1234-5678로 알려줘요', history: [{ q: '메일 a@b.kr', a: '개인정보는 쓰지 마세요' }] }))
    const c = h.calls[0]!
    expect(c.question).toBe('저 [가림]인데 [가림]로 알려줘요')
    expect(c.history[0]!.q).toBe('메일 [가림]')
    const sent = JSON.stringify(c)
    for (const s of ['D-77', 'REC-SECRET-1', 'DEMO-ONLY', '010-1234-5678']) expect(sent).not.toContain(s)
    expect(h.logs[0]).toMatchObject({ question_masked: '저 [가림]인데 [가림]로 알려줘요', masked_patterns: ['phone', 'classroom'], anonymous_student_code: 'D-77', record_id: 'REC-SECRET-1' })
  })
  test('시스템 프롬프트에 사례 측정값이 없고, 무안내·평가 단계는 정답 금지 규칙이 들어간다', async () => {
    const h = harness()
    await h.chat(req({ difficultyMode: 'unguided' })); await h.chat(req({ difficultyMode: 'timedAssessment' })); await h.chat(req({ difficultyMode: 'guided' }))
    for (const lv of [lv1, lv2]) for (const v of [lv.measurement.left, lv.measurement.right, lv.measurement.axleWeight]) for (const c of h.calls) expect(c.system).not.toMatch(new RegExp(`\\b${v}\\b`))
    expect(h.calls[0]!.system).toContain('"안내 없음(정비사)"'); expect(h.calls[1]!.system).toContain('"안내 없음(정비사)"'); expect(h.calls[2]!.system).toContain('"안내 있음(견습)"')
  })
  test('과제 문맥 파일은 최신이고 측정값 필드가 없다', () => {
    expect(readFileSync('supabase/functions/_shared/chat/taskContext.generated.json', 'utf8')).toBe(buildChatContext())
    expect(JSON.stringify(context)).not.toMatch(/measurement|axleWeight|"left"|"right"/)
  })
})

describe('모델 호출·기록', () => {
  test('429에 짧은 retry-after면 한 번 기다렸다 다시 묻고 성공', async () => {
    const h = harness({ results: [{ ok: false, status: 429, retryAfterMs: 1500 }, { ok: true, status: 200, text: '답변' }] })
    expect(await h.chat(req())).toMatchObject({ ok: true, answer: '답변' })
    expect(h.calls).toHaveLength(2); expect(h.sleeps).toEqual([1500])
  })
  test('429가 길거나 반복되면 UPSTREAM_BUSY(retryable), 오류 기록은 남기되 한도에 세지 않는다(status=error)', async () => {
    const long = harness({ results: [{ ok: false, status: 429, retryAfterMs: 60000 }] })
    expect(await long.chat(req())).toMatchObject({ ok: false, code: 'UPSTREAM_BUSY', retryable: true })
    expect(long.calls).toHaveLength(1); expect(long.logs[0]!.status).toBe('error')
    const twice = harness({ results: [{ ok: false, status: 429 }, { ok: false, status: 429 }] })
    expect(await twice.chat(req())).toMatchObject({ ok: false, code: 'UPSTREAM_BUSY' })
    expect(await harness({ results: [{ ok: false, status: 500 }] }).chat(req())).toMatchObject({ ok: false, code: 'UPSTREAM_ERROR', retryable: true })
  })
  test('빈 답(안전 필터 차단 등)은 안내 문구로 바꾸고 refused로 기록', async () => {
    const h = harness({ results: [{ ok: true, status: 200, text: '', finishReason: 'SAFETY' }] })
    expect(await h.chat(req())).toMatchObject({ ok: true, answer: REFUSAL_FALLBACK, refused: true })
    expect(h.logs[0]!.status).toBe('refused')
  })
  test('기록 저장이 실패해도 답은 주되 logged=false', async () => {
    expect(await harness({ failLog: true }).chat(req())).toMatchObject({ ok: true, logged: false, chatId: null })
  })
  test('기록에는 모델·모델 버전·프롬프트 버전·지연 시간이 남는다', async () => {
    const h = harness()
    await h.chat(req())
    expect(h.logs[0]).toMatchObject({ provider: 'gemini', model: 'gemini-3.5-flash-lite', model_version: 'gemini-3.5-flash-lite', prompt_version: PROMPT_VERSION, status: 'answered', session_code: 'DEMO-ONLY' })
    expect(typeof h.logs[0]!.latency_ms).toBe('number')
  })
})

describe('모델 교체 지점(providers)', () => {
  const call: ModelCall = { provider: 'gemini', model: 'gemini-3.5-flash-lite', apiKey: 'K', system: 'SYS', history: [{ q: 'q1', a: 'a1' }], question: 'q2', maxOutputTokens: 400 }
  test('gemini: 키는 머리글로, 문맥은 user/model 번갈아, 안전 필터 4종을 켠다', async () => {
    let seen: any
    const res = await callModel(call, (async (url: string, init: any) => { seen = { url, init, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '답' }] }, finishReason: 'STOP' }], modelVersion: 'v' }), { status: 200 }) }) as any)
    expect(res).toMatchObject({ ok: true, text: '답', modelVersion: 'v' })
    expect(seen.url).not.toContain('K'); expect(seen.init.headers['x-goog-api-key']).toBe('K')
    expect(seen.body.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user'])
    expect(seen.body.safetySettings).toHaveLength(4); expect(seen.body.systemInstruction.parts[0].text).toBe('SYS')
  })
  test('anthropic: system 분리, user/assistant 번갈아, 429면 retry-after를 ms로', async () => {
    let body: any
    const ok = await callModel({ ...call, provider: 'anthropic', model: 'claude-haiku-5-5' }, (async (_u: string, init: any) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ content: [{ type: 'text', text: '답' }], model: 'claude-haiku-5-5' }), { status: 200 }) }) as any)
    expect(ok).toMatchObject({ ok: true, text: '답' }); expect(body.system).toBe('SYS'); expect(body.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user'])
    const busy = await callModel({ ...call, provider: 'anthropic' }, (async () => new Response('{}', { status: 429, headers: { 'retry-after': '2' } })) as any)
    expect(busy).toMatchObject({ ok: false, status: 429, retryAfterMs: 2000 })
  })
  test('모르는 공급자는 호출하지 않고 실패', async () => {
    expect(await callModel({ ...call, provider: 'other' }, (() => { throw new Error('called') }) as any)).toMatchObject({ ok: false, error: 'UNKNOWN_PROVIDER' })
  })
})
