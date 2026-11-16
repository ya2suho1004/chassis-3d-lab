// 교사 화면 대화 점검에서 AI 정리 행 알아보기(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2-4 끝)
// 정리 행은 chat_logs의 prompt_version이 'debrief-'로 시작한다. 목록에 '수행 정리' 표시, CSV에 kind 열.
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { debriefAnswerText, isDebriefLog, toChatLogCsv, DEBRIEF_LOG_LABEL } from '../src/teacher/chatReview'
import { toChatCsv, CHAT_CSV_HEADER } from '../src/records/csv'
import type { ChatLogRecord } from '../src/teacher/serverAdmin'

const row = (o: Partial<ChatLogRecord>): ChatLogRecord => ({
  chat_id: 'c1', created_at: '2026-11-16T01:00:00Z', session_code: 'DEMO-ONLY', anonymous_student_code: 'D-01', record_id: 'rec-1', difficulty_mode: 'guided', step_id: null,
  turn_index: 0, status: 'answered', question_masked: '질문', answer: '답', masked_patterns: [], provider: 'gemini', model: 'm', model_version: null, prompt_version: 'chat-system-ko-0.4.1', latency_ms: 10, ...o,
})
const debrief = row({ chat_id: 'd1', question_masked: '[수행 요약]\n과제: 제동력 측정 및 판독', answer: JSON.stringify({ good: ['가.', '나.'], improve: [], hard: ['다.'] }), prompt_version: 'debrief-ko-0.1.0' })

describe('정리 행 알아보기', () => {
  test('prompt_version이 debrief-로 시작하면 수행 정리', () => {
    expect(DEBRIEF_LOG_LABEL).toBe('수행 정리')
    expect(isDebriefLog(debrief)).toBe(true)
    expect(isDebriefLog(row({}))).toBe(false)
    expect(isDebriefLog(row({ prompt_version: '0.3.0' }))).toBe(false)
  })
  test('정리 글(JSON)은 묶음 이름을 붙여 한 줄로, 읽을 수 없으면 원문 그대로', () => {
    expect(debriefAnswerText(debrief.answer)).toBe('잘한 점: 가. 나. · 보완할 점: (없음) · 어려웠던 점: 다.')
    expect(debriefAnswerText('{"good":')).toBe('{"good":')
    expect(debriefAnswerText(null)).toBeNull()
  })
  test('CSV: 지금 열 그대로 + 맨 끝 kind(대화·수행 정리)', () => {
    const rows = [row({}), debrief]
    const csv = toChatLogCsv(rows)
    const base = toChatCsv(rows as any)
    const lines = csv.replace('﻿', '').split('\r\n')
    const baseLines = base.replace('﻿', '').split('\r\n')
    expect(lines[0]).toBe([...CHAT_CSV_HEADER, 'kind'].join(','))
    expect(lines[1]).toBe(`${baseLines[1]},대화`)
    expect(lines[2]).toBe(`${baseLines[2]},수행 정리`)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
  })
  test('배선: 점검 목록은 정리 행에 표시를 달고, 대화 기록 CSV는 kind 열이 있는 것을 쓴다(prompt_version은 select=*로 이미 받음)', () => {
    const review = fs.readFileSync('src/screens/ChatReview.tsx', 'utf8')
    expect(review).toMatch(/isDebriefLog\(r\)/)
    expect(review).toContain('DEBRIEF_LOG_LABEL')
    expect(review).toMatch(/debriefAnswerText\(r\.answer\)/)
    const admin = fs.readFileSync('src/screens/ServerAdmin.tsx', 'utf8')
    expect(admin).toMatch(/toChatLogCsv\(rows\)/)
    expect(admin).not.toMatch(/toChatCsv\(/)
    const api = fs.readFileSync('src/teacher/serverAdmin.ts', 'utf8')
    expect(api).toMatch(/table: 'chat_logs', id: 'chat_id', select: '\*'/)
    expect(api).toMatch(/chat_logs\?select=\*&/)
  })
})
