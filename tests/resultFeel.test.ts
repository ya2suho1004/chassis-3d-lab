// tests/resultFeel.test.ts — 결과 화면의 통과 연출과 소리(설계 2026-11-12 §4.6·§4.7): 도장, 잉크 고리, 종이 조각 14개, 켠 채 넘어온 소리
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resultReaction } from '../src/app/reactions'
import { listTasks } from '../src/app/session'
import { createTaskRun } from '../src/domain/taskEngine'
import { WorkLog } from '../src/screens/WorkLog'

const read = (p: string) => readFileSync(p, 'utf8')
const task = listTasks().find((t) => t.taskId === 'min-turning-radius')!
const run = createTaskRun(task, { difficultyMode: 'guided' })
const html = (passed: boolean) => renderToStaticMarkup(createElement(WorkLog, { run, passed }))

describe('WorkLog — 통과 연출', () => {
  it('통과: 도장이 내려앉고 종이 조각 14개가 날린다(네모 7, 동그라미 7)', () => {
    const h = html(true)
    expect(h).toContain('<span class="wl-stamp anim">의뢰 완료</span>')
    const pieces = Array.from(h.matchAll(/<i class="(dot)?"/g))
    expect(pieces).toHaveLength(14)
    expect(pieces.filter((m) => m[1] === 'dot')).toHaveLength(7)
  })
  it('조각마다 자리·늦춤·길이·옆으로 흐르는 폭이 다르고, 늦춤과 길이를 더해도 1.5초를 넘지 않는다', () => {
    const h = html(true)
    const styles = Array.from(h.matchAll(/<i class="(?:dot)?" style="([^"]+)"/g), (m) => m[1] ?? '')
    expect(styles).toHaveLength(14)
    expect(new Set(styles).size).toBe(14)
    for (const s of styles) {
      const num = (re: RegExp) => Number(re.exec(s)?.[1])
      const left = num(/left:([\d.]+)%/), delay = num(/animation-delay:([\d.]+)s/), dur = num(/animation-duration:([\d.]+)s/), dx = num(/--dx:(-?[\d.]+)px/)
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left).toBeLessThanOrEqual(96)
      expect(delay + dur).toBeLessThanOrEqual(1.5 + 1e-9)
      expect(dur).toBeGreaterThanOrEqual(1)
      expect(Math.abs(dx)).toBeLessThanOrEqual(20)
    }
  })
  it('통과가 아니면 지금처럼 도장도 종이 조각도 없다', () => {
    const h = html(false)
    expect(h).not.toContain('wl-stamp')
    expect(h).not.toContain('wl-confetti')
  })
})

describe('WorkLog — 움직임 줄이기', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('통과: 도장은 찍혀 있고(정지 표시) 내려앉는 움직임과 종이 조각은 없다', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    const h = html(true)
    expect(h).toContain('>의뢰 완료</span>')
    expect(h).toContain('<span class="wl-stamp ">')
    expect(h).not.toContain('wl-stamp anim')
    expect(h).not.toContain('wl-confetti')
  })
})

describe('resultReaction — 결과 화면에서 낼 반응(값으로)', () => {
  const motion = { reducedMotion: false }
  it('통과가 아니면 아무것도 없다: 연출도 소리도(아쉬움을 알리는 소리는 넣지 않는다)', () => {
    expect(resultReaction(false, { ...motion, sound: true })).toBeNull()
    expect(resultReaction(false, { ...motion, sound: false })).toBeNull()
  })
  it('통과이고 소리를 켠 채 넘어왔으면 도장 소리(0.3초 뒤)와 축하음(0.55초 뒤)', () => {
    const r = resultReaction(true, { ...motion, sound: true })!
    expect(r.cues).toEqual([{ name: 'stamp', delay: 0.3 }, { name: 'celebrate', delay: 0.55 }])
    expect(r.effects).toEqual(['stamp', 'confetti'])
  })
  it('통과여도 소리가 꺼져 있으면 소리는 없고 연출만 있다', () => {
    const r = resultReaction(true, { ...motion, sound: false })!
    expect(r.cues).toEqual([])
    expect(r.effects).toEqual(['stamp', 'confetti'])
  })
  it('움직임 줄이기에서는 도장만 남는다. 소리는 움직임 줄이기와 무관하게 켬 상태만 따른다', () => {
    const r = resultReaction(true, { reducedMotion: true, sound: true })!
    expect(r.effects).toEqual(['stamp'])
    expect(r.cues.map((c) => c.name)).toEqual(['stamp', 'celebrate'])
  })
})

describe('결과 화면의 소리 — 켠 채 넘어왔을 때만, 화면이 뜰 때 한 번', () => {
  const log = read('src/screens/WorkLog.tsx')
  it('규칙표에 소리 켬을 넘기고, 규칙표가 준 소리를 그대로 낸다(도장 0.3초, 축하음 0.55초)', () => {
    expect(log).toContain('const reaction = useMemo(() => resultReaction(passed, { reducedMotion: prefersReducedMotion(), sound: !!sound?.enabled }), [passed, sound])')
    expect(log).toContain('for (const c of reaction.cues) sound.play(c.name, c.delay)')
    expect(log.match(/sound\.play\(/g)).toHaveLength(1)
  })
  it('통과가 아니면 소리를 부르지 않고, 다시 그려져도 한 번만 낸다', () => {
    expect(log).toContain('if (played.current || !reaction || !sound) return')
    expect(log).toContain('played.current = true')
    expect(log.match(/useEffect\(/g)).toHaveLength(1) // 소리를 내는 효과 하나뿐
  })
  it('앱이 결과 화면에 소리 엔진을 넘기고, 결과 화면이 정비 일지에 넘긴다', () => {
    expect(read('src/App.tsx')).toMatch(/<ResultScreen sound=\{sound\} /)
    expect(read('src/screens/ResultScreen.tsx')).toContain('<WorkLog run={run} passed={isRequestPassed(completionStatus, payload)} nickname={nickname} sound={sound} />')
  })
  it('결과 화면에는 배경 소음·회전음을 켜는 곳이 없다', () => {
    for (const f of ['src/screens/ResultScreen.tsx', 'src/screens/WorkLog.tsx']) expect(read(f)).not.toMatch(/setAmbience|setRollers|setEnabled/)
  })
})

describe('결과 화면의 모양', () => {
  const css = read('src/styles.css')
  it('도장이 내려앉을 때 잉크 고리가 한 번 퍼진다', () => {
    expect(css).toContain('.wl-stamp.anim::after {')
    expect(css).toMatch(/\.wl-stamp\.anim::after \{[^}]*animation:wl-ink \.45s ease-out \.3s both;[^}]*\}/)
  })
  it('종이 조각은 조각마다 옆으로 흐르고, 동그라미 모양이 있다', () => {
    expect(css).toContain('@keyframes wl-fall { to { transform:translate(var(--dx, 0), 160px) rotate(260deg); opacity:0 } }')
    expect(css).toContain('.wl-confetti i.dot { width:8px; height:8px; border-radius:50%; }')
  })
  it('움직임 줄이기에서는 도장·잉크 고리·종이 조각이 움직이지 않는다', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce) { .wl-stamp.anim, .wl-stamp.anim::after, .wl-confetti i { animation:none } }')
  })
})
