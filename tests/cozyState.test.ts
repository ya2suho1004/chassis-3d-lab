// tests/cozyState.test.ts — 따뜻한 공방 1단계 연출의 판단 로직과 일지 도장 노출
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { addEffects, dropExpired, EFFECT_MS, EMPTY_FX, isRequestPassed, nextExpiry, NOD_SECONDS, nodAngle, resetFxIfIdle, shouldNodBeforeResult, shouldPopOnDone, UNTIMED_EFFECTS } from '../src/app/cozyState'
import { EFFECTS } from '../src/app/reactions'
import { readFileSync } from 'node:fs'
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

describe('fx 상태(켜져 있는 연출: 이름 → 켠 차례 번호와 꺼질 시각)', () => {
  it('연출의 수명: 튐 0.5초, 반짝임 0.8초, 도감 꼬리표 1.6초', () => {
    expect(EFFECT_MS).toEqual({ checkPop: 500, sparkle: 800, codexPop: 500, codexChip: 1600 })
  })
  it('모든 연출은 수명 표나 "다른 곳이 맡는 연출" 목록 가운데 정확히 한쪽에 있다(새 연출을 더하고 어디에도 적지 않으면 말없이 안 나온다)', () => {
    expect(EFFECTS.length).toBeGreaterThan(0)
    for (const e of EFFECTS) expect(e in EFFECT_MS, e).toBe(!UNTIMED_EFFECTS.includes(e))
    expect([...UNTIMED_EFFECTS].sort()).toEqual(['confetti', 'stamp', 'tapRing'])
  })
  it('켜기: 차례 번호가 하나 오르고, 꺼질 시각은 지금 + 수명이다. 켜져 있던 다른 연출은 그대로다', () => {
    const a = addEffects(EMPTY_FX, ['sparkle'], 1000)
    expect(a).toEqual({ on: { sparkle: { seq: 1, until: 1800 } }, seq: 1 })
    expect(addEffects(a, ['checkPop'], 1100)).toEqual({ on: { sparkle: { seq: 1, until: 1800 }, checkPop: { seq: 2, until: 1600 } }, seq: 2 })
  })
  it('같은 연출을 다시 켜면 번호가 바뀌고 수명이 새로 시작한다(CSS 움직임을 처음부터 다시 건다)', () => {
    const a = addEffects(EMPTY_FX, ['checkPop'], 0)
    expect(addEffects(a, ['checkPop'], 250)).toEqual({ on: { checkPop: { seq: 2, until: 750 } }, seq: 2 })
  })
  it('한 번에 여럿을 켜면 같은 번호를 받는다', () => {
    expect(addEffects(EMPTY_FX, ['codexPop', 'codexChip'], 0)).toEqual({ on: { codexPop: { seq: 1, until: 500 }, codexChip: { seq: 1, until: 1600 } }, seq: 1 })
  })
  it('수명이 정해지지 않은 연출(3D 누름 고리, 결과 화면의 도장·종이 조각)은 담지 않는다. 켤 것이 없으면 같은 객체', () => {
    const a = addEffects(EMPTY_FX, ['sparkle'], 0)
    expect(addEffects(a, [], 10)).toBe(a)
    expect(addEffects(a, ['tapRing'], 10)).toBe(a)
    expect(addEffects(a, ['stamp', 'confetti'], 10)).toBe(a)
    expect(addEffects(EMPTY_FX, ['tapRing', 'checkPop'], 0)).toEqual({ on: { checkPop: { seq: 1, until: 500 } }, seq: 1 })
  })
  it('가장 먼저 꺼질 시각을 알려 준다(켜진 것이 없으면 null)', () => {
    expect(nextExpiry(EMPTY_FX)).toBeNull()
    expect(nextExpiry(addEffects(addEffects(EMPTY_FX, ['sparkle'], 1000), ['checkPop'], 1100))).toBe(1600)
  })
  it('수명이 다한 연출만 끄고 다른 연출과 seq는 그대로. 끌 것이 없으면 같은 객체', () => {
    const a = addEffects(addEffects(EMPTY_FX, ['sparkle'], 1000), ['checkPop'], 1100)
    expect(dropExpired(a, 1599)).toBe(a)
    expect(dropExpired(a, 1600)).toEqual({ on: { sparkle: { seq: 1, until: 1800 } }, seq: 2 })
    expect(dropExpired(a, 1800)).toEqual({ on: {}, seq: 2 })
  })
  it('끄는 것은 시간뿐이다 — CSS 움직임이 끝났다는 신호(animationend)에 기대지 않는다(요소가 화면에 없으면 그 신호가 오지 않는다)', () => {
    const lab = readFileSync('src/screens/LabScreen.tsx', 'utf8')
    expect(lab).not.toMatch(/onAnimationEnd=\{\(\) => setFx/)
    // 타이머: 가장 먼저 꺼질 시각에 울리고, 조금 일찍 울려도 그 연출은 반드시 끈다. 연출 상태가 바뀌거나 화면을 떠나면 앞 타이머를 거둔다
    expect(lab).toContain('    const at = nextExpiry(fx)\n    if (at === null) return\n    const t = setTimeout(() => {\n      const now = Math.max(performance.now(), at)\n      setFx((f) => dropExpired(f, now))\n    }, Math.max(0, at - performance.now()))\n    return () => clearTimeout(t)\n  }, [fx])')
    // 상태 갱신 함수 안에서 시각을 읽지 않는다(갱신 함수는 두 번 돌 수 있다)
    expect(lab).not.toMatch(/setFx\(\(f\) => [^\n]*performance\.now\(\)/)
  })
  it('연출의 수명은 그 CSS 움직임보다 길다(움직임이 끝나기 전에 끄지 않는다)', () => {
    const css = readFileSync('src/styles.css', 'utf8')
    const rules: Array<[keyof typeof EFFECT_MS, RegExp]> = [
      ['sparkle', /\.g-ppe\.spark \{[^}]*animation:g-spark ([\d.]+)s/],
      ['checkPop', /\.g-progress\.pop \{[^}]*animation:g-pop ([\d.]+)s|\.g-dots i\.new \{[^}]*animation:g-dot ([\d.]+)s/],
      ['codexPop', /\.g-codex\.pop \{[^}]*animation:g-pop ([\d.]+)s/],
    ]
    let found = 0
    for (const [e, re] of rules) {
      const m = re.exec(css)
      if (!m) continue // 뒤 과제에서 생기는 규칙
      found++
      expect(Number(m[1] ?? m[2]) * 1000, e).toBeLessThan(EFFECT_MS[e])
    }
    expect(found).toBeGreaterThanOrEqual(2)
  })
  it('run이 null이면 초기화, 이미 비었으면 같은 객체', () => {
    expect(resetFxIfIdle(addEffects(EMPTY_FX, ['sparkle'], 0))).toEqual(EMPTY_FX)
    expect(resetFxIfIdle({ on: {}, seq: 2 })).toEqual(EMPTY_FX)
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
