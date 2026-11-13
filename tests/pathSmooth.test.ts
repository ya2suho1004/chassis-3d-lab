// tests/pathSmooth.test.ts — 바닥 누르기 경로 다듬기(설계 2026-11-13 캐릭터와 움직임 §6): A* 점 가운데 곧게 갈 수 있는 중간 점을 뺀다
import { describe, expect, test } from 'vitest'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout, type Pt } from '../src/scene/layoutModel'
import { buildNavGrid, findPath, segmentClear, smoothPath, type NavGrid } from '../src/scene/pathfind'
import { buildReviewItems } from '../src/review/layoutReview'

/** 글자 지도로 격자를 만든다('#' 막힘). 칸 1 m, 원점 (0, 0), 줄 = z */
function gridFrom(rows: string[], cell = 1): NavGrid {
  const cols = rows[0]!.length, nr = rows.length
  const blocked = new Uint8Array(cols * nr)
  rows.forEach((line, r) => { for (let c = 0; c < cols; c++) blocked[r * cols + c] = line[c] === '#' ? 1 : 0 })
  const toCell = (p: Pt) => ({ c: Math.floor(p.x / cell), r: Math.floor(p.z / cell) })
  const toWorld = (c: number, r: number): Pt => ({ x: (c + 0.5) * cell, z: (r + 0.5) * cell })
  const isBlocked = (x: number, z: number) => {
    const { c, r } = toCell({ x, z })
    if (c < 0 || r < 0 || c >= cols || r >= nr) return true
    return blocked[r * cols + c] === 1
  }
  return { cell, cols, rows: nr, originX: 0, originZ: 0, blocked, isBlocked, toCell, toWorld }
}

/** 독립 확인: 선분을 아주 촘촘히 짚어(1 mm 간격) 막힌 칸에 들어가는지 본다 */
function sampledClear(grid: NavGrid, a: Pt, b: Pt): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.001))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    if (grid.isBlocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false
  }
  return true
}

const len = (p: Pt[]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - p[i]!.x, q.z - p[i]!.z), 0)

describe('곧게 갈 수 있는지(segmentClear)', () => {
  const open = gridFrom(['.....', '.....', '.....', '.....'])
  test('빈 바닥은 어디로든 곧게 간다', () => {
    expect(segmentClear(open, { x: 0.5, z: 0.5 }, { x: 4.5, z: 3.5 })).toBe(true)
    expect(segmentClear(open, { x: 4.9, z: 0.1 }, { x: 0.1, z: 3.9 })).toBe(true)
    expect(segmentClear(open, { x: 2.5, z: 2.5 }, { x: 2.5, z: 2.5 })).toBe(true)
  })
  test('막힌 칸을 지나면 안 된다', () => {
    const g = gridFrom(['.....', '..#..', '.....'])
    expect(segmentClear(g, { x: 0.5, z: 1.5 }, { x: 4.5, z: 1.5 })).toBe(false)
    expect(segmentClear(g, { x: 0.5, z: 0.5 }, { x: 4.5, z: 0.5 })).toBe(true)
  })
  test('막힌 칸의 모서리를 대각선으로 스치는 선분도 막힌 것으로 본다', () => {
    // (0.5,0.5)→(2.5,2.5)는 격자 꼭짓점 (1,1)·(2,2)를 정확히 지난다. 꼭짓점 옆 칸 (1,0)이 막혔다
    const g = gridFrom(['.#...', '.....', '.....'])
    expect(segmentClear(g, { x: 0.5, z: 0.5 }, { x: 2.5, z: 2.5 })).toBe(false)
    const h = gridFrom(['.....', '#....', '.....'])
    expect(segmentClear(h, { x: 0.5, z: 0.5 }, { x: 2.5, z: 2.5 })).toBe(false)
    expect(segmentClear(open, { x: 0.5, z: 0.5 }, { x: 2.5, z: 2.5 })).toBe(true)
  })
  test('막힌 칸의 귀퉁이를 아주 조금 베고 지나가도 잡는다', () => {
    const g = gridFrom(['.....', '..#..', '.....'])
    // x=2에서 z=1.01 — 막힌 칸 (2,1)의 왼쪽 위 귀퉁이를 1 cm 벤다
    const a = { x: 0.5, z: 0.5 }, b = { x: 3.5, z: 1.52 }
    expect(sampledClear(g, a, b)).toBe(false)
    expect(segmentClear(g, a, b)).toBe(false)
  })
  test('격자 밖으로 나가는 선분은 막힌 것', () => {
    expect(segmentClear(open, { x: 0.5, z: 0.5 }, { x: 6, z: 0.5 })).toBe(false)
  })
  test('무작위 선분 2000개: 촘촘히 짚어 막힌 칸에 닿는 선분은 반드시 막힌 것으로 본다', () => {
    const g = gridFrom(['..........', '..##......', '......#...', '...#......', '.......##.', '..........', '.#...#....', '..........'])
    let seed = 7
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    let hits = 0
    for (let i = 0; i < 2000; i++) {
      const a = { x: rnd() * 10, z: rnd() * 8 }, b = { x: rnd() * 10, z: rnd() * 8 }
      if (!sampledClear(g, a, b)) { hits++; expect(segmentClear(g, a, b)).toBe(false) }
    }
    expect(hits).toBeGreaterThan(500)
  })
})

describe('경로 다듬기(smoothPath)', () => {
  test('장애물이 없으면 시작점과 목적지 두 점만 남는다', () => {
    const g = gridFrom(['..........', '..........', '..........', '..........', '..........', '..........'])
    const p = findPath(g, { x: 0.5, z: 0.5 }, { x: 8.3, z: 3.7 })!
    expect(p.length).toBeGreaterThan(2)
    const s = smoothPath(g, p)
    expect(s).toEqual([p[0], p[p.length - 1]])
  })
  test('장애물 모서리를 돌 때는 모서리 점이 남는다', () => {
    const g = gridFrom([
      '......',
      '.####.',
      '.####.',
      '......',
    ])
    const from = { x: 0.5, z: 0.5 }, to = { x: 2.5, z: 3.5 }
    const p = findPath(g, from, to)!
    const s = smoothPath(g, p)
    expect(s.length).toBeGreaterThanOrEqual(3)
    expect(s[0]).toEqual(p[0])
    expect(s[s.length - 1]).toEqual(to)
    for (let i = 1; i < s.length; i++) expect(sampledClear(g, s[i - 1]!, s[i]!)).toBe(true)
  })
  test('점이 두 개 이하면 그대로', () => {
    const g = gridFrom(['...'])
    expect(smoothPath(g, [{ x: 0.5, z: 0.5 }])).toEqual([{ x: 0.5, z: 0.5 }])
    expect(smoothPath(g, [{ x: 0.5, z: 0.5 }, { x: 2.5, z: 0.5 }])).toEqual([{ x: 0.5, z: 0.5 }, { x: 2.5, z: 0.5 }])
  })
})

describe('실제 실습장 배치로 확인', () => {
  const layout = loadSceneLayout(raw)
  const grid = buildNavGrid(layout, 0.5)
  // 시작점, 장비 접근점, 배치 눈검토의 보기 자리(장비·기둥·경계 34곳), 빈 바닥 칸 몇 곳(누른 자리처럼 칸 가운데가 아닌 좌표)
  const floor: Pt[] = []
  for (let r = 1; r < grid.rows; r += 5) for (let c = 2; c < grid.cols; c += 7) {
    const q = grid.toWorld(c, r)
    if (!grid.isBlocked(q.x, q.z)) floor.push({ x: q.x + 0.13, z: q.z - 0.21 })
  }
  const spots: Pt[] = [layout.studentStart, ...layout.equipment.flatMap((e) => (e.accessPoint ? [e.accessPoint] : [])), ...buildReviewItems(layout).map((i) => i.viewPoint), ...floor]
  test('여러 출발·도착 쌍: 다듬은 경로의 어떤 선분도 막힌 칸을 지나지 않고, 시작·끝이 같고, 짧아지거나 같다', () => {
    let pairs = 0, fewer = 0
    for (const a of spots) for (const b of spots) {
      if (a === b) continue
      const p = findPath(grid, a, b)
      if (!p) continue
      pairs++
      const s = smoothPath(grid, p)
      expect(s[0]).toEqual(p[0])
      expect(s[s.length - 1]).toEqual(p[p.length - 1])
      expect(s.length).toBeLessThanOrEqual(p.length)
      expect(len(s)).toBeLessThanOrEqual(len(p) + 1e-9)
      for (let i = 1; i < s.length; i++) expect(sampledClear(grid, s[i - 1]!, s[i]!), `${a.x},${a.z}→${b.x},${b.z} #${i}`).toBe(true)
      // 다듬은 경로는 원래 점들의 부분 목록이다(새 점을 만들지 않는다)
      for (const q of s) expect(p).toContainEqual(q)
      if (s.length < p.length) fewer++
    }
    expect(pairs).toBeGreaterThan(100)
    expect(fewer).toBeGreaterThan(pairs * 0.8)
  })
})
