// tests/icon.test.ts — 직접 그린 선 아이콘(설계 2026-11-06 §3: 이모지에 기대지 않음)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Icon, ICON_NAMES } from '../src/screens/Icon'

describe('Icon', () => {
  it.each(ICON_NAMES)('%s: 화면 낭독기에서 숨긴 24격자 SVG, 글자색을 따름', (name) => {
    const h = renderToStaticMarkup(createElement(Icon, { name }))
    expect(h).toMatch(/^<svg class="ico"/)
    expect(h).toContain('aria-hidden="true"')
    expect(h).toContain('viewBox="0 0 24 24"')
    expect(h).toContain('stroke="currentColor"')
    expect(h).toMatch(/<(path|rect|circle)/)
  })
  it('크기를 줄 수 있다', () => {
    expect(renderToStaticMarkup(createElement(Icon, { name: 'camera', size: 22 }))).toContain('width="22" height="22"')
  })
})

describe('게임 화면·캐릭터 만들기에 컬러 이모지가 다시 들어오지 않는다(태블릿 글꼴마다 다르게 보임)', () => {
  it.each(['src/screens/LabScreen.tsx', 'src/screens/AvatarScreen.tsx', 'src/screens/NpcDialog.tsx'])('%s', (f) => {
    expect(readFileSync(f, 'utf8')).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })
})
