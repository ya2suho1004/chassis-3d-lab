// G1(2026-11-08 Codex 회의): 안내 없음에서 최초 답을 다 적기 전 NPC 검사를 받아도 적은 칸의 정오가 드러나면 안 된다.
// 승인된 정책(feedbackPolicy afterAllFirstResponses)을 NPC 검사 표시에도 적용한다. 검사 자체·횟수·사건 기록은 그대로.
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createTaskRun, attempt, submitResponse, type TaskRun } from '../src/domain/taskEngine'
import { inspectPerformance, visibleInspection } from '../src/domain/npcInspection'
import type { ApprovedTask } from '../src/domain/types'

const task = lv1 as ApprovedTask
let n = 0
const aid = () => `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const deps = { now: () => Date.now(), newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }

/** 축중만 적은 상태까지 진행(왼쪽·오른쪽·편차·합·판정은 미응답) */
function upToAxle(mode: 'guided' | 'unguided', axle: string): TaskRun {
  let s = createTaskRun(task, { difficultyMode: mode }, deps)
  s = attempt(s, { type: 'step', stepId: 'ppe' }, aid()).run
  s = attempt(s, { type: 'confirmSafety', conditionId: 's-engine' }, aid()).run
  for (const id of ['tire', 'equip', 'enter']) s = attempt(s, { type: 'step', stepId: id }, aid()).run
  return submitResponse(s, 'axleWeight', axle, aid()).run
}

const responseLines = (v: ReturnType<typeof visibleInspection>) => v.issues.filter((i) => i.kind === 'response').map((i) => `${i.kind === 'response' ? i.itemId : ''}:${i.reasonCode}`)

describe('NPC 검사 표시 — 최초 답 보호(G1)', () => {
  test('안내 없음·최초 답 미완료: 적은 칸의 정오를 숨기고 미응답만 보인다', () => {
    const wrong = upToAxle('unguided', '999')
    const r = inspectPerformance(wrong)
    expect(r.issues.some((i) => i.kind === 'response' && i.itemId === 'axleWeight' && i.reasonCode === 'FINAL_INCORRECT')).toBe(true) // 내부 검사는 그대로
    const v = visibleInspection(r.run, r.issues)
    expect(v.answersLocked).toBe(true)
    expect(responseLines(v).every((l) => l.endsWith(':UNANSWERED'))).toBe(true)
    expect(responseLines(v).some((l) => l.startsWith('axleWeight:'))).toBe(false)
  })

  test('미응답이 같으면 적은 답이 맞든 틀리든 표시가 똑같다(건수 포함)', () => {
    const a = upToAxle('unguided', '999')
    const b = upToAxle('unguided', String(task.measurement.axleWeight))
    const ra = inspectPerformance(a)
    const rb = inspectPerformance(b)
    expect(ra.issues.length).not.toBe(rb.issues.length) // 숨기지 않으면 건수로도 드러난다
    const va = visibleInspection(ra.run, ra.issues)
    const vb = visibleInspection(rb.run, rb.issues)
    expect(va).toEqual(vb)
  })

  test('안전·단계 문제는 숨기지 않는다', () => {
    const r = inspectPerformance(upToAxle('unguided', '999'))
    const v = visibleInspection(r.run, r.issues)
    expect(v.issues.filter((i) => i.kind === 'step')).toEqual(r.issues.filter((i) => i.kind === 'step'))
    expect(v.issues.filter((i) => i.kind === 'safety')).toEqual(r.issues.filter((i) => i.kind === 'safety'))
  })

  test('안내 있음이면 그대로 다 보인다', () => {
    const r = inspectPerformance(upToAxle('guided', '999'))
    const v = visibleInspection(r.run, r.issues)
    expect(v.answersLocked).toBe(false)
    expect(v.issues).toEqual(r.issues)
  })

  test('검사 횟수와 npcInspected 사건은 숨김과 관계없이 기록된다', () => {
    const r = inspectPerformance(upToAxle('unguided', '999'))
    expect(r.run.npcInspectionCount).toBe(1)
    expect(r.run.events.at(-1)?.type).toBe('npcInspected')
  })

  test('화면은 원래 결과가 아니라 보이는 결과를 쓴다(게임 화면 교관 검사도 같은 함수)', () => {
    const src = fs.readFileSync('src/screens/TaskScreen.tsx', 'utf8')
    expect(src).toMatch(/visibleInspection\(r\.run, r\.issues\)/)
    expect(src).not.toMatch(/setInspection\(\{ result: r\.result, issues: r\.issues \}\)/)
  })
})
