// 학생 화면 챗봇 전송·응답 읽기·굵은 글씨 처리·기기 사본 저장
import 'fake-indexeddb/auto'
import { describe, expect, test } from 'vitest'
import { askChat, buildChatBody, chatErrorMessage, parseChatResponse, splitBold } from '../src/chat/chatClient'
import { listChatTurns, saveChatTurn } from '../src/chat/chatStore'
import { parseChatRequest } from '../supabase/functions/_shared/chat/chatCore'

const ask = { sessionCode: 'DEMO-ONLY', anonymousStudentCode: 'D-01', recordId: null, stepId: 'calc', difficultyMode: 'guided' as const, question: '  질문  ', history: [1, 2, 3, 4].map((i) => ({ q: `q${i}`, a: `a${i}` })), turnIndex: 4 }

describe('chatClient', () => {
  test('보내는 본문은 서버 요청 검사를 통과하고, 문맥은 최근 3턴만', () => {
    const body = buildChatBody(ask)
    const parsed = parseChatRequest('text/plain;charset=UTF-8', body)
    expect(parsed).not.toBeNull()
    expect(parsed!.question).toBe('질문'); expect(parsed!.history.map((t) => t.q)).toEqual(['q2', 'q3', 'q4'])
  })
  test('text/plain·인증 없음으로 보낸다(사전 확인 요청 없음)', async () => {
    let init: any
    await askChat('https://x/chat', ask, (async (_u: string, i: any) => { init = i; return new Response(JSON.stringify({ protocolVersion: 'chat-1', ok: true, answer: 'a', remaining: 3, logged: true, chatId: 'c', masked: [], refused: false })) }) as any)
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain;charset=UTF-8' }); expect(init.credentials).toBe('omit')
  })
  test('응답 읽기: 정상·오류·모양이 틀린 응답·네트워크 실패', async () => {
    expect(parseChatResponse(JSON.stringify({ protocolVersion: 'chat-1', ok: true, answer: '답', remaining: 2, logged: false, chatId: null, masked: ['phone'], refused: false }))).toMatchObject({ ok: true, answer: '답', remaining: 2, logged: false, masked: ['phone'] })
    expect(parseChatResponse(JSON.stringify({ protocolVersion: 'chat-1', ok: false, code: 'LIMIT_STUDENT', retryable: false, remaining: 0 }))).toEqual({ ok: false, code: 'LIMIT_STUDENT', retryable: false, remaining: 0 })
    for (const bad of ['<html>', '{}', JSON.stringify({ protocolVersion: 'chat-1', ok: true }), JSON.stringify({ protocolVersion: '1', ok: true, answer: 'x', remaining: 1, logged: true })]) expect(parseChatResponse(bad).ok).toBe(false)
    expect(await askChat('https://x', ask, (async () => { throw new Error('offline') }) as any)).toEqual({ ok: false, code: 'NETWORK', retryable: true })
  })
  test('오류 문구는 한국어로, 모르는 코드는 일반 문구', () => {
    expect(chatErrorMessage('CHAT_DISABLED')).toContain('꺼져')
    expect(chatErrorMessage('WHATEVER')).toContain('잠시 후')
  })
  test('굵은 글씨: **만 나누고 HTML은 만들지 않는다, 짝이 안 맞으면 표시만 지운다', () => {
    expect(splitBold('편차는 **(큰-작은)÷축중×100**으로')).toEqual([{ text: '편차는 ', bold: false }, { text: '(큰-작은)÷축중×100', bold: true }, { text: '으로', bold: false }])
    expect(splitBold('a **b')).toEqual([{ text: 'a b', bold: false }])
    expect(splitBold('<b>x</b>')).toEqual([{ text: '<b>x</b>', bold: false }])
  })
})

describe('chatStore', () => {
  test('대화 사본을 기기에 저장하고 시간순으로 읽는다', async () => {
    const base = { sessionCode: 'DEMO-ONLY', anonymousStudentCode: 'D-01', recordId: null, stepId: null, difficultyMode: 'guided', answer: 'a', serverLogged: true, chatId: 'c', errorCode: null }
    expect(await saveChatTurn({ ...base, id: '2', createdAt: '2026-10-28T02:00:00Z', turnIndex: 1, question: 'q2' })).toBe(true)
    expect(await saveChatTurn({ ...base, id: '1', createdAt: '2026-10-28T01:00:00Z', turnIndex: 0, question: 'q1' })).toBe(true)
    expect((await listChatTurns()).map((t) => t.question)).toEqual(['q1', 'q2'])
  })
})
