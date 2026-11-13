// tests/pathSmooth.test.ts — 바닥 누르기 경로 다듬기(설계 2026-11-13 캐릭터와 움직임 §6): A* 점 가운데 곧게 갈 수 있는 중간 점을 뺀다
import { describe, expect, test } from 'vitest'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { footprintOf, loadSceneLayout, pillarRect, type Pt, type Rect } from '../src/scene/layoutModel'
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

/** 독립 확인: 선분을 촘촘히 짚어(기본 1 mm 간격) 막힌 칸에 들어가는지 본다 */
function sampledClear(grid: NavGrid, a: Pt, b: Pt, step = 0.001): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    if (grid.isBlocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false
  }
  return true
}

/** 독립 확인(두꺼운 선분): 선분 위 점마다 반 폭 h 정사각형의 테두리·안쪽 점을 짚어 막힌 칸에 들어가는지 본다(경계에 딱 닿는 것은 빼려고 h를 조금 줄인다) */
function sampledThickClear(grid: NavGrid, a: Pt, b: Pt, h: number): boolean {
  const k = h * 0.999
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.01))
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t
    for (let u = -4; u <= 4; u++) for (let v = -4; v <= 4; v++) if (grid.isBlocked(x + (k * u) / 4, z + (k * v) / 4)) return false
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
  test('유한한 수가 아닌 좌표(NaN·무한대)는 막힌 것(가는·두꺼운 판정 모두)', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      for (const half of [0, 0.5]) {
        expect(segmentClear(open, { x: bad, z: 0.5 }, { x: 2.5, z: 2.5 }, half)).toBe(false)
        expect(segmentClear(open, { x: 0.5, z: 0.5 }, { x: 2.5, z: bad }, half)).toBe(false)
      }
    }
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

describe('두꺼운 선분 판정(segmentClear의 반 폭)', () => {
  test('한 칸 폭 통로의 가운데 줄은 지나가고, 통로 안에서 조금만 비켜도 벽 칸에 걸린다', () => {
    const g = gridFrom(['######', '......', '######'])
    expect(segmentClear(g, { x: 0.5, z: 1.5 }, { x: 5.5, z: 1.5 }, 0.5)).toBe(true)
    expect(segmentClear(g, { x: 0.5, z: 1.4 }, { x: 5.5, z: 1.4 }, 0.5)).toBe(false)
    expect(segmentClear(g, { x: 0.5, z: 1.4 }, { x: 5.5, z: 1.4 })).toBe(true)
  })
  test('가는 선분은 비켜 가지만 반 칸 폭 안에 막힌 칸이 있으면 막힌 것', () => {
    const g = gridFrom(['......', '......', '...#..', '......'])
    const a = { x: 0.5, z: 1.5 }, b = { x: 5.5, z: 1.7 }
    expect(segmentClear(g, a, b)).toBe(true)
    expect(segmentClear(g, a, b, 0.5)).toBe(false)
  })
  test('무작위 선분 2000개: 두껍게 통과한 선분은 반 폭 안의 어느 점도 막힌 칸에 들지 않는다, 촘촘히 짚어 걸리는 선분은 반드시 막힘', () => {
    const g = gridFrom(['..........', '..##......', '......#...', '...#......', '.......##.', '..........', '.#...#....', '..........'])
    let seed = 11
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    let pass = 0
    for (let i = 0; i < 2000; i++) {
      const a = { x: 0.5 + rnd() * 9, z: 0.5 + rnd() * 7 }, b = { x: 0.5 + rnd() * 9, z: 0.5 + rnd() * 7 }
      const thick = segmentClear(g, a, b, 0.5)
      if (thick) { pass++; expect(sampledThickClear(g, a, b, 0.5)).toBe(true) }
      if (!sampledThickClear(g, a, b, 0.5)) expect(thick).toBe(false)
    }
    expect(pass).toBeGreaterThan(50)
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
  test('막힌 칸 옆을 지나는 지름길은 반 칸 폭 여유가 없으면 쓰지 않는다(벽에 바짝 붙지 않는다)', () => {
    const g = gridFrom(['......', '......', '...#..', '......', '......'])
    const p = findPath(g, { x: 0.5, z: 1.5 }, { x: 5.5, z: 1.7 })!
    const s = smoothPath(g, p)
    for (let i = 1; i < s.length; i++) {
      const adjacent = p.indexOf(s[i]!) === p.indexOf(s[i - 1]!) + 1
      if (!adjacent) expect(sampledThickClear(g, s[i - 1]!, s[i]!, 0.5)).toBe(true)
    }
  })
})

describe('지금 서 있는 자리에서 바로 출발', () => {
  const open = gridFrom(['..........', '..........', '..........', '..........'])
  test('서 있는 자리에서 다음 점까지 곧게 갈 수 있으면 칸 가운데를 거치지 않는다', () => {
    const from = { x: 1.8, z: 1.2 } // 칸 (1,1)의 가운데(1.5, 1.5)가 아님
    const p = findPath(open, from, { x: 8.4, z: 2.6 })!
    expect(p[0]).toEqual({ x: 1.5, z: 1.5 })
    const s = smoothPath(open, p, from)
    expect(s).toEqual([from, { x: 8.4, z: 2.6 }])
  })
  test('같은 칸 안을 누르면 서 있는 자리에서 곧장 간다', () => {
    const from = { x: 1.8, z: 1.2 }, to = { x: 1.2, z: 1.7 }
    const p = findPath(open, from, to)!
    expect(smoothPath(open, p, from)).toEqual([from, to])
  })
  test('서 있는 자리가 막힌 칸에 바짝 붙어 곧게 못 가면 지금처럼 칸 가운데를 거친다', () => {
    const g = gridFrom(['......', '.#....', '......', '......'])
    const from = { x: 0.6, z: 2.08 } // 칸 (0,2), 북쪽 위 칸 (0,1)·(1,1)에 0.08 붙어 있다
    const to = { x: 4.5, z: 0.5 }
    const p = findPath(g, from, to)!
    expect(p[0]).toEqual({ x: 0.5, z: 2.5 })
    const s = smoothPath(g, p, from)
    expect(s[0]).toEqual(p[0])
    expect(s[s.length - 1]).toEqual(to)
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
  // 장비·기둥 발자국(사람 여유를 더하지 않은 실제 크기)에서 걸어가는 선의 가장 가까운 거리
  const rects: Rect[] = [...layout.equipment.map(footprintOf), ...layout.pillars.map(pillarRect)]
  const dRect = (p: Pt, r: Rect) => Math.hypot(Math.max(r.xMin - p.x, 0, p.x - r.xMax), Math.max(r.zMin - p.z, 0, p.z - r.zMax))
  const dSeg = (q: Pt, a: Pt, b: Pt) => {
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / l2))
    return Math.hypot(a.x + dx * t - q.x, a.z + dz * t - q.z)
  }
  /** 선분이 사각형을 지나는가(Liang–Barsky 자르기) */
  const crosses = (a: Pt, b: Pt, r: Rect) => {
    let t0 = 0, t1 = 1
    const dx = b.x - a.x, dz = b.z - a.z
    for (const [p, q] of [[-dx, a.x - r.xMin], [dx, r.xMax - a.x], [-dz, a.z - r.zMin], [dz, r.zMax - a.z]] as const) {
      if (p === 0) { if (q < 0) return false; continue }
      const t = q / p
      if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t)
      if (t0 > t1) return false
    }
    return true
  }
  /** 선분과 사각형의 정확한 거리: 겹치면 0, 아니면 선분 끝점↔사각형, 사각형 꼭짓점↔선분 가운데 가장 짧은 것(볼록한 두 도형) */
  const segRect = (a: Pt, b: Pt, r: Rect) => crosses(a, b, r) ? 0 : Math.min(dRect(a, r), dRect(b, r),
    dSeg({ x: r.xMin, z: r.zMin }, a, b), dSeg({ x: r.xMax, z: r.zMin }, a, b), dSeg({ x: r.xMin, z: r.zMax }, a, b), dSeg({ x: r.xMax, z: r.zMax }, a, b))
  const clearance = (path: Pt[]) => {
    let m = Infinity
    for (let i = 1; i < path.length; i++) for (const r of rects) m = Math.min(m, segRect(path[i - 1]!, path[i]!, r))
    return m
  }
  test('여러 출발·도착 쌍: 다듬은 경로의 어떤 선분도 막힌 칸을 지나지 않고, 끝이 같고, 짧아지거나 같고, 장비에 더 붙지 않는다', () => {
    let pairs = 0, fewer = 0, direct = 0, minRaw = Infinity, minSmooth = Infinity
    for (const a of spots) for (const b of spots) {
      if (a === b) continue
      const p = findPath(grid, a, b)
      if (!p) continue
      pairs++
      const s = smoothPath(grid, p, a)
      // 실제로 걷는 선: 서 있는 자리 → 경로 점들
      const walkedRaw = [a, ...p]
      const walked = s[0] === a ? s : [a, ...s]
      if (s[0] === a) direct++
      else expect(s[0]).toEqual(p[0])
      expect(s[s.length - 1]).toEqual(p[p.length - 1])
      expect(s.filter((q) => q !== a).length).toBeLessThanOrEqual(p.length)
      expect(len(walked)).toBeLessThanOrEqual(len(walkedRaw) + 1e-9)
      for (let i = 1; i < s.length; i++) expect(sampledClear(grid, s[i - 1]!, s[i]!, 0.005), `${a.x},${a.z}→${b.x},${b.z} #${i}`).toBe(true)
      // 다듬은 경로는 서 있는 자리와 원래 점들로만 이뤄진다(새 점을 만들지 않는다)
      for (const q of s) if (q !== a) expect(p).toContainEqual(q)
      // 장비 발자국에서 0.3 m(사람 여유) 이상 떨어져 지나가고, 다듬기 전 경로가 그보다 가까웠으면 그보다 더 붙지 않는다
      const cr = clearance(walkedRaw), cs = clearance(walked)
      expect(cs, `${a.x},${a.z}→${b.x},${b.z}`).toBeGreaterThanOrEqual(Math.min(cr, 0.3) - 1e-6)
      minRaw = Math.min(minRaw, cr); minSmooth = Math.min(minSmooth, cs)
      if (s.filter((q) => q !== a).length < p.length) fewer++
    }
    expect(pairs).toBeGreaterThan(1000)
    expect(fewer).toBeGreaterThan(pairs * 0.8)
    expect(direct).toBeGreaterThan(pairs * 0.5)
    // 모든 쌍을 통틀어 가장 가까운 거리도 다듬기 전보다 작지 않다
    expect(minSmooth).toBeGreaterThanOrEqual(minRaw - 1e-6)
  })
})
