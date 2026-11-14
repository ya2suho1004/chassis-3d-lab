// 이어 하기 화면의 오늘 과제 줄(설계 2026-11-14-student-number-and-class-link §7, 독립 검토 뒤 고침).
// 끝내지 않은 수행이 있는 기기는 앱이 열리면 시작 화면을 건너뛴다. 새 수업 주소가 와도 학생이 차이를 알 수 있게 사실만 보인다(버리라고 권하지 않음).
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { resumeTodayLine, todayTask, todayTaskText } from '../src/app/todayTask'
import { caseKey, knownCaseIds, type TeacherPreset } from '../src/app/teacherPreset'
import { createDemoSession, listTasks } from '../src/app/session'
import { createTaskRun, serializeRun } from '../src/domain/taskEngine'
import { ResumeScreen } from '../src/screens/ResumeScreen'
import type { Draft } from '../src/records/repository'

const tasks = listTasks()
const preset: TeacherPreset = { sessionCode: 'DEMO-ONLY', caseId: caseKey(tasks[0]!), usagePhase: 'preview', difficultyMode: 'guided', vehicleEntryDirection: null }
const draftOf = (o: { sessionCode?: string; task?: number; usagePhase?: 'preview' | 'review' | 'other'; mode?: 'guided' | 'unguided'; code?: string } = {}): Draft => {
  const task = tasks[o.task ?? 0]!
  const mode = o.mode ?? 'guided'
  const session = createDemoSession({ studentCode: o.code ?? '2211', sessionCode: o.sessionCode ?? 'DEMO-ONLY', attemptRole: 'practice', usagePhase: o.usagePhase ?? 'preview', task, difficultyMode: mode })
  return { recordId: session.recordId, session, snapshot: serializeRun(createTaskRun(task, { difficultyMode: mode })), savedAt: '2026-11-14T05:00:00.000Z' }
}
const facts = (d: Draft) => ({ sessionCode: d.session.sessionCode, caseId: caseKey(d.snapshot.task), usagePhase: d.session.usagePhase, difficultyMode: d.snapshot.difficultyMode })

describe('오늘 과제 계산(시작 화면과 같은 규칙)', () => {
  test('교사 설정이 없으면 기본값', () => {
    const t = todayTask(null, tasks)
    expect(t).toMatchObject({ sessionCode: 'DEMO-ONLY', usagePhase: 'preview', difficultyMode: 'guided' })
    expect(t.task).toBe(tasks[0])
    expect(todayTaskText(t)).toBe(`${tasks[0]!.title} · 1~2차시 연습 · 안내 있음(견습)`)
  })
  test('5차시는 안내 없음, 세션이 정한 차시·도움 방식이 먼저', () => {
    expect(todayTask({ ...preset, usagePhase: 'review' }, tasks).difficultyMode).toBe('unguided')
    expect(todayTask({ ...preset, sessionCode: 'REH-L5', usagePhase: 'preview', difficultyMode: 'guided' }, tasks)).toMatchObject({ usagePhase: 'review', difficultyMode: 'unguided' })
  })
})

describe('이어 하기 — 오늘 과제와 다를 때만 한 줄', () => {
  test('교사 설정이 없으면 보이지 않는다', () => {
    expect(resumeTodayLine(facts(draftOf({ task: 2 })), null, tasks)).toBeNull()
  })
  test('같으면 보이지 않는다', () => {
    expect(resumeTodayLine(facts(draftOf()), preset, tasks)).toBeNull()
  })
  test('세션만 달라도 보인다', () => {
    expect(resumeTodayLine(facts(draftOf({ sessionCode: 'REH-L12' })), preset, tasks)).toBe(`오늘 과제(선생님이 정함) ${tasks[0]!.title} · 1~2차시 연습 · 안내 있음(견습)`)
  })
  test('과제 사례만 달라도 보인다', () => {
    expect(resumeTodayLine(facts(draftOf({ task: 1 })), preset, tasks)).toBe(`오늘 과제(선생님이 정함) ${tasks[0]!.title} · 1~2차시 연습 · 안내 있음(견습)`)
  })
  test('차시·도움 방식이 달라도 보인다', () => {
    const p5 = { ...preset, caseId: caseKey(tasks[2]!), usagePhase: 'review' as const }
    expect(resumeTodayLine(facts(draftOf({ task: 2 })), p5, tasks)).toBe(`오늘 과제(선생님이 정함) ${tasks[2]!.title} · 5차시 정리 · 안내 없음(정비사)`)
    expect(resumeTodayLine(facts(draftOf({ mode: 'unguided' })), preset, tasks)).not.toBeNull()
  })
  test('줄 글에는 버리라는 권유가 없다', () => {
    expect(resumeTodayLine(facts(draftOf({ task: 1 })), preset, tasks)).not.toMatch(/새 수행|버리|눌러|하세요/)
  })
})

describe('이어 하기 화면', () => {
  const render = (p: Partial<Parameters<typeof ResumeScreen>[0]>) => renderToStaticMarkup(createElement(ResumeScreen, { draft: draftOf({ task: 2, usagePhase: 'review', mode: 'unguided' }), onResume: () => {}, onDiscard: () => {}, ...p }))
  const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  test('수행 정보 줄에 차시가 들어간다', () => {
    expect(text(render({}))).toContain(`코드 2211 · ${tasks[2]!.title} · 5차시 정리 · 안내 없음`)
  })
  test('오늘 과제 줄과 주소 안내는 받은 것만 보이고, 버튼은 그대로', () => {
    const plain = text(render({}))
    expect(plain).not.toMatch(/오늘 과제|수업 주소/)
    const t = text(render({ todayLine: '오늘 과제(선생님이 정함) X · 1~2차시 연습 · 안내 있음(견습)', linkFailed: true }))
    expect(t).toContain('오늘 과제(선생님이 정함) X · 1~2차시 연습 · 안내 있음(견습)')
    expect(t).toContain('수업 주소를 읽지 못했어요. 선생님께 알려 주세요.')
    expect(t).toContain('이어서 하기')
    expect(t).toContain('새 수행 시작 (이 초안 버리기)')
  })
  test('앱이 이어 하기 화면에 오늘 과제 줄과 주소 안내를 넘긴다(저장된 교사 설정 또는 저장 못 한 주소 설정)', () => {
    const app = fs.readFileSync('src/App.tsx', 'utf8')
    expect(app).toMatch(/todayLine=\{resumeTodayLine\(\{ sessionCode: screen\.draft\.session\.sessionCode, caseId: caseKey\(screen\.draft\.snapshot\.task\), usagePhase: screen\.draft\.session\.usagePhase, difficultyMode: screen\.draft\.snapshot\.difficultyMode \}, screenPreset\(classLink, loadDevicePreset\), TASKS\)\}/)
    expect(app).toMatch(/const loadDevicePreset = \(\) => loadPreset\(knownCaseIds\(TASKS\)\)/)
    expect(app).toMatch(/linkFailed=\{classLink\?\.kind === 'bad'\}/)
  })
})

describe('과제 목록 맞추기', () => {
  test('사례 ID 목록은 빈 값을 거른다', () => {
    expect(knownCaseIds([...tasks, { ...tasks[0]!, measurement: { ...tasks[0]!.measurement, caseId: null } }])).toEqual(tasks.map(caseKey))
  })
  test('앱이 열릴 때 주소를 읽는 목록과 시작 화면 목록이 같은 함수를 쓴다', () => {
    expect(fs.readFileSync('src/main.tsx', 'utf8')).toMatch(/knownCaseIds\(listTasks\(\)\)/)
    expect(fs.readFileSync('src/screens/StartScreen.tsx', 'utf8')).toMatch(/knownCaseIds\(tasks\)/)
  })
})
