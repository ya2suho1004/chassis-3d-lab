// 도감 카드 줄(설계 docs/superpowers/specs/2026-11-16-codex-window-design.md §3-2): 배치 장비 + 모은 번호 → 카드 줄. 화면과 뗀 순수 함수.
import { describe, expect, test } from 'vitest'
import rawLayout from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { codexCards, codexCount } from '../src/app/codexList'

const eq = [
  { id: 'a', label: '가 장비', kind: 'bench', info: '가 설명', interactive: true },
  { id: 'b', label: '나 장비', kind: 'lift', info: '나 설명', interactive: false },
  { id: 'c', label: '다 장비', kind: 'panel', info: '다 설명', interactive: true },
]

describe('카드 줄', () => {
  test('배치 순서 그대로, 모은 순서와 상관없이 자리가 고정된다', () => {
    expect(codexCards(eq, ['c', 'a']).map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(codexCards(eq, ['a', 'c']).map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(codexCards(eq, []).map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })
  test('모은 장비는 종류·이름·설명(설명은 장비 카드의 글 그대로)', () => {
    expect(codexCards(eq, ['b'])[1]).toEqual({ id: 'b', seen: true, kind: 'lift', label: '나 장비', info: '나 설명' })
  })
  test('못 본 장비는 이름·설명·종류를 싣지 않는다(화면에 새어 나갈 길이 없다)', () => {
    const c = codexCards(eq, ['b'])[0]!
    expect(c).toEqual({ id: 'a', seen: false })
    expect(Object.keys(c).sort()).toEqual(['id', 'seen'])
  })
  test('과제와 관련된 값(작동 장비 표시 등)은 카드에 싣지 않는다', () => {
    for (const c of codexCards(eq, ['a', 'b', 'c'])) expect(Object.keys(c).sort()).toEqual(['id', 'info', 'kind', 'label', 'seen'])
  })
  test('배치에 없는 번호는 무시한다', () => {
    expect(codexCards(eq, ['zz', 'a']).filter((c) => c.seen).map((c) => c.id)).toEqual(['a'])
  })
})

describe('머리 숫자', () => {
  test('배치에 있는 모은 장비 수 / 배치 장비 수(겹친 번호·모르는 번호는 세지 않는다)', () => {
    expect(codexCount(eq, ['a', 'a', 'zz', 'c'])).toEqual({ have: 2, total: 3 })
    expect(codexCount(eq, [])).toEqual({ have: 0, total: 3 })
  })
})

describe('지금 배치 자료로', () => {
  const layout = loadSceneLayout(rawLayout)
  test('23장, 배치 순서', () => {
    const cards = codexCards(layout.equipment, [])
    expect(cards).toHaveLength(23)
    expect(cards.map((c) => c.id)).toEqual(layout.equipment.map((e) => e.id))
    expect(cards.every((c) => !c.seen)).toBe(true)
  })
})
