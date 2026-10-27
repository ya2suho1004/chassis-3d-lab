import { describe, expect, test } from 'vitest'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { buildSurveyItems, buildSurveyResult, emptySurveyDraft, parseLength, surveyProgress } from '../src/review/layoutSurvey'

const layout = loadSceneLayout(raw)
const items = buildSurveyItems(layout)

describe('3D 배치 실측 입력', () => {
  test('실습장 전체 → 기둥 → 리프트 → 그 밖의 장비 → 제동력 구역 순서, 시험 차량은 빠진다', () => {
    expect(items[0]!.itemId).toBe('room')
    const pri = items.map((i) => i.priority)
    expect([...pri].sort((a, b) => a - b)).toEqual(pri)
    expect(items.filter((i) => i.priority === 2)).toHaveLength(4)
    expect(items.filter((i) => i.priority === 3)).toHaveLength(3)
    expect(items.find((i) => i.itemId === 'brake-vehicle-01')).toBeUndefined()
    expect(items.find((i) => i.itemId === 'brake-tester-01')?.priority).toBe(5)
  })

  test('지금 3D 값: 제동력 시험기 북쪽 끝은 북쪽 벽에서 7.60, 동쪽 끝은 동쪽 벽에서 0.50(실측 8.20−0.60, 2.00−1.50)', () => {
    const t = items.find((i) => i.itemId === 'brake-tester-01')!
    expect(t.current.northGap).toBeCloseTo(7.6, 2)
    expect(t.current.eastGap).toBeCloseTo(0.5, 2)
    expect(t.current.sizeEW).toBeCloseTo(3.0, 2)
  })

  test('길이 입력 검사: 빈칸·쉼표 소수·벽에 붙음(0)·오타', () => {
    expect(parseLength('', 'sizeEW')).toEqual({ ok: true, value: null })
    expect(parseLength(' 2,35 ', 'sizeEW')).toEqual({ ok: true, value: 2.35 })
    expect(parseLength('0', 'northGap')).toEqual({ ok: true, value: 0 })
    expect(parseLength('0', 'sizeEW').ok).toBe(false)
    expect(parseLength('235', 'sizeEW').ok).toBe(false)
    expect(parseLength('2.3m', 'sizeEW').ok).toBe(false)
    expect(parseLength('-1', 'eastGap').ok).toBe(false)
  })

  test('결과: 잰 값·지금 값·잘못 적은 칸을 함께 남기고 layoutConfirmed=false', () => {
    const d = { ...emptySurveyDraft(), values: { 'pillar-1': { sizeEW: '0.6', northGap: 'abc' } }, notes: { 'pillar-1': ' 중심 기준 ' }, tool: '레이저' }
    expect(surveyProgress(items, d)).toEqual({ measuredItems: 1, totalItems: items.length, invalidFields: 1 })
    const r = buildSurveyResult(layout, items, d, { appVersion: 'test', now: new Date('2026-10-28T01:00:00Z') })
    expect(r.layoutConfirmed).toBe(false)
    expect(r.tool).toBe('레이저')
    const p1 = r.items.find((i) => i.itemId === 'pillar-1')!
    expect(p1.measured).toMatchObject({ sizeEW: 0.6, northGap: null, sizeNS: null })
    expect(p1.invalid).toEqual([{ field: 'northGap', raw: 'abc' }])
    expect(p1.note).toBe('중심 기준')
    expect(p1.current.sizeEW).toBe(0.5)
  })
})
