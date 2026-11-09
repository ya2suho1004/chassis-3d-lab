// E4(Codex 회의 11-08): 게임 화면·기본 화면을 오가도 같은 수행의 AI 대화가 이어진다.
// 대화 상태를 패널 밖 저장소로 옮겼으므로 패널이 새로 만들어져도 대화·질문 번호·쓰던 글·답 기다림이 유지된다.
// 새로 모으는 칸 없음. 네트워크 없음(가짜 ask).
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import type { ChatAsk, ChatResult } from '../src/chat/chatClient'
import { createChatConversation, type ChatConversation, type SendContext } from '../src/chat/chatConversation'
import { ChatPanel } from '../src/chat/ChatPanel'
import type { StoredChatTurn } from '../src/chat/chatStore'

const ctx: SendContext = { endpoint: 'https://fake.invalid/chat', sessionCode: 'DEMO-ONLY', anonymousStudentCode: 'D-01', recordId: 'rec-1', stepId: 'ppe', taskId: 'braking-force', difficultyMode: 'guided' }
const okResult = (answer: string, remaining = 9) => ({ ok: true, answer, masked: [], remaining, logged: true, chatId: 'c' }) as unknown as ChatResult
const fail = (code: string, retryable = false) => ({ ok: false, code, retryable }) as unknown as ChatResult

function make(answerFor: (a: ChatAsk) => ChatResult | Promise<ChatResult> = (a) => okResult(`답:${a.question}`)) {
  const asked: ChatAsk[] = []
  const saved: StoredChatTurn[] = []
  const conv = createChatConversation({
    ask: async (_e, a) => { asked.push(a); return answerFor(a) },
    save: async (t) => { saved.push(t); return true },
  })
  return { conv, asked, saved }
}
const say = async (c: ChatConversation, q: string, over: Partial<SendContext> = {}) => { c.setDraft(q); await c.send({ ...ctx, ...over }) }

describe('대화 저장소', () => {
  test('질문 번호가 0부터 끊기지 않고 이어지고, 저장 사본에도 같은 번호가 남는다', async () => {
    const { conv, asked, saved } = make()
    await say(conv, '첫째'); await say(conv, '둘째'); await say(conv, '셋째')
    expect(asked.map((a) => a.turnIndex)).toEqual([0, 1, 2])
    expect(saved.map((t) => t.turnIndex)).toEqual([0, 1, 2])
    expect(new Set(saved.map((t) => t.id)).size).toBe(3)
  })

  test('AI에게 앞선 대화 3번까지만 보내고, 실패한 질문은 뺀다', async () => {
    const { conv, asked } = make((a) => (a.question === '실패' ? fail('UPSTREAM') : okResult(`답:${a.question}`)))
    for (const q of ['1', '2', '실패', '3', '4']) await say(conv, q)
    await say(conv, '5')
    expect(asked.at(-1)!.history).toEqual([{ q: '2', a: '답:2' }, { q: '3', a: '답:3' }, { q: '4', a: '답:4' }])
  })

  test('답을 기다리는 동안 패널이 사라져도 답은 대화에 들어온다', async () => {
    let release!: (r: ChatResult) => void
    const { conv } = make(() => new Promise<ChatResult>((r) => { release = r }))
    conv.setDraft('질문')
    const pending = conv.send(ctx)
    expect(conv.getState().busy).toBe(true)
    expect(conv.getState().lines[0]).toMatchObject({ q: '질문', a: null })
    expect(conv.getState().draft).toBe('')
    release(okResult('늦은 답', 7))
    await pending
    expect(conv.getState().lines[0]!.a).toBe('늦은 답')
    expect(conv.getState().remaining).toBe(7)
    expect(conv.getState().busy).toBe(false)
  })

  test('답을 기다리는 중에는 두 번째 질문을 보내지 않고 쓰던 글을 지키며, 빈 글은 보내지 않는다', async () => {
    let release!: (r: ChatResult) => void
    const { conv, asked } = make(() => new Promise<ChatResult>((r) => { release = r }))
    conv.setDraft('첫째')
    const pending = conv.send(ctx)
    conv.setDraft('둘째')
    await conv.send(ctx)
    expect(asked).toHaveLength(1)
    expect(conv.getState().draft).toBe('둘째')
    release(okResult('답'))
    await pending
    conv.setDraft('   ')
    await conv.send(ctx)
    expect(asked).toHaveLength(1)
  })

  test('주소가 없으면 보내지 않는다', async () => {
    const { conv, asked } = make()
    await say(conv, '질문', { endpoint: null })
    expect(asked).toHaveLength(0)
    expect(conv.getState().lines).toHaveLength(0)
  })

  test('인터넷이 끊겨 실패하면 쓴 질문을 되살리되, 그 사이 새로 쓴 글은 덮지 않는다', async () => {
    const off = make(() => fail('NETWORK', true))
    await say(off.conv, '끊긴 질문')
    expect(off.conv.getState().draft).toBe('끊긴 질문')
    expect(off.conv.getState().lines[0]!.error).toBeTruthy()
    const capped = make(() => fail('LIMIT_STUDENT'))
    await say(capped.conv, '횟수 초과 질문')
    expect(capped.conv.getState().draft).toBe('') // 다시 보내도 안 되는 실패는 되살리지 않는다
    let release!: (r: ChatResult) => void
    const typed = make(() => new Promise<ChatResult>((r) => { release = r }))
    typed.conv.setDraft('끊긴 질문')
    const pending = typed.conv.send(ctx)
    typed.conv.setDraft('새 글')
    release(fail('NETWORK', true))
    await pending
    expect(typed.conv.getState().draft).toBe('새 글')
  })

  test('한도 초과처럼 남은 수를 함께 주는 실패는 남은 수를 반영한다', async () => {
    const { conv } = make(() => ({ ok: false, code: 'LIMIT_STUDENT', retryable: false, remaining: 0 }) as unknown as ChatResult)
    await say(conv, '질문')
    expect(conv.getState().remaining).toBe(0)
  })

  test('답 뒤 저장 사본에 보낸 때의 단계·수행 번호가 남는다', async () => {
    const { conv, saved } = make()
    await say(conv, '수령 전', { recordId: null, stepId: null })
    await say(conv, '수령 뒤')
    expect(saved[0]).toMatchObject({ recordId: null, stepId: null, question: '수령 전', answer: '답:수령 전', serverLogged: true })
    expect(saved[1]).toMatchObject({ recordId: 'rec-1', stepId: 'ppe', turnIndex: 1 })
  })

  test('구독자에게 바뀔 때마다 알리고, 해제하면 알리지 않는다', async () => {
    const { conv } = make()
    const fn = vi.fn()
    const off = conv.subscribe(fn)
    conv.setDraft('글')
    expect(fn).toHaveBeenCalledTimes(1)
    off()
    conv.setDraft('글2')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('새 대화(다음 학생)에는 앞 학생의 대화·번호가 넘어가지 않는다', async () => {
    const a = make(); const b = make()
    await say(a.conv, '앞 학생')
    expect(b.conv.getState().lines).toEqual([])
    await say(b.conv, '다음 학생')
    expect(b.asked[0]).toMatchObject({ turnIndex: 0, history: [] })
  })
})

describe('패널', () => {
  const panel = (conversation: ChatConversation, initialOpen = false) => renderToStaticMarkup(createElement(ChatPanel, { conversation, sessionCode: 'DEMO-ONLY', anonymousStudentCode: 'D-01', recordId: 'rec-1', stepId: 'ppe', taskId: 'braking-force', difficultyMode: 'guided', initialOpen }))

  test('새 패널이 같은 대화를 그대로 보여 준다(접힌 기본 화면에서도 펼친 채로)', async () => {
    const { conv } = make()
    await say(conv, '브레이크 질문')
    const html = panel(conv)
    expect(html).toMatch(/브레이크 질문/)
    expect(html).toMatch(/답:브레이크 질문/)
    expect(html).toMatch(/오늘 남은 질문 9개/)
  })

  test('대화가 없으면 기본 화면은 전처럼 접혀 있고, 게임 화면 서랍은 펼쳐 있다', () => {
    expect(panel(make().conv)).toMatch(/AI 교관에게 질문하기/)
    expect(panel(make().conv)).not.toMatch(/chatinput/)
    expect(panel(make().conv, true)).toMatch(/chatinput/)
  })

  test('쓰던 글과 답을 기다리는 상태도 새 패널에 보인다', () => {
    const pending = make(() => new Promise<ChatResult>(() => {}))
    pending.conv.setDraft('기다리는 질문')
    void pending.conv.send(ctx)
    pending.conv.setDraft('쓰던 글')
    const html = panel(pending.conv)
    expect(html).toMatch(/답을 쓰는 중/)
    expect(html).toMatch(/보내는 중/)
    expect(html).toMatch(/쓰던 글/)
  })
})

describe('화면 연결', () => {
  const lab = fs.readFileSync('src/screens/LabScreen.tsx', 'utf8')
  const panelSrc = fs.readFileSync('src/chat/ChatPanel.tsx', 'utf8')

  test('게임 화면·기본 화면의 패널이 같은 대화를 받는다', () => {
    expect(lab.match(/<ChatPanel conversation=\{chat\}/g)?.length).toBe(2)
    expect(lab.match(/<ChatPanel /g)?.length).toBe(2)
  })

  test('대화는 수행 번호가 바뀌면 새로 시작한다', () => {
    expect(lab).toMatch(/chatFor\.current\.recordId !== session\.recordId/)
  })

  test('패널 안에 대화 내용·질문 번호를 따로 들고 있지 않다', () => {
    expect(panelSrc).not.toMatch(/useState<Line\[\]>/)
    expect(panelSrc).not.toMatch(/turnRef/)
    expect(panelSrc).not.toMatch(/askChat/)
  })
})
