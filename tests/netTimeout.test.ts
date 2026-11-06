// 연결은 붙어 있는데 응답이 안 오는 경우(Codex 교차 검토 2026-11-06 A3) — 무한 '보내는 중' 방지
import { describe, expect, it } from 'vitest'
import { askChat, chatErrorMessage, keepQuestionAfter, serverLogNote } from '../src/chat/chatClient'
import { sendResultLabel } from '../src/delivery/sendLabel'
import { deadline } from '../src/delivery/timeout'

const ask = { sessionCode: 'DEMO-ONLY', anonymousStudentCode: 'D-01', recordId: null, stepId: null, difficultyMode: 'guided' as const, question: '측정판은?', history: [], turnIndex: 0 }
const never = (() => new Promise<Response>(() => {})) as unknown as typeof fetch
/** 머리글은 왔는데 본문이 끝나지 않는 응답 */
const headersOnly = (async () => ({ type: 'basic', status: 200, text: () => new Promise<string>(() => {}) }) as unknown as Response) as unknown as typeof fetch

describe('deadline', () => {
  it('시간 안에 끝나면 결과를 그대로, 넘으면 TIMEOUT', async () => {
    const d = deadline(30)
    expect(await d.run(Promise.resolve(1))).toBe(1)
    d.clear()
    const d2 = deadline(10)
    await expect(d2.run(new Promise(() => {}))).rejects.toThrow('TIMEOUT')
    expect(d2.expired()).toBe(true)
    expect(d2.signal?.aborted).toBe(true)
  })
})

describe('AI 질문 대기 제한', () => {
  it('응답이 안 오면 TIMEOUT(다시 보낼 수 있음, 질문 되살림)', async () => {
    const r = await askChat('https://x/chat', ask, never, 20)
    expect(r).toEqual({ ok: false, code: 'TIMEOUT', retryable: true })
    expect(keepQuestionAfter(r)).toBe(true)
  })
  it('본문 읽기가 멈춰도 TIMEOUT', async () => {
    expect(await askChat('https://x/chat', ask, headersOnly, 20)).toEqual({ ok: false, code: 'TIMEOUT', retryable: true })
  })
  it('시간 초과 문구는 인터넷 끊김으로 단정하지 않는다', () => {
    const m = chatErrorMessage('TIMEOUT')
    expect(m).toContain('오지 않았어요')
    expect(m).not.toContain('인터넷 연결')
  })
  it('바로 끊긴 경우는 그대로 NETWORK', async () => {
    expect(await askChat('https://x', ask, (async () => { throw new Error('offline') }) as unknown as typeof fetch, 20)).toEqual({ ok: false, code: 'NETWORK', retryable: true })
  })
})

describe('교사 전송 결과 문구', () => {
  it('TIMEOUT이면 기록이 기기에 있고 강제 재전송을 안내', () => {
    const t = sendResultLabel({ recordId: 'r', outcome: 'confirmationPending', code: 'TIMEOUT' } as never)
    expect(t).toContain('응답이 없음')
    expect(t).toContain('강제 재전송')
  })
})

describe('서버 대화 저장 확인 못 함 표시(A7)', () => {
  const ok = { ok: true as const, answer: 'a', remaining: 3, chatId: null, masked: [], refused: false }
  it('logged=false면 답은 두고 작은 안내', () => {
    expect(serverLogNote({ ...ok, logged: false })).toContain('선생님 대화 목록')
  })
  it('logged=true거나 실패면 표시 없음', () => {
    expect(serverLogNote({ ...ok, logged: true })).toBeNull()
    expect(serverLogNote({ ok: false, code: 'NETWORK', retryable: true })).toBeNull()
  })
})
