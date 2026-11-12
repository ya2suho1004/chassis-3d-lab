// 게임 화면 겹침 측정(2026-11-10, Codex 회의 지적 10): CSS 글자 대신 실제 화면의 상자 위치로 잰다.
// 11-09 겹침 수정은 CSS 글자만 확인해 계기 버튼과 질문 버튼의 겹침을 놓쳤다. 측정 대상이 빠지지 않게 목록을 CSS와 맞춰 본다.
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { ARROW_PART_NAME, findOverlaps, HUD_EXCLUDED, HUD_PARTS, hudBoxes, measureHud, type Box } from '../src/app/hudLayout'

const box = (name: string, left: number, top: number, right: number, bottom: number): Box => ({ name, left, top, right, bottom })

describe('겹침 계산', () => {
  test('겹친 넓이와 높이를 이름과 함께 돌려준다', () => {
    expect(findOverlaps([box('가', 0, 0, 100, 50), box('나', 80, 40, 200, 90)])).toEqual([{ a: '가', b: '나', width: 20, height: 10 }])
  })
  test('맞닿기만 하면 겹침이 아니다', () => {
    expect(findOverlaps([box('가', 0, 0, 100, 50), box('나', 100, 0, 200, 50)])).toEqual([])
    expect(findOverlaps([box('가', 0, 0, 100, 50), box('나', 0, 50, 100, 90)])).toEqual([])
  })
  test('셋 이상이면 모든 짝을 본다', () => {
    const r = findOverlaps([box('가', 0, 0, 100, 100), box('나', 50, 50, 150, 150), box('다', 90, 90, 120, 120)])
    expect(r.map((o) => `${o.a}-${o.b}`)).toEqual(['가-나', '가-다', '나-다'])
  })
})

describe('화면 측정', () => {
  const el = (rect: Partial<DOMRect>, hidden = false) => ({
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect }),
    closest: (sel: string) => (sel === '[hidden]' && hidden ? {} : null),
  })
  const root = (map: Record<string, unknown[]>) => ({ querySelectorAll: (sel: string) => map[sel] ?? [] }) as unknown as ParentNode

  test('보이는 부품만 재고, 숨긴 것과 크기 0은 뺀다', () => {
    const r = measureHud(root({
      '.g-chatbtn': [el({ left: 196, top: 600, right: 366, bottom: 645, width: 170, height: 45 })],
      '.g-gaugebtn': [el({ left: 318, top: 600, right: 448, bottom: 645, width: 130, height: 45 })],
      '.g-hud': [el({ left: 200, top: 650, right: 560, bottom: 700, width: 360, height: 50 }, true)],
      '.g-ttbar': [el({})],
    }), { innerWidth: 767, innerHeight: 736 })
    expect(r.boxes.map((b) => b.name)).toEqual(['질문 버튼', '가운데 버튼'])
    expect(r.overlaps).toEqual([{ a: '질문 버튼', b: '가운데 버튼', width: 48, height: 45 }])
    expect(r.viewport).toEqual({ width: 767, height: 736 })
  })
  test('hudBoxes: 겹침을 따지지 않고 보이는 부품의 상자만 돌려준다(목적지 방향 화살표의 띠를 만드는 데 쓴다)', () => {
    const b = hudBoxes(root({
      '.g-status': [el({ left: 12, top: 12, right: 660, bottom: 60, width: 648, height: 48 })],
      '.g-quest': [el({ left: 928, top: 12, right: 1268, bottom: 235, width: 340, height: 223 }, true)],
      '.g-goalarrow': [el({ left: 1194, top: 378, right: 1238, bottom: 422, width: 44, height: 44 })],
    }))
    expect(b).toEqual([{ name: '상태 줄', left: 12, top: 12, right: 660, bottom: 60 }, { name: ARROW_PART_NAME, left: 1194, top: 378, right: 1238, bottom: 422 }])
  })
})

describe('측정 대상 목록', () => {
  const css = fs.readFileSync('src/styles.css', 'utf8')
  const absolute = [...css.matchAll(/^(\.(?:g-[a-z0-9-]+|joystick)[^{]*)\{[^}]*position:\s*absolute/gm)]
    .flatMap((m) => m[1]!.split(',').map((s) => s.trim()))
  const listed = new Set([...HUD_PARTS.map((p) => p.selector), ...Object.keys(HUD_EXCLUDED)])

  test('화면 위에 떠 있는 게임 부품은 모두 재거나, 빼는 이유가 적혀 있다', () => {
    expect(absolute.length).toBeGreaterThan(10)
    expect(absolute.filter((s) => !listed.has(s))).toEqual([])
  })
  test('11-09에 놓친 계기 버튼·질문 버튼·안내 줄을 잰다', () => {
    const parts = HUD_PARTS.map((p) => p.selector)
    for (const s of ['.g-gaugebtn', '.g-chatbtn', '.g-hud', '.joystick', '.g-actions', '.g-status', '.g-quest', '.g-ttbar']) expect(parts).toContain(s)
  })
  test('목적지 방향 화살표도 함께 떠 있는 부품이다 — 다른 부품과 겹치면 측정에 잡힌다', () => {
    expect(HUD_PARTS.find((p) => p.selector === '.g-goalarrow')).toEqual({ name: ARROW_PART_NAME, selector: '.g-goalarrow' })
    expect(ARROW_PART_NAME).toBe('방향 화살표')
  })
  test('빼는 것에는 이유가 있다', () => {
    for (const [s, why] of Object.entries(HUD_EXCLUDED)) expect(why.length, s).toBeGreaterThan(5)
  })
})

describe('개발 화면에서 부르기', () => {
  test('개발 서버에서만 window.__hudOverlaps를 단다(운영 빌드에는 없음)', () => {
    const main = fs.readFileSync('src/main.tsx', 'utf8')
    expect(main).toMatch(/if \(import\.meta\.env\.DEV\)[^\n]*import\('\.\/app\/hudLayout'\)/)
    expect(main).toMatch(/__hudOverlaps/)
  })
})
