// 3일 차: 5차시 흐름 규칙, 교사 서버 연결(REST·로그인), 서버 CSV
import { describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import { lessonAttemptRole, lessonMode, LESSON_LABEL } from '../src/app/lesson'
import { CHAT_CSV_HEADER, serverRecordsToSummaryCsv, toChatCsv } from '../src/records/csv'
import { listChatLogs, ServerError, signIn, updateSession, isTeacher } from '../src/teacher/serverAdmin'
import { jcsCanonicalize } from '../supabase/functions/_shared/receiverCore.generated.js'

describe('5차시 흐름', () => {
  test('5차시 정리는 무안내·주수행으로 고정, 1~2차시·보조는 고른 방식·연습', () => {
    expect(lessonMode('review', 'guided')).toBe('unguided')
    expect(lessonAttemptRole('review')).toBe('primary')
    expect(lessonMode('preview', 'guided')).toBe('guided'); expect(lessonMode('preview', 'unguided')).toBe('unguided')
    expect(lessonAttemptRole('preview')).toBe('practice'); expect(lessonAttemptRole('other')).toBe('practice')
    expect(lessonMode('other', 'timedAssessment')).toBe('guided') // 시간제한 평가는 1차 비활성
    expect(LESSON_LABEL.review).toContain('5차시')
  })
})

describe('교사 서버 연결', () => {
  const cfg = { url: 'https://p.supabase.co', anonKey: 'ANON' }
  const auth = { accessToken: 'TOKEN', expiresAt: 0, email: 't@x' }
  test('로그인: 비밀번호 방식, 공개 키만, 실패는 LOGIN_FAILED', async () => {
    let seen: any
    const ok = await signIn(cfg, 't@x', 'pw', (async (u: string, i: any) => { seen = { u, i }; return new Response(JSON.stringify({ access_token: 'T', expires_in: 60, user: { email: 't@x' } })) }) as any, 1000)
    expect(seen.u).toBe('https://p.supabase.co/auth/v1/token?grant_type=password'); expect(seen.i.headers.apikey).toBe('ANON'); expect(JSON.parse(seen.i.body)).toEqual({ email: 't@x', password: 'pw' })
    expect(ok).toEqual({ accessToken: 'T', expiresAt: 61000, email: 't@x' })
    await expect(signIn(cfg, 't@x', 'bad', (async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as any)).rejects.toMatchObject({ code: 'LOGIN_FAILED' })
  })
  test('REST: 교사 토큰을 붙이고, 세션 코드는 주소에 안전하게 넣고, 401·403은 NOT_TEACHER', async () => {
    let seen: any
    await updateSession(cfg, auth, 'A&B', { chatbot_enabled: true }, (async (u: string, i: any) => { seen = { u, i }; return new Response('[]') }) as any)
    expect(seen.u).toBe('https://p.supabase.co/rest/v1/sessions?session_code=eq.A%26B'); expect(seen.i.method).toBe('PATCH')
    expect(seen.i.headers.Authorization).toBe('Bearer TOKEN'); expect(JSON.parse(seen.i.body).chatbot_enabled).toBe(true)
    await expect(listChatLogs(cfg, auth, 'X', (async () => new Response('{}', { status: 401 })) as any)).rejects.toBeInstanceOf(ServerError)
    expect(await isTeacher(cfg, auth, (async () => new Response('[]')) as any)).toBe(false)
  })
})

describe('서버 CSV', () => {
  test('대화 기록 CSV: BOM·고정 헤더·수식 방지·가림 종류 이어 붙임', () => {
    const csv = toChatCsv([{ created_at: 't', session_code: 'S', anonymous_student_code: 'D-01', record_id: null, difficulty_mode: 'guided', step_id: 'calc', turn_index: 0, status: 'answered', question_masked: '=HYPERLINK("x")', answer: '-위험', masked_patterns: ['phone', 'classroom'], provider: 'gemini', model: 'm', model_version: null, prompt_version: 'p', latency_ms: 12 }])
    const [head, row] = csv.replace('﻿', '').split('\r\n')
    expect(csv.startsWith('﻿')).toBe(true); expect(head).toBe(CHAT_CSV_HEADER.join(','))
    expect(row).toContain(`"'=HYPERLINK(""x"")"`); expect(row).toContain("'-위험"); expect(row).toContain('phone|classroom')
  })
  test('서버 수행 기록 CSV는 서버 접수번호·시각으로 기기 요약 CSV와 같은 열을 만든다', () => {
    const csv = serverRecordsToSummaryCsv([{ record_id: demo.payload.recordId, receipt_id: 'RCPT-12345678', accepted_at: '2026-10-28T08:04:45.042Z', payload_hash: 'a'.repeat(64), payload_json: jcsCanonicalize(demo.payload) }])
    expect(csv).toContain('RCPT-12345678'); expect(csv).toContain('2026-10-28T08:04:45.042Z'); expect(csv).toContain(demo.payload.recordId)
  })
})
