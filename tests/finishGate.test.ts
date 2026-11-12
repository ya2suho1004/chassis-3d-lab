// tests/finishGate.test.ts — 결과 화면으로 한 번만 넘기기(독립 검토 2026-11-07 1~3번)
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { createFinishGate } from '../src/app/finishGate'

type A = [string, 'completed' | 'aborted', string | null]
const setup = () => {
  const calls: A[] = []
  const gate = createFinishGate<A>((...a) => { calls.push(a) })
  return { calls, gate }
}

describe('finishGate — 결과 화면 요청은 처음 하나만', () => {
  it('끄덕임 없음: 바로 넘기고, 뒤 요청은 무시', () => {
    const { calls, gate } = setup()
    expect(gate.request(['run1', 'aborted', null], false)).toBe('now')
    expect(gate.request(['run2', 'completed', null], false)).toBe('ignored')
    expect(calls).toEqual([['run1', 'aborted', null]])
    expect(gate.nodding).toBe(false)
    expect(gate.closed).toBe(true)
  })
  it('끄덕임: complete 전까지 넘기지 않고, 그동안 닫혀 있음', () => {
    const { calls, gate } = setup()
    expect(gate.closed).toBe(false)
    expect(gate.request(['ok', 'completed', null], true)).toBe('nod')
    expect(calls).toEqual([])
    expect(gate.nodding).toBe(true)
    expect(gate.closed).toBe(true)
    expect(gate.complete()).toBe(true)
    expect(calls).toEqual([['ok', 'completed', null]])
    expect(gate.nodding).toBe(false)
  })
  it('끄덕임 중 재검사·중단(ALREADY_FROZEN 실패 결과)이 와도 첫 완료 결과가 그대로 간다', () => {
    const { calls, gate } = setup()
    gate.request(['ok', 'completed', null], true)
    expect(gate.request(['again', 'aborted', 'ALREADY_FROZEN'], false)).toBe('ignored')
    expect(gate.request(['again2', 'completed', 'ALREADY_FROZEN'], true)).toBe('ignored')
    gate.complete()
    expect(calls).toEqual([['ok', 'completed', null]])
  })
  it('말풍선 누름과 타이머가 겹쳐도 한 번만', () => {
    const { calls, gate } = setup()
    gate.request(['ok', 'completed', null], true)
    expect(gate.complete()).toBe(true)
    expect(gate.complete()).toBe(false)
    expect(calls).toHaveLength(1)
  })
  it('요청 없이 complete는 아무것도 하지 않음', () => {
    const { calls, gate } = setup()
    expect(gate.complete()).toBe(false)
    expect(calls).toEqual([])
  })
})

describe('화면 연결(소스 확인 — 컴포넌트 시험 도구가 없어 배선만 고정)', () => {
  const lab = fs.readFileSync('src/screens/LabScreen.tsx', 'utf8')
  const task = fs.readFileSync('src/screens/TaskScreen.tsx', 'utf8')
  it('LabScreen: 관문으로 결과 요청, 끄덕임 뒤엔 교관 누르기·대화창 막음, 말풍선에 초점', () => {
    expect(lab).toContain('gate.request(a, nod)')
    expect(lab).toContain("onNpcTap={() => { tapNpc(); if (!gate.closed) setNpcOpen(true) }}")
    expect(lab).toContain('{npcOpen && !gate.closed && (')
    expect(lab).toContain('ref={nodBtnRef}')
    expect(lab).toContain('{NOD_LINE}')
    expect(lab).not.toContain('좋아, 검사 통과야')
  })
  it('TaskScreen: finish는 한 번만, 그 뒤 초안 자동 저장·숨김 일시중지 안 함', () => {
    expect(task).toMatch(/if \(finishingRef\.current\) return\n\s+finishingRef\.current = true/)
    expect(task).toContain('if (run === initialRun || finishingRef.current) return')
    expect(task).toMatch(/const cur = runRef\.current\n\s+if \(finishingRef\.current\) return/)
  })
})
