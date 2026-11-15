// 실제 수업 세션 연결(설계 docs/superpowers/specs/2026-11-03-class-sessions-design.md)
// 시연·리허설 세션은 스냅샷이 있고 서버가 받는다(가상 코드 D-xx만). 연구 세션은 IRB 승인 전 잠금 — 고를 수 없고 스냅샷도 없다.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import turn1 from '../src/data/tasks/task.min-turning-radius.case-lv1.json'
import snapshots from '../src/data/session/demo-snapshots.json'
import { createDemoSession, listTasks } from '../src/app/session'
import { SESSIONS, applySessionRules, selectableSession, sessionDef } from '../src/app/sessions'
import { parsePreset, caseKey } from '../src/app/teacherPreset'
import { buildRecordPayload } from '../src/domain/record'
import { attempt, createTaskRun } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'
import { handleSubmit, parseConfig, type NewRow, type SubmitStore } from '../supabase/functions/_shared/submitCore'

let n = 0
const aid = () => `50000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const reqOf = (p: unknown) => JSON.stringify({ protocolVersion: '1', payload: p })
function post(body: string) {
  const rows: NewRow[] = []
  const store: SubmitStore = {
    async findByRecordId(rid) { return rows.filter((r) => r.recordId === rid) },
    async insertIfAbsent(row) { if (rows.some((r) => r.recordId === row.recordId)) return 'exists'; rows.push(row); return 'inserted' },
    async countRows() { return rows.length },
  }
  return handleSubmit('text/plain', body, { store, config: () => parseConfig('2027-12-31T00:00:00Z', '50'), now: () => Date.parse('2026-11-03T05:00:00Z'), uuid: () => 'receipt-' + Math.random().toString(36).slice(2, 10) }).then((ack) => ({ ack, rows }))
}
function recordFor(sessionCode: string, code: string, task: ApprovedTask, usagePhase: 'preview' | 'review' | 'other', mode: 'guided' | 'unguided') {
  const session = createDemoSession({ studentCode: code, sessionCode, attemptRole: 'practice', usagePhase, vehicleEntryDirection: null, task, difficultyMode: mode })
  let run = createTaskRun(task, { difficultyMode: mode, displayMode: 'threeD' })
  run = attempt(run, { type: 'step', stepId: 'ppe' }, aid()).run
  return buildRecordPayload(run, session, { completedAtIso: new Date(run.startedAtMs + 5000).toISOString(), completionStatus: 'aborted' })
}

describe('세션 목록', () => {
  test('사용자 결정: 시연 1 + 수업용 2 + 리허설 3 + 연구 3(차시별), 연구는 잠금', () => {
    expect(SESSIONS.map((s) => s.code)).toEqual(['DEMO-ONLY', 'CLS-L12', 'CLS-L5', 'REH-L12', 'REH-L5', 'REH-USAB', 'EXP-L12', 'EXP-L5', 'USAB'])
    expect(SESSIONS.filter((s) => s.kind === 'research').every((s) => s.pending)).toBe(true)
    expect(selectableSession('REH-L5')).toBe(true)
    expect(selectableSession('EXP-L12')).toBe(false)
    expect(selectableSession('없는세션')).toBe(false)
  })
  test('수업용 세션(설계 2026-11-15 §3-1): 종류 class, 조건 CLS, 고를 수 있음, 연습은 도움 방식을 교사가 고르고 정리는 안내 없음 고정', () => {
    expect(sessionDef('CLS-L12')).toEqual({ code: 'CLS-L12', condition: 'CLS', kind: 'class', label: '수업 · 연습', usagePhase: 'preview', difficultyMode: null, pending: false })
    expect(sessionDef('CLS-L5')).toEqual({ code: 'CLS-L5', condition: 'CLS', kind: 'class', label: '수업 · 정리(안내 없음)', usagePhase: 'review', difficultyMode: 'unguided', pending: false })
    expect(selectableSession('CLS-L12')).toBe(true)
    expect(selectableSession('CLS-L5')).toBe(true)
    expect(applySessionRules('CLS-L12', { usagePhase: 'other', difficultyMode: 'unguided' })).toEqual({ usagePhase: 'preview', difficultyMode: 'unguided' })
    expect(applySessionRules('CLS-L12', { usagePhase: 'review', difficultyMode: 'guided' })).toEqual({ usagePhase: 'preview', difficultyMode: 'guided' })
    expect(applySessionRules('CLS-L5', { usagePhase: 'preview', difficultyMode: 'guided' })).toEqual({ usagePhase: 'review', difficultyMode: 'unguided' })
  })
  test('세션이 정한 차시·도움 방식으로 덮는다', () => {
    expect(applySessionRules('REH-L5', { usagePhase: 'preview', difficultyMode: 'guided' })).toEqual({ usagePhase: 'review', difficultyMode: 'unguided' })
    expect(applySessionRules('REH-USAB', { usagePhase: 'preview', difficultyMode: 'unguided' })).toEqual({ usagePhase: 'other', difficultyMode: 'unguided' })
    expect(applySessionRules('DEMO-ONLY', { usagePhase: 'review', difficultyMode: 'guided' })).toEqual({ usagePhase: 'review', difficultyMode: 'guided' })
  })
})

describe('스냅샷', () => {
  test('고를 수 있는 세션마다 모든 과제의 스냅샷이 있고, 연구 세션은 하나도 없다', () => {
    const tasks = listTasks()
    for (const s of SESSIONS) {
      const mine = snapshots.filter((x) => x.sessionCode === s.code)
      if (s.pending) { expect(mine).toHaveLength(0); continue }
      for (const t of tasks) expect(mine.some((x) => x.versions.taskDefinitionVersion === t.taskDefinitionVersion)).toBe(true)
      expect(mine.every((x) => x.classConditionCode === s.condition && x.runPurpose === 'demo')).toBe(true)
      if (s.usagePhase) expect(mine.every((x) => x.usagePhase === s.usagePhase)).toBe(true)
      if (s.difficultyMode) expect(mine.every((x) => x.difficultyMode === s.difficultyMode)).toBe(true)
    }
  })
  test('연구 세션으로는 세션을 만들 수 없다(스냅샷 없음)', () => {
    expect(() => createDemoSession({ studentCode: 'E-01', sessionCode: 'EXP-L12', attemptRole: 'practice', usagePhase: 'preview', task: lv1 as ApprovedTask, difficultyMode: 'guided' })).toThrow(/SNAPSHOT_NOT_FOUND/)
  })
})

describe('서버 접수(가짜 저장소)', () => {
  test('리허설 1~2차시·5차시·사용성 기록(가상 코드 D-xx)은 받는다', async () => {
    for (const [code, phase, mode, task] of [['REH-L12', 'preview', 'guided', lv1], ['REH-L5', 'review', 'unguided', turn1], ['REH-USAB', 'other', 'unguided', lv1]] as const) {
      const p = recordFor(code, 'D-07', task as unknown as ApprovedTask, phase, mode)
      expect(p.sessionCode).toBe(code)
      const { ack, rows } = await post(reqOf(p))
      expect(ack).toMatchObject({ ok: true })
      expect(rows[0]?.sessionCode).toBe(code)
    }
  })
  test('수업용 세션(연습·정리)은 학번 기록을 받는다(설계 2026-11-15 §3-2)', async () => {
    for (const [code, phase, mode, task] of [['CLS-L12', 'preview', 'guided', lv1], ['CLS-L12', 'preview', 'unguided', turn1], ['CLS-L5', 'review', 'unguided', lv1]] as const) {
      const p = recordFor(code, '2211', task as unknown as ApprovedTask, phase, mode)
      expect(p.sessionCode).toBe(code); expect(p.classConditionCode).toBe('CLS'); expect(p.runPurpose).toBe('demo'); expect(p.researchEligible).toBe(false)
      const { ack, rows } = await post(reqOf(p))
      expect(ack).toMatchObject({ ok: true })
      expect(rows[0]).toMatchObject({ sessionCode: code, anonymousStudentCode: '2211' })
    }
  })
  test('수업용 세션은 가상 코드(D-01)·학번 형식 밖 코드를 받지 않는다', async () => {
    for (const bad of ['D-01', '4101', '2200', 'A-01']) {
      const { ack, rows } = await post(reqOf(recordFor('CLS-L12', bad, lv1 as ApprovedTask, 'preview', 'guided')))
      expect(ack, bad).toMatchObject({ ok: false, code: 'SESSION_NOT_ALLOWED' })
      expect(rows).toHaveLength(0)
    }
  })
  test('시연·리허설 세션은 학번 기록을 받지 않는다(지금처럼 D-xx만)', async () => {
    for (const [code, phase, mode] of [['DEMO-ONLY', 'preview', 'guided'], ['REH-L12', 'preview', 'guided'], ['REH-L5', 'review', 'unguided'], ['REH-USAB', 'other', 'unguided']] as const) {
      const { ack, rows } = await post(reqOf(recordFor(code, '3999', lv1 as ApprovedTask, phase, mode)))
      expect(ack, code).toMatchObject({ ok: false, code: 'SESSION_NOT_ALLOWED' })
      expect(rows).toHaveLength(0)
    }
  })
  test('수업용 기록의 세션 코드만 시연으로 바꾸면 받지 않는다', async () => {
    const p = recordFor('CLS-L12', '2211', lv1 as ApprovedTask, 'preview', 'guided')
    const { ack } = await post(reqOf({ ...p, sessionCode: 'DEMO-ONLY', classConditionCode: 'DEMO' }))
    expect(ack).toMatchObject({ ok: false, code: 'SESSION_NOT_ALLOWED' })
  })
  test('리허설 세션에 실제 같은 코드(A-01)는 받지 않는다(가상 코드만)', async () => {
    const { ack } = await post(reqOf(recordFor('REH-L12', 'A-01', lv1 as ApprovedTask, 'preview', 'guided')))
    expect(ack).toMatchObject({ ok: false, code: 'SESSION_NOT_ALLOWED' })
  })
  test('세션 코드만 연구 세션으로 바꾼 기록은 받지 않는다', async () => {
    const p = recordFor('REH-L12', 'D-07', lv1 as ApprovedTask, 'preview', 'guided')
    const { ack } = await post(reqOf({ ...p, sessionCode: 'EXP-L12', classConditionCode: 'EXP' }))
    expect(ack).toMatchObject({ ok: false, code: 'SESSION_NOT_ALLOWED' })
  })
  test('리허설 5차시 스냅샷에 안내 있음 기록을 섞으면 받지 않는다', async () => {
    const guided = recordFor('REH-L12', 'D-07', lv1 as ApprovedTask, 'preview', 'guided')
    const l5 = createDemoSession({ studentCode: 'D-07', sessionCode: 'REH-L5', attemptRole: 'practice', usagePhase: 'review', task: lv1 as ApprovedTask, difficultyMode: 'unguided' })
    const { ack } = await post(reqOf({ ...guided, sessionCode: 'REH-L5', sessionSnapshotId: l5.sessionSnapshotId }))
    expect(ack).toMatchObject({ ok: false, code: 'SESSION_NOT_ALLOWED' })
  })
})

describe('교사 설정(이 기기)', () => {
  const ids = listTasks().map(caseKey)
  const base = { caseId: ids[0], usagePhase: 'preview', difficultyMode: 'guided', vehicleEntryDirection: null, locked: true }
  test('예전 저장값(세션 없음)은 시연 세션으로 읽는다', () => {
    expect(parsePreset(JSON.stringify(base), ids)?.sessionCode).toBe('DEMO-ONLY')
  })
  test('리허설 세션을 고르면 차시·도움 방식이 세션 값으로 고정된다', () => {
    expect(parsePreset(JSON.stringify({ ...base, sessionCode: 'REH-L5' }), ids)).toMatchObject({ sessionCode: 'REH-L5', usagePhase: 'review', difficultyMode: 'unguided' })
  })
  test('잠긴 연구 세션·모르는 세션 저장값은 버린다', () => {
    expect(parsePreset(JSON.stringify({ ...base, sessionCode: 'EXP-L12' }), ids)).toBeNull()
    expect(parsePreset(JSON.stringify({ ...base, sessionCode: 'X' }), ids)).toBeNull()
    expect(sessionDef('EXP-L12')?.pending).toBe(true)
  })
})

describe('서버 sessions 표 이관(설계 2026-11-15 §3-2, 적용은 §6 MOON 허락 뒤)', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.endsWith('_class_sessions.sql'))
  test('수업용 두 세션을 넣는 새 이관 파일이 있고, 기존 이관보다 뒤에 온다', () => {
    expect(file).toBeTruthy()
    expect(readdirSync(dir).sort().at(-1)).toBe(file)
  })
  test('조건 CLS, 연습은 1~2차시 흐름·정리는 5차시 흐름, 챗봇은 꺼진 채로, 이미 있으면 건드리지 않는다', () => {
    const sql = readFileSync(`${dir}/${file}`, 'utf8')
    expect(sql).toMatch(/\('CLS-L12', 'CLS', 'lesson1-2', false, \d+, \d+, true\)/)
    expect(sql).toMatch(/\('CLS-L5', 'CLS', 'lesson5', false, \d+, \d+, true\)/)
    expect(sql).toMatch(/on conflict \(session_code\) do nothing;/)
    expect(sql).not.toMatch(/\b(update|delete|drop|alter|grant|policy)\b/i)
  })
})
