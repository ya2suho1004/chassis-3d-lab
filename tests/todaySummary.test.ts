// C1(Codex 회의 2026-11-08): 교사 화면 '오늘 수업 설정' 한 장 요약 — 기기 설정과 서버 AI 상태를 한곳에.
// 표시만 한다(새로 모으는 자료 없음, 서버 조회도 새로 하지 않고 로그인 때 받은 세션 목록만 씀).
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import turn1 from '../src/data/tasks/task.min-turning-radius.case-lv1.json'
import { todaySummary } from '../src/app/todaySummary'
import type { TeacherPreset } from '../src/app/teacherPreset'
import type { SessionRow } from '../src/teacher/serverAdmin'
import type { ApprovedTask } from '../src/domain/types'

const tasks = [lv1, turn1] as ApprovedTask[]
const preset: TeacherPreset = { sessionCode: 'REH-L12', caseId: lv1.measurement.caseId!, usagePhase: 'preview', difficultyMode: 'guided', vehicleEntryDirection: 'north', locked: true }
const row = (p: Partial<SessionRow> = {}): SessionRow => ({ session_code: 'REH-L12', class_condition_code: 'REH', lesson_flow: 'lesson1-2', chatbot_enabled: true, chat_cap_per_student: 10, chat_daily_cap: 500, active: true, ...p })
const val = (r: ReturnType<typeof todaySummary>, label: string) => r.rows.find((x) => x.label === label)?.value

describe('오늘 수업 설정 요약', () => {
  it('저장된 설정을 한 장으로 보인다', () => {
    const r = todaySummary({ preset, form: preset, tasks, server: { configured: true, loggedIn: true, session: row() }, counts: { records: 3, outbox: 1 } })
    expect(val(r, '세션')).toBe('REH-L12 · 리허설 · 1~2차시 연습(안내 있음)')
    expect(val(r, '과제 사례')).toBe(lv1.title)
    expect(val(r, '차시')).toBe('1~2차시 연습')
    expect(val(r, '도움 방식')).toBe('안내 있음(견습)')
    expect(val(r, '차량 진입')).toBe('북쪽 진입')
    expect(val(r, '학생 변경')).toBe('막음 — 익명 코드만 입력')
    expect(val(r, 'AI 교관')).toBe('켜짐 · 학생 1인 하루 질문 10회')
    expect(val(r, '이 기기 기록')).toBe('확정 3건 · 전송 대기 1건')
    expect(r.rows.find((x) => x.label === '이 기기 기록')?.tone).toBe('warn')
    expect(r.warnings).toEqual([])
  })

  it('5차시는 안내 없음으로 보인다(세션·고정 규칙과 같게)', () => {
    const p = { ...preset, sessionCode: 'DEMO-ONLY', usagePhase: 'review' as const, difficultyMode: 'guided' as const }
    expect(val(todaySummary({ preset: p, form: p, tasks, server: { configured: true, loggedIn: false, session: undefined }, counts: null }), '도움 방식')).toBe('안내 없음(정비사)')
  })

  it('저장된 설정이 없으면 학생이 직접 고른다고 알린다', () => {
    const r = todaySummary({ preset: null, form: preset, tasks, server: { configured: true, loggedIn: false, session: undefined }, counts: null })
    expect(val(r, '설정')).toBe('저장된 설정 없음 — 학생이 시작 화면에서 직접 고름')
    expect(r.rows.find((x) => x.label === '설정')?.tone).toBe('warn')
  })

  it('서버 AI 상태: 미설정·미로그인·세션 없음·꺼짐·비활성', () => {
    const s = (server: Parameters<typeof todaySummary>[0]['server']) => val(todaySummary({ preset, form: preset, tasks, server, counts: null }), 'AI 교관')
    expect(s({ configured: false, loggedIn: false, session: undefined })).toBe('서버 주소 없음(이 판은 AI 교관을 쓰지 않음)')
    expect(s({ configured: true, loggedIn: false, session: undefined })).toBe('교사 로그인하면 보임(② 수업 중)')
    expect(s({ configured: true, loggedIn: true, session: null })).toBe('서버에 이 세션이 없음')
    expect(s({ configured: true, loggedIn: true, session: row({ chatbot_enabled: false }) })).toBe('꺼짐')
    expect(s({ configured: true, loggedIn: true, session: row({ active: false }) })).toBe('켜짐 · 학생 1인 하루 질문 10회 · 세션 비활성')
  })

  it('학생 변경 허용·저장 안 한 변경·서버 차시 불일치를 경고한다', () => {
    const open = { ...preset, locked: false }
    const r = todaySummary({ preset: open, form: { ...open, vehicleEntryDirection: 'south' }, tasks, server: { configured: true, loggedIn: true, session: row({ lesson_flow: 'lesson5' }) }, counts: { records: 0, outbox: 0 } })
    expect(r.rows.find((x) => x.label === '학생 변경')).toMatchObject({ value: '허용 — 학생이 바꿀 수 있음', tone: 'warn' })
    expect(r.warnings).toEqual([
      '아래에서 바꾼 설정이 아직 저장되지 않았습니다. ‘설정 저장’을 눌러야 학생 화면에 적용됩니다.',
      '서버의 이 세션은 5차시 정리인데, 이 기기 차시는 1~2차시 연습입니다.',
    ])
    expect(r.rows.find((x) => x.label === '이 기기 기록')?.tone).toBeUndefined()
  })

  it('교사 화면 맨 위(탭 위)에 붙는다', () => {
    const src = fs.readFileSync('src/screens/TeacherPanel.tsx', 'utf8')
    expect(src).toMatch(/<TodaySummary /)
    expect(src.indexOf('<TodaySummary ')).toBeLessThan(src.indexOf('className="tp-tabs"'))
  })
})
