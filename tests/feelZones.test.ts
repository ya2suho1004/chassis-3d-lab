// tests/feelZones.test.ts — 버튼 누름 소리의 허용 구역(설계 2026-11-12 §4.1): 표시를 단 구역의 버튼에서만 '딸깍'이 난다
import { describe, expect, it } from 'vitest'
import { isPressTarget } from '../src/app/feelZones'

/** 시험용 요소: 꼬리표(tag), data-feel 표시, 부모만 안다 */
class El {
  disabled = false
  constructor(readonly tag: string, readonly feel: string | null = null, readonly parent: El | null = null) {}
  closest(selector: string): El | null {
    for (let e: El | null = this; e; e = e.parent) {
      if (selector === 'button' ? e.tag === 'button' : selector === '[data-feel]' ? e.feel !== null : false) return e
    }
    return null
  }
  getAttribute(name: string): string | null { return name === 'data-feel' ? this.feel : null }
}

describe('isPressTarget', () => {
  const root = new El('main')
  const zone = new El('div', 'press', root)
  it('허용 구역 안의 버튼이면 참 — 버튼 안의 그림을 눌러도 같다', () => {
    const button = new El('button', null, zone)
    expect(isPressTarget(button)).toBe(true)
    expect(isPressTarget(new El('svg', null, button))).toBe(true)
  })
  it('버튼에 직접 표시를 달아도 된다', () => {
    expect(isPressTarget(new El('button', 'press', root))).toBe(true)
  })
  it('표시가 없는 곳의 버튼은 조용하다(새 화면을 더해도 표시를 달지 않으면 소리가 없다)', () => {
    expect(isPressTarget(new El('button', null, new El('div', null, root)))).toBe(false)
  })
  it('꺼진 버튼은 조용하다', () => {
    const off = new El('button', null, zone)
    off.disabled = true
    expect(isPressTarget(off)).toBe(false)
  })
  it('버튼이 아닌 곳(구역의 바탕, 글자)은 조용하다', () => {
    expect(isPressTarget(zone)).toBe(false)
    expect(isPressTarget(new El('p', null, zone))).toBe(false)
  })
  it('가장 가까운 표시가 정한다: 허용 구역 안에서도 none을 단 버튼은 조용하고, 그 반대는 난다', () => {
    expect(isPressTarget(new El('button', 'none', zone))).toBe(false)
    expect(isPressTarget(new El('button', null, new El('div', 'none', zone)))).toBe(false)
    expect(isPressTarget(new El('button', null, new El('div', 'press', new El('div', 'none', root))))).toBe(true)
  })
  it('누른 곳을 알 수 없으면 조용하다', () => {
    expect(isPressTarget(null)).toBe(false)
  })
})
