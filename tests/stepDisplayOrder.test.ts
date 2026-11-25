// 안내 없음의 작업 목록 순서 가리기(2026-11-24 MOON 결정, 요구사항 ST-04 "무안내에서는 정답 순서를 미리 알려주지 않는다").
// 안내 없음은 수행 번호(recordId)를 씨앗으로 섞은 순서로, 번호 없이 보인다. 안내 있음은 지금처럼 번호와 정답 순서.
import { createTaskRun } from '../src/domain/taskEngine'
import type { InspectionIssue } from '../src/domain/npcInspection'
import { describe, expect, test } from 'vitest'
import { chatStepIdFor, inspectionIssueOrder, shuffledSteps, stepIssueLabel, stepsForDisplay } from '../src/app/stepDisplayOrder'
import { brake, brakeToEnter, renderPanel, step, turn } from './helpers/recordRuns'

const ids = (s: ReadonlyArray<{ stepId: string }>) => s.map((x) => x.stepId)
const SEEDS = ['r1', '00000000-0000-4000-8000-000000000001', '3f2a9c1e-7b44-4d2a-9e10-5c6d7e8f9a0b', '', 'x']

describe('섞기 함수', () => {
  for (const task of [brake, turn]) {
    test(`${task.taskId}(${task.steps.length}단계): 같은 씨앗이면 같은 결과, 모든 단계가 한 번씩, 정답 순서와 다름`, () => {
      const correct = ids(task.steps)
      for (const seed of SEEDS) {
        const a = ids(shuffledSteps(task.steps, seed))
        expect(ids(shuffledSteps(task.steps, seed))).toEqual(a)
        expect([...a].sort()).toEqual([...correct].sort())
        expect(a).toHaveLength(correct.length)
        expect(a).not.toEqual(correct)
      }
    })
  }
  test('씨앗이 다르면 순서가 달라질 수 있다(여러 씨앗 가운데 둘 이상의 순서)', () => {
    const orders = new Set(SEEDS.map((s) => ids(shuffledSteps(brake.steps, s)).join(',')))
    expect(orders.size).toBeGreaterThan(1)
  })
  test('첫 단계(보호구)도 고정하지 않고 함께 섞는다(어느 씨앗에서는 첫 줄이 보호구가 아님)', () => {
    const firsts = new Set(Array.from({ length: 20 }, (_, i) => shuffledSteps(brake.steps, `seed-${i}`)[0]!.stepId))
    expect([...firsts].some((f) => f !== 'ppe')).toBe(true)
  })
  test('어떤 씨앗에서도 정답 순서가 나오지 않는다(2단계짜리도)', () => {
    const two = brake.steps.slice(0, 2)
    for (let i = 0; i < 200; i++) {
      expect(ids(shuffledSteps(two, `s${i}`))).toEqual(['tire', 'ppe'])
      expect(ids(shuffledSteps(turn.steps, `s${i}`))).not.toEqual(ids(turn.steps))
    }
  })
  test('단계 1개·0개면 그대로', () => {
    expect(ids(shuffledSteps(brake.steps.slice(0, 1), 'r1'))).toEqual(['ppe'])
    expect(shuffledSteps([], 'r1')).toEqual([])
  })
  test('원래 배열을 바꾸지 않는다', () => {
    const before = ids(brake.steps)
    shuffledSteps(brake.steps, 'r1')
    expect(ids(brake.steps)).toEqual(before)
  })
  test('안내 있음은 정답 순서 그대로, 안내 없음은 섞은 순서', () => {
    expect(ids(stepsForDisplay(brake.steps, 'guided', 'r1'))).toEqual(ids(brake.steps))
    expect(ids(stepsForDisplay(brake.steps, 'unguided', 'r1'))).toEqual(ids(shuffledSteps(brake.steps, 'r1')))
    expect(ids(stepsForDisplay(brake.steps, 'timedAssessment', 'r1'))).toEqual(ids(shuffledSteps(brake.steps, 'r1')))
  })
})

describe('NPC 검사의 미완료 단계 목록', () => {
  const issues: InspectionIssue[] = [
    ...brake.steps.map((s) => ({ kind: 'step' as const, stepId: s.stepId, reasonCode: 'STEP_NOT_COMPLETED' as const })),
    { kind: 'safety', conditionId: 's-exit', reasonCode: 'SAFETY_NOT_SATISFIED' },
    { kind: 'response', itemId: 'axleWeight', reasonCode: 'UNANSWERED' },
  ]
  test('안내 있음은 정답 순서 그대로, "N번 단계"', () => {
    const shown = stepsForDisplay(brake.steps, 'guided', 'r1')
    expect(inspectionIssueOrder(issues, shown)).toEqual(issues)
    expect(stepIssueLabel(brake.steps, 'axle', 'guided')).toBe('5번 단계')
  })
  test('안내 없음은 목록과 같은 섞인 순서, 번호 대신 단계 문구', () => {
    const shown = stepsForDisplay(brake.steps, 'unguided', 'r1')
    const ordered = inspectionIssueOrder(issues, shown)
    expect(ordered.filter((i) => i.kind === 'step').map((i) => (i as { stepId: string }).stepId)).toEqual(ids(shown))
    expect(ordered.slice(-2)).toEqual(issues.slice(-2))
    const label = stepIssueLabel(brake.steps, 'axle', 'unguided')
    expect(label).not.toMatch(/\d+번/)
    expect(label).toContain('축중')
  })
})

/** 작업 목록(<ol class="steps">)의 줄을 차례대로: 번호 칸과 단계 문구 */
function listRows(h: string): { num: string | null; text: string }[] {
  const ol = h.match(/<ol class="steps">([\s\S]*?)<\/ol>/)![1]!
  return [...ol.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => ({
    num: m[1]!.match(/<span class="num">([^<]*)<\/span>/)?.[1] ?? null,
    text: m[1]!.match(/<span class="text">([^<]*)/)![1]!,
  }))
}
const instr = (task: typeof brake) => task.steps.map((s) => s.instruction)

describe('과제 화면 작업 목록', () => {
  test('안내 있음: 지금처럼 번호와 정답 순서', () => {
    const rows = listRows(renderPanel(brakeToEnter('guided')))
    expect(rows.map((r) => r.text)).toEqual(instr(brake))
    expect(rows.map((r) => r.num)).toEqual(brake.steps.map((_, i) => String(i + 1)))
  })
  test('안내 없음: 번호 칸이 없고 정답 순서가 아님(제동력)', () => {
    const h = renderPanel(createTaskRun(brake, { difficultyMode: 'unguided' }))
    const rows = listRows(h)
    expect(h).not.toContain('class="num"')
    expect(rows.map((r) => r.num)).toEqual(rows.map(() => null))
    expect(rows.map((r) => r.text)).not.toEqual(instr(brake))
    expect([...rows.map((r) => r.text)].sort()).toEqual([...instr(brake)].sort())
    // 렌더 도우미의 수행 번호 'r1'을 씨앗으로 섞은 순서
    expect(rows.map((r) => r.text)).toEqual(shuffledSteps(brake.steps, 'r1').map((s) => s.instruction))
  })
  test('안내 없음: 최소회전반경도 번호 없이 섞인 순서', () => {
    const h = renderPanel(createTaskRun(turn, { difficultyMode: 'unguided' }))
    expect(h).not.toContain('class="num"')
    expect(listRows(h).map((r) => r.text)).not.toEqual(instr(turn))
  })
  test('안내 없음: 마친 단계는 그 자리에서 완료만 표시(자리를 옮기지 않음)', () => {
    const before = listRows(renderPanel(createTaskRun(brake, { difficultyMode: 'unguided' }))).map((r) => r.text)
    const r = step(createTaskRun(brake, { difficultyMode: 'unguided' }), 'ppe')
    const h = renderPanel(r)
    expect(listRows(h).map((x) => x.text)).toEqual(before)
    const ol = h.match(/<ol class="steps">([\s\S]*?)<\/ol>/)![1]!
    const lis = [...ol.matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/g)]
    const at = before.indexOf(brake.steps[0]!.instruction)
    expect(lis[at]![1]).toContain('class="done"')
    expect(lis[at]![2]).toContain('완료')
    expect(lis.filter((l) => (l[1] ?? '').includes('class="done"'))).toHaveLength(1)
  })
})

describe('AI 교관에 보내는 현재 단계', () => {
  test('안내 있음은 다음 단계를 그대로 보낸다', () => {
    expect(chatStepIdFor('guided', 's-03')).toBe('s-03')
    expect(chatStepIdFor('guided', null)).toBeNull()
  })
  test('안내 없음·그 밖의 방식은 보내지 않는다', () => {
    expect(chatStepIdFor('unguided', 's-03')).toBeNull()
    expect(chatStepIdFor('timedAssessment', 's-03')).toBeNull()
    expect(chatStepIdFor(undefined, 's-03')).toBeNull()
  })
})
