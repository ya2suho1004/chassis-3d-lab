// E2(Codex 회의 2026-11-08): AI 교관 답이 끊기거나 막혔을 때의 처리 + 과제에 맞는 거절 대체 문구.
// 끝난 이유는 새로 저장하지 않는다(기존 status·answer 칸만 사용 → 새 수집 없음).
import { describe, expect, test } from 'vitest'
import { classifyFinish, handleChat, refusalFallback, REFUSAL_FALLBACK, TRUNCATED_NOTE, type ChatDeps, type ChatLogRow } from '../supabase/functions/_shared/chat/chatCore'
import { callModel, type ModelCall, type ModelResult } from '../supabase/functions/_shared/chat/providers'
import context from '../supabase/functions/_shared/chat/taskContext.generated.json'

const req = (o: Record<string, unknown> = {}) => JSON.stringify({
  protocolVersion: 'chat-1', sessionCode: 'DEMO-ONLY', anonymousStudentCode: 'D-01', recordId: 'rec-1', stepId: 'calc', difficultyMode: 'guided',
  question: '편차는 어떻게 계산해요?', history: [], turnIndex: 0, ...o,
})
function run(result: ModelResult, o: Record<string, unknown> = {}) {
  const logs: ChatLogRow[] = []
  const deps: ChatDeps = {
    context,
    getSession: async () => ({ active: true, chatbotEnabled: true, capPerStudent: 20, dailyCap: 300 }),
    countToday: async () => 0,
    insertLog: async (row) => { logs.push(row); return 'chat-1' },
    model: () => ({ provider: 'gemini', model: 'm', apiKey: 'TEST-KEY' }),
    callModel: async () => result,
    now: () => 0,
    sleep: async () => {},
  }
  return handleChat('text/plain', req(o), deps).then((res) => ({ res, logs }))
}

describe('끝난 이유 나누기', () => {
  test('정상·끊김·막힘', () => {
    for (const r of ['STOP', 'end_turn', 'stop_sequence', null, undefined, 'FINISH_REASON_UNSPECIFIED']) expect(classifyFinish(r), String(r)).toBe('complete')
    for (const r of ['MAX_TOKENS', 'max_tokens', 'model_context_window_exceeded']) expect(classifyFinish(r), r).toBe('truncated')
    for (const r of ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'LANGUAGE', 'OTHER', 'PROMPT_BLOCKED', 'refusal']) expect(classifyFinish(r), r).toBe('blocked')
  })
})

describe('과제에 맞는 거절 대체 문구', () => {
  test('최소회전반경 과제에는 제동력 이야기를 하지 않는다', () => {
    expect(refusalFallback('min-turning-radius')).toBe('그 질문에는 답할 수 없어요. 최소회전반경 측정 방법이나 안전수칙에 대해 물어봐 주세요.')
    expect(refusalFallback('min-turning-radius')).not.toMatch(/제동/)
    expect(refusalFallback('braking-force')).toBe(REFUSAL_FALLBACK)
    expect(refusalFallback(null)).toBe(REFUSAL_FALLBACK)
  })
  test('최소회전반경 과제에서 빈 답이면 최소회전반경 문구로 refused', async () => {
    const { res, logs } = await run({ ok: true, status: 200, text: '' , finishReason: 'SAFETY' }, { taskId: 'min-turning-radius' })
    expect(res).toMatchObject({ ok: true, refused: true, answer: refusalFallback('min-turning-radius') })
    expect(logs[0]!.status).toBe('refused')
  })
})

describe('막힌 답·끊긴 답 처리', () => {
  test('막혔는데 글이 일부 남아 있으면 그 글을 버리고 거절 문구(refused)', async () => {
    const { res, logs } = await run({ ok: true, status: 200, text: '편차를 계산하면 정답은', finishReason: 'SAFETY' })
    expect(res).toMatchObject({ ok: true, refused: true, answer: REFUSAL_FALLBACK })
    expect(logs[0]).toMatchObject({ status: 'refused', answer: REFUSAL_FALLBACK })
  })
  test('anthropic 거절(stop_reason=refusal)도 같다', async () => {
    const { res } = await run({ ok: true, status: 200, text: '음, 그건', finishReason: 'refusal' })
    expect(res).toMatchObject({ refused: true, answer: REFUSAL_FALLBACK })
  })
  test('길어서 끊긴 답은 마지막 완성 문장까지만 보이고 끊겼다고 알린다(answered)', async () => {
    const text = '먼저 좌우 제동력 중 큰 쪽을 찾아요. 그다음 작은 쪽을 빼서 축중으로 나누고 100을 곱해'
    const { res, logs } = await run({ ok: true, status: 200, text, finishReason: 'MAX_TOKENS' })
    expect(res).toMatchObject({ ok: true, refused: false, answer: `먼저 좌우 제동력 중 큰 쪽을 찾아요.${TRUNCATED_NOTE}` })
    expect(logs[0]).toMatchObject({ status: 'answered', answer: `먼저 좌우 제동력 중 큰 쪽을 찾아요.${TRUNCATED_NOTE}` })
  })
  test('완성 문장이 너무 앞에만 있으면 글을 자르지 않고 알림만 붙인다', async () => {
    const text = '네. 편차는 좌우 제동력의 차이를 축중에 대한 백분율로 나타낸 값으로 큰 쪽에서 작은 쪽을 빼서'
    const { res } = await run({ ok: true, status: 200, text, finishReason: 'MAX_TOKENS' })
    expect(res).toMatchObject({ answer: `${text}${TRUNCATED_NOTE}` })
  })
  test('끊겼는데 글이 하나도 없으면 거절이 아니라 다시 물어보라는 오류(한도에 세지 않음)', async () => {
    const { res, logs } = await run({ ok: true, status: 200, text: '', finishReason: 'MAX_TOKENS' })
    expect(res).toMatchObject({ ok: false, code: 'UPSTREAM_ERROR', retryable: true })
    expect(logs[0]).toMatchObject({ status: 'error', answer: null })
  })
  test('정상 답은 그대로', async () => {
    const { res } = await run({ ok: true, status: 200, text: '편차는 큰 쪽에서 작은 쪽을 빼요.', finishReason: 'STOP' })
    expect(res).toMatchObject({ refused: false, answer: '편차는 큰 쪽에서 작은 쪽을 빼요.' })
  })
})

describe('gemini 질문 자체가 막힌 경우', () => {
  test('후보 없이 promptFeedback.blockReason만 오면 PROMPT_BLOCKED로 돌려준다', async () => {
    const call: ModelCall = { provider: 'gemini', model: 'm', apiKey: 'TEST-KEY', system: 's', history: [], question: 'q', maxOutputTokens: 10 }
    const r = await callModel(call, (async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 })) as any)
    expect(r).toMatchObject({ ok: true, text: '', finishReason: 'PROMPT_BLOCKED' })
  })
})
