// 수업 자료 모으기 — 화면 연결(설계 docs/superpowers/specs/2026-11-15-class-records-design.md §3-3)
// 화면 시험 도구(jsdom)가 없어 그리기는 renderToStaticMarkup, 배선은 소스로 고정한다(지금 방식).
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { StartScreen } from '../src/screens/StartScreen'
import { ResultScreen } from '../src/screens/ResultScreen'
import { caseKey, PRESET_KEY, type TeacherPreset } from '../src/app/teacherPreset'
import { createDemoSession, listTasks } from '../src/app/session'
import { createTaskRun } from '../src/domain/taskEngine'
import { CLASS_SEND_TEXT, CLASS_START_NOTE } from '../src/delivery/autoSend'
import type { Repository } from '../src/records/repository'
import type { DeliveryEnvelope } from '../src/records/types'

const read = (p: string) => fs.readFileSync(p, 'utf8')
/** 주석을 뺀 코드(주석 낱말로 시험이 흔들리지 않게) */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const tasks = listTasks()
const withPreset = (p: Partial<TeacherPreset> | null) => {
  const store = new Map<string, string>()
  if (p) store.set(PRESET_KEY, JSON.stringify({ sessionCode: 'DEMO-ONLY', caseId: caseKey(tasks[0]!), usagePhase: 'preview', difficultyMode: 'guided', vehicleEntryDirection: null, ...p }))
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) })
}
afterEach(() => { vi.unstubAllGlobals() })

describe('시작 화면 — 수업용 세션 안내 한 줄', () => {
  const start = (autoSend: boolean) => text(renderToStaticMarkup(createElement(StartScreen, { repo: {} as Repository, onStart: async () => null, autoSend })))
  test('수업용 세션이고 전송 주소가 있으면 보인다(학번 입장)', () => {
    for (const s of ['CLS-L12', 'CLS-L5']) {
      withPreset({ sessionCode: s, usagePhase: s === 'CLS-L5' ? 'review' : 'preview', difficultyMode: s === 'CLS-L5' ? 'unguided' : 'guided' })
      const t = start(true)
      expect(t).toContain(CLASS_START_NOTE)
      expect(t).toMatch(/학번 네 자리/)
    }
  })
  test('시연·리허설 세션이나 전송 주소가 없는 빌드에서는 보이지 않는다', () => {
    withPreset({ sessionCode: 'DEMO-ONLY' }); expect(start(true)).not.toContain(CLASS_START_NOTE)
    withPreset({ sessionCode: 'REH-L12' }); expect(start(true)).not.toContain(CLASS_START_NOTE)
    withPreset({ sessionCode: 'CLS-L12' }); expect(start(false)).not.toContain(CLASS_START_NOTE)
  })
  test('안내 문구', () => { expect(CLASS_START_NOTE).toBe('마치면 수행 기록이 선생님께 보내져요.') })
})

describe('결과 화면 — 전송 상태 한 줄', () => {
  const session = createDemoSession({ studentCode: '2211', sessionCode: 'CLS-L12', attemptRole: 'practice', usagePhase: 'preview', task: tasks[0]!, difficultyMode: 'unguided' })
  const run = createTaskRun(tasks[0]!, { difficultyMode: 'unguided', displayMode: 'threeD' })
  const env: DeliveryEnvelope = { recordId: session.recordId, localSaveStatus: 'saved', uploadStatus: 'pending', uploadedAt: null, receiptId: null, payloadHash: null, uploadAttemptCount: 0, lastErrorCode: null, nextRetryAt: null }
  const result = (sendLine: string | null) => text(renderToStaticMarkup(createElement(ResultScreen, { session, run, completionStatus: 'aborted', envelope: env, saveError: null, onNextStudent: () => {}, sendLine })))
  test('줄이 오면 그 문구를 보이고, 교사가 보낸다는 안내 대신 기기에 남아 다시 보낸다고 알린다', () => {
    const t = result(CLASS_SEND_TEXT.notYet)
    expect(t).toContain(CLASS_SEND_TEXT.notYet)
    expect(t).not.toMatch(/교사가 교사 화면 ③ 수업 후에서 이 기기의 기록을 서버로 보냅니다/)
    expect(t).not.toMatch(/대기\(교사가 전송 전\)/)
  })
  test('줄이 없으면(시연·리허설) 지금 그대로', () => {
    const t = result(null)
    expect(t).toMatch(/교사가 교사 화면 ③ 수업 후에서 이 기기의 기록을 서버로 보냅니다/)
    for (const v of Object.values(CLASS_SEND_TEXT)) expect(t).not.toContain(v)
  })
  test('전송 상태 줄은 알림 영역(role=status)', () => {
    expect(read('src/screens/ResultScreen.tsx')).toMatch(/<span className="send-line" role="status">\{sendLine\}<\/span>/)
  })
})

describe('앱 배선 — 언제 보내는가', () => {
  const app = code('src/App.tsx')
  test('전송 주소가 있을 때만 자동 전송기를 만든다(주소 없는 빌드는 아무것도 하지 않음)', () => {
    expect(app).toMatch(/createAutoSender\(r, \(\) => \{ const url = getSubmitEndpoint\(\); return url \? \{ fetch: \(u, i\) => fetch\(u, i\), endpointUrl: url, now: \(\) => new Date\(\) \} : null \}\)/)
  })
  test('앱을 열 때(저장소를 연 뒤)와 인터넷이 다시 연결될 때 보낸다', () => {
    expect(app).toMatch(/setRepo\(r\)[\s\S]{0,400}void sendNow\(\)/)
    expect(app).toMatch(/window\.addEventListener\('online', onOnline\)/)
    expect(app).toMatch(/window\.removeEventListener\('online', onOnline\)/)
  })
  test('기록을 확정하면(기록 없이 하기가 아니고 이 기기에 저장됐으면) 보낸다', () => {
    expect(app).toMatch(/if \(!noRecord && envelope\) void sendNow\(\)/)
  })
  test('결과 화면 줄은 수업용 세션·기록 있는 수행·전송 주소가 있을 때만', () => {
    expect(app).toMatch(/sendLine=\{!screen\.noRecord && autoSendOn && isClassSession\(screen\.session\.sessionCode\) \? classSendLine\(screen\.envelope, screen\.sending\) : null\}/)
    expect(app).toMatch(/<StartScreen repo=\{repo!\} classLink=\{classLink\} autoSend=\{autoSendOn\}/)
  })
  test('보낸 뒤 결과 화면의 기록 상태를 이 기기 저장본으로 새로 읽는다', () => {
    expect(app).toMatch(/const stored = await r\.loadRecord\(cur\.session\.recordId\)/)
  })
  test('교사 화면 전송 버튼은 그대로 있다', () => {
    const tp = code('src/screens/TeacherPanel.tsx')
    expect(tp).toMatch(/processOutbox\(repo, \{ fetch: \(u, i\) => fetch\(u, i\), endpointUrl: endpoint, now: \(\) => new Date\(\) \}, \{ force \}\)/)
    expect(tp).toMatch(/대기 기록 지금 전송/)
    expect(tp).toMatch(/강제 재전송/)
  })
})
