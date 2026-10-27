import { describe, expect, test } from 'vitest'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { buildNavGrid, findPath } from '../src/scene/pathfind'
import { buildReviewItems, buildReviewResult, emptyDraft, fillUnansweredOk, kstDate, progressOf } from '../src/review/layoutReview'

const layout = loadSceneLayout(raw)
const items = buildReviewItems(layout)

describe('3D 배치 눈검토', () => {
  test('경계 5·기둥 4·장비 23·위치 2 = 34항목, ID 중복 없음', () => {
    expect(items.filter((i) => i.group === 'boundary')).toHaveLength(5)
    expect(items.filter((i) => i.group === 'pillar')).toHaveLength(4)
    expect(items.filter((i) => i.group === 'equipment')).toHaveLength(layout.equipment.length)
    expect(items.filter((i) => i.group === 'place')).toHaveLength(2)
    expect(new Set(items.map((i) => i.itemId)).size).toBe(items.length)
  })

  test('모든 항목의 보기 자리는 시작점에서 걸어갈 수 있다', () => {
    const grid = buildNavGrid(layout, 0.5)
    for (const i of items) expect(findPath(grid, layout.studentStart, i.viewPoint), i.itemId).not.toBeNull()
  })

  test('남은 항목만 맞음으로 채우고, 이미 고른 답·메모는 유지한다', () => {
    const d = { ...emptyDraft(), answers: { 'wall-north': { verdict: 'veryOff' as const, note: '더 김' } } }
    const filled = fillUnansweredOk(items, d)
    expect(filled.answers['wall-north']).toEqual({ verdict: 'veryOff', note: '더 김' })
    expect(progressOf(items, filled)).toEqual({ answered: items.length, total: items.length })
  })

  test('결과는 layoutConfirmed=false를 유지하고 빈 메모는 null, 한국 날짜를 쓴다', () => {
    const now = new Date('2026-10-27T16:30:00Z')
    const r = buildReviewResult(layout, items, { ...emptyDraft(), answers: { 'pillar-1': { verdict: 'ok', note: '  ' } } }, { appVersion: 'test', now })
    expect(r.layoutConfirmed).toBe(false)
    expect(r.reviewDateKST).toBe('2026-10-28')
    expect(kstDate(now)).toBe('2026-10-28')
    expect(r.items.find((i) => i.itemId === 'pillar-1')).toMatchObject({ verdict: 'ok', note: null })
    expect(r.items.find((i) => i.itemId === 'pillar-2')?.verdict).toBeNull()
    expect(r.progress).toEqual({ answered: 1, total: items.length })
  })
})
