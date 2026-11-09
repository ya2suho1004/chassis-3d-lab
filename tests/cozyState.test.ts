// tests/cozyState.test.ts — 따뜻한 공방 1단계 연출의 판단 로직과 일지 도장 노출
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { clearEffects, EMPTY_FX, isRequestPassed, NOD_SECONDS, nodAngle, resetFxIfIdle, shouldNodBeforeResult, shouldPopOnDone } from '../src/app/cozyState'
import { listTasks } from '../src/app/session'
import { requestCopy } from '../src/app/requests'
import { createTaskRun } from '../src/domain/taskEngine'
import { WorkLog } from '../src/screens/WorkLog'

describe('shouldPopOnDone (checkPop은 완료 단계가 늘 때만)', () => {
  it('늘면 발동', () => { expect(shouldPopOnDone(0, 1)).toBe(true); expect(shouldPopOnDone(2, 3)).toBe(true) })
  it('같으면 발동 안 함', () => { expect(shouldPopOnDone(2, 2)).toBe(false) })
  it('줄면 발동 안 함', () => { expect(shouldPopOnDone(3, 2)).toBe(false) })
  it('처음 마운트(0→0)는 발동 안 함', () => { expect(shouldPopOnDone(0, 0)).toBe(false) })
})

describe('isRequestPassed (도장·교관 한마디 조건)', () => {
  const ok = (r: string) => ({ ok: true as const, value: { npcInspectionResult: r } })
  it('completed + ok + passed 일 때만 true', () => {
    expect(isRequestPassed('completed', ok('passed'))).toBe(true)
    expect(isRequestPassed('completed', ok('needsCorrection'))).toBe(false)
    expect(isRequestPassed('completed', ok('incomplete'))).toBe(false)
    expect(isRequestPassed('aborted', ok('passed'))).toBe(false)
    expect(isRequestPassed('completed', { ok: false })).toBe(false)
  })
})

describe('fx 상태', () => {
  it('onAnimationEnd: 연출만 지우고 seq 유지', () => {
    expect(clearEffects({ effects: ['checkPop', 'tick'], seq: 3 })).toEqual({ effects: [], seq: 3 })
  })
  it('run이 null이면 초기화, 이미 비었으면 같은 객체', () => {
    expect(resetFxIfIdle({ effects: ['sparkle'], seq: 2 })).toEqual(EMPTY_FX)
    expect(resetFxIfIdle({ effects: [], seq: 2 })).toEqual(EMPTY_FX)
    expect(resetFxIfIdle(EMPTY_FX)).toBe(EMPTY_FX)
  })
})

describe('WorkLog 렌더', () => {
  const task = listTasks().find((t) => t.taskId === 'min-turning-radius')!
  const run = createTaskRun(task, { difficultyMode: 'guided' })
  const html = (passed: boolean) => renderToStaticMarkup(createElement(WorkLog, { run, passed }))
  it('passed=true: 도장과 교관 한마디', () => {
    const h = html(true)
    expect(h).toContain('wl-stamp')
    expect(h).toContain('의뢰 완료')
    expect(h).toContain('wl-closing')
    expect(h).toContain(requestCopy(task.taskId).closing)
  })
  it('passed=false: 도장·교관 한마디 없음', () => {
    const h = html(false)
    expect(h).not.toContain('wl-stamp')
    expect(h).not.toContain('wl-closing')
  })
})

describe('shouldNodBeforeResult (검사 통과 끄덕임은 저장된 완료 + 교관 곁 + 움직임 허용일 때만)', () => {
  const ok = { status: 'completed' as const, saveError: null, nearNpc: true, reducedMotion: false }
  it('모두 맞으면 끄덕임', () => { expect(shouldNodBeforeResult(ok)).toBe(true) })
  it('중단하고 끝내기는 끄덕이지 않음', () => { expect(shouldNodBeforeResult({ ...ok, status: 'aborted' })).toBe(false) })
  it('저장 실패면 바로 결과 화면(오류를 늦추지 않음)', () => { expect(shouldNodBeforeResult({ ...ok, saveError: 'FREEZE_FAILED' })).toBe(false) })
  it('교관에게서 멀면(서랍에서 검사) 바로 결과 화면', () => { expect(shouldNodBeforeResult({ ...ok, nearNpc: false })).toBe(false) })
  it('움직임 줄이기면 바로 결과 화면', () => { expect(shouldNodBeforeResult({ ...ok, reducedMotion: true })).toBe(false) })
})

describe('nodAngle (두 번 숙였다 드는 머리 각도)', () => {
  it('시작 전·끝난 뒤는 0', () => { expect(nodAngle(-0.1)).toBe(0); expect(nodAngle(0)).toBe(0); expect(nodAngle(NOD_SECONDS)).toBe(0); expect(nodAngle(NOD_SECONDS + 1)).toBe(0) })
  it('숙이는 방향(양수)만, 최대 0.3 rad 이하', () => {
    for (let t = 0; t <= NOD_SECONDS; t += 0.01) { const a = nodAngle(t); expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThanOrEqual(0.3 + 1e-9) }
  })
  it('두 번 숙임: 각 절반의 가운데가 꼭대기, 절반 경계에서 고개를 듦', () => {
    expect(nodAngle(NOD_SECONDS / 4)).toBeCloseTo(0.3, 5)
    expect(nodAngle((NOD_SECONDS * 3) / 4)).toBeCloseTo(0.3, 5)
    expect(nodAngle(NOD_SECONDS / 2)).toBeCloseTo(0, 5)
  })
})
