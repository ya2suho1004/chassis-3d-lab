// tests/progressDots.test.ts — 진행 점 줄(설계 2026-11-12 §4.3): 끝난 수만큼 왼쪽부터 채우고, 새로 채워진 점만 튄다
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProgressDots } from '../src/screens/ProgressDots'

const html = (done: number, total: number, pop = false) => renderToStaticMarkup(createElement(ProgressDots, { done, total, pop }))
const dots = (h: string): string[] => Array.from(h.matchAll(/<i class="([^"]*)"><\/i>/g), (m) => m[1] ?? '')

describe('ProgressDots', () => {
  it('점은 단계 수만큼이고, 끝난 수만큼 왼쪽부터 채운다', () => {
    expect(dots(html(3, 12))).toEqual(['on', 'on', 'on', '', '', '', '', '', '', '', '', ''])
    expect(dots(html(0, 8))).toEqual(['', '', '', '', '', '', '', ''])
    expect(dots(html(8, 8))).toEqual(Array(8).fill('on'))
  })
  it('숫자를 옆에 두고, 화면 낭독에는 지금처럼 "3/12 단계 완료"로 읽힌다(점 줄은 낭독에서 뺀다)', () => {
    const h = html(3, 12)
    expect(h).toContain('<span class="g-dots" aria-hidden="true">')
    expect(h).toContain('<span class="g-count">3/12<span class="sr-only"> 단계 완료</span></span>')
  })
  it('끝난 수가 단계 수를 넘어도 마지막 점 하나만 튄다', () => {
    expect(dots(html(99, 4, true))).toEqual(['on', 'on', 'on', 'on new'])
  })
  it('새로 채워진 점 하나만 튄다', () => {
    expect(dots(html(3, 12, true))).toEqual(['on', 'on', 'on new', '', '', '', '', '', '', '', '', ''])
    expect(dots(html(3, 12, false)).filter((c) => c.includes('new'))).toEqual([])
  })
  it('끝난 것이 없으면 튈 점도 없다', () => {
    expect(dots(html(0, 12, true)).filter((c) => c.includes('new'))).toEqual([])
  })
  it('범위를 벗어난 수는 막는다', () => {
    expect(dots(html(99, 4))).toEqual(['on', 'on', 'on', 'on'])
    expect(dots(html(-2, 4))).toEqual(['', '', '', ''])
    expect(html(99, 4)).toContain('4/4')
  })
  it('점은 "몇 개 끝났는지"만 받는다 — 어느 단계인지, 도움 방식이 무엇인지는 받지 않는다(두 모드에서 같다)', () => {
    const src = readFileSync('src/screens/ProgressDots.tsx', 'utf8')
    expect(src).toContain('export function ProgressDots({ done, total, pop }: { done: number; total: number; pop: boolean })')
    expect(src).not.toMatch(/\bimport\b|\bfrom\s+['"]|\brequire\(/)
    expect(src).not.toMatch(/stepId|guided|mode/i)
  })
})

describe('진행 점 줄의 배선과 모양', () => {
  const lab = readFileSync('src/screens/LabScreen.tsx', 'utf8')
  const css = readFileSync('src/styles.css', 'utf8')
  it('의뢰 패널의 진행 줄을 점 줄로 그린다. 튐을 켜고 끄는 것은 연출 상태가 맡는다', () => {
    expect(lab).toContain('{run && ctx && <ProgressDots done={ctx.doneCount} total={ctx.total} pop={!!fx.on.checkPop} />}')
    expect(lab).not.toContain('단계 완료</p>')
    expect(lab).not.toContain('g-progress')
  })
  it('채운 점은 남색이다. 주황은 쓰지 않는다(안전 경고와 헷갈리지 않게)', () => {
    expect(css).toContain('.g-dots i.on { background:var(--wa-navy); border-color:var(--wa-navy); opacity:1; }')
    // 빈 점도 바탕과 구분된다(테두리의 불투명도 .85 — 크림 바탕에서 대비 3:1 이상). 단계가 많은 과제에서는 줄이 넘어간다
    expect(css).toContain('.g-dots i { width:8px; height:8px; border-radius:50%; box-sizing:border-box; border:1.5px solid currentColor; opacity:.85; }')
    expect(css).toContain('.g-dots { display:inline-flex; gap:4px; flex-wrap:wrap; }')
    const rules = css.split('\n').filter((l) => l.startsWith('.g-dots'))
    expect(rules.length).toBe(4)
    for (const l of rules) expect(l).not.toMatch(/orange|#f28c28|#b45f12/)
  })
  it('움직임 줄이기에서는 점이 튀지 않고 채워지기만 한다', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce) { .g-dots i.new { animation:none } }')
  })
  it('예전 글자 튐 규칙은 지운다', () => {
    expect(css).not.toContain('.g-progress.pop')
  })
})
