// 격자 길찾기 — 바닥을 정사각 격자로 나눠 A*로 길을 찾는다. 물리 엔진 없음.
// 장비·기둥 발자국과 구역 밖은 막힌 칸. 아바타 반지름만큼 여유(padding)를 둔다.
import { footprintOf, pillarRect, type Pt, type Rect, type SceneLayout } from './layoutModel'

export interface NavGrid {
  cell: number
  cols: number
  rows: number
  originX: number
  originZ: number
  blocked: Uint8Array
  isBlocked(x: number, z: number): boolean
  toCell(p: Pt): { c: number; r: number }
  toWorld(c: number, r: number): Pt
}

const AVATAR_PAD = 0.3

function rectBlocks(r: Rect, pad: number): Rect {
  return { xMin: r.xMin - pad, xMax: r.xMax + pad, zMin: r.zMin - pad, zMax: r.zMax + pad }
}

export function buildNavGrid(layout: SceneLayout, cell = 0.5): NavGrid {
  const zones: Rect[] = [layout.mainZone, ...(layout.absProtrusion ? [layout.absProtrusion] : [])]
  const xMin = Math.min(...zones.map((z) => z.xMin))
  const xMax = Math.max(...zones.map((z) => z.xMax))
  const zMin = Math.min(...zones.map((z) => z.zMin))
  const zMax = Math.max(...zones.map((z) => z.zMax))
  const cols = Math.ceil((xMax - xMin) / cell)
  const rows = Math.ceil((zMax - zMin) / cell)
  const blocked = new Uint8Array(cols * rows)
  const obstacles = [...layout.equipment.map((e) => rectBlocks(footprintOf(e), AVATAR_PAD)), ...layout.pillars.map((p) => rectBlocks(pillarRect(p), AVATAR_PAD))]
  const inside = (p: Pt) => zones.some((z) => p.x >= z.xMin && p.x <= z.xMax && p.z >= z.zMin && p.z <= z.zMax)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = { x: xMin + (c + 0.5) * cell, z: zMin + (r + 0.5) * cell }
      let b = !inside(p)
      if (!b) for (const o of obstacles) if (p.x >= o.xMin && p.x <= o.xMax && p.z >= o.zMin && p.z <= o.zMax) { b = true; break }
      blocked[r * cols + c] = b ? 1 : 0
    }
  }
  const toCell = (p: Pt) => ({ c: Math.floor((p.x - xMin) / cell), r: Math.floor((p.z - zMin) / cell) })
  const toWorld = (c: number, r: number): Pt => ({ x: xMin + (c + 0.5) * cell, z: zMin + (r + 0.5) * cell })
  const isBlocked = (x: number, z: number) => {
    const { c, r } = toCell({ x, z })
    if (c < 0 || r < 0 || c >= cols || r >= rows) return true
    return blocked[r * cols + c] === 1
  }
  return { cell, cols, rows, originX: xMin, originZ: zMin, blocked, isBlocked, toCell, toWorld }
}

/** A* (8방향, 대각선은 모서리 끼임 방지). 경로는 월드 좌표 점 목록, 없으면 null */
export function findPath(grid: NavGrid, from: Pt, to: Pt): Pt[] | null {
  const s = grid.toCell(from)
  const g = grid.toCell(to)
  const inb = (c: number, r: number) => c >= 0 && r >= 0 && c < grid.cols && r < grid.rows
  if (!inb(s.c, s.r) || !inb(g.c, g.r)) return null
  if (grid.blocked[g.r * grid.cols + g.c] === 1) return null
  const key = (c: number, r: number) => r * grid.cols + c
  const open = new Map<number, number>() // key → f
  const gScore = new Map<number, number>()
  const came = new Map<number, number>()
  const h = (c: number, r: number) => Math.hypot(c - g.c, r - g.r)
  const sk = key(s.c, s.r)
  gScore.set(sk, 0)
  open.set(sk, h(s.c, s.r))
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const
  let guard = 0
  while (open.size && guard++ < 200_000) {
    let cur = -1
    let best = Infinity
    for (const [k, f] of open) if (f < best) { best = f; cur = k }
    open.delete(cur)
    const cc = cur % grid.cols
    const cr = Math.floor(cur / grid.cols)
    if (cc === g.c && cr === g.r) {
      const out: Pt[] = []
      let k: number | undefined = cur
      while (k !== undefined) { out.push(grid.toWorld(k % grid.cols, Math.floor(k / grid.cols))); k = came.get(k) }
      out.reverse()
      out[out.length - 1] = { x: to.x, z: to.z }
      return out
    }
    for (const [dc, dr] of dirs) {
      const nc = cc + dc
      const nr = cr + dr
      if (!inb(nc, nr) || grid.blocked[nr * grid.cols + nc] === 1) continue
      if (dc !== 0 && dr !== 0 && (grid.blocked[cr * grid.cols + nc] === 1 || grid.blocked[nr * grid.cols + cc] === 1)) continue
      const nk = key(nc, nr)
      const tentative = (gScore.get(cur) ?? Infinity) + Math.hypot(dc, dr)
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        came.set(nk, cur)
        gScore.set(nk, tentative)
        open.set(nk, tentative + h(nc, nr))
      }
    }
  }
  return null
}

/** a에서 b까지 곧게 가도 막힌 칸(격자 밖 포함)을 지나지 않는가. 판정 기준은 길찾기와 같은 격자(사람 여유 AVATAR_PAD를 더해 막은 칸)다.
 *  half(m)가 0이면 가는 선분: 선분이 지나는 칸을 빠짐없이 본다(격자 걷기) — 격자 꼭짓점을 정확히 지나면 꼭짓점 양옆 칸도,
 *  격자선 위를 따라가면 선 양쪽 칸도 본다(모서리를 대각선으로 스쳐 장비를 뚫지 않게).
 *  half가 0보다 크면 두꺼운 선분: 선분을 따라 미는 반 폭 half의 정사각형이 걸치는 칸(경계에 닿기만 하는 칸은 빼고)이 모두 비어야 한다 */
export function segmentClear(grid: NavGrid, a: Pt, b: Pt, half = 0): boolean {
  // 좌표가 유한한 수가 아니면(NaN·무한대) 막힌 것으로 본다
  if (!Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) return false
  const { cell, cols, rows, originX, originZ, blocked } = grid
  const x0 = (a.x - originX) / cell, z0 = (a.z - originZ) / cell
  const x1 = (b.x - originX) / cell, z1 = (b.z - originZ) / cell
  const free = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && blocked[r * cols + c] === 0
  if (half > 0) return thickClear(free, x0, z0, x1, z1, half / cell)
  const dx = x1 - x0, dz = z1 - z0
  // 세로·가로 격자선 위를 따라가는 선분(선 양쪽 칸에 걸친다)
  const onX = dx === 0 && Number.isInteger(x0)
  const onZ = dz === 0 && Number.isInteger(z0)
  const ok = (c: number, r: number) => free(c, r) && (!onX || free(c - 1, r)) && (!onZ || free(c, r - 1))
  let c = Math.floor(x0), r = Math.floor(z0)
  const ec = Math.floor(x1), er = Math.floor(z1)
  const sc = Math.sign(dx), sr = Math.sign(dz)
  const tdC = sc !== 0 ? Math.abs(1 / dx) : Infinity
  const tdR = sr !== 0 ? Math.abs(1 / dz) : Infinity
  // 선분 매개변수 t(0~1)에서 다음 세로·가로 격자선을 만나는 값
  let tmC = sc > 0 ? (c + 1 - x0) / dx : sc < 0 ? (x0 - c) / -dx : Infinity
  let tmR = sr > 0 ? (r + 1 - z0) / dz : sr < 0 ? (z0 - r) / -dz : Infinity
  if (!ok(c, r)) return false
  for (let guard = Math.abs(ec - c) + Math.abs(er - r) + 2; guard > 0 && (c !== ec || r !== er); guard--) {
    if (Math.min(tmC, tmR) > 1 + 1e-9) break
    if (Math.abs(tmC - tmR) < 1e-9) {
      // 격자 꼭짓점을 지난다: 꼭짓점을 함께 쓰는 옆 두 칸도 비어 있어야 한다
      if (!free(c + sc, r) || !free(c, r + sr)) return false
      c += sc; r += sr; tmC += tdC; tmR += tdR
    } else if (tmC < tmR) { c += sc; tmC += tdC } else { r += sr; tmR += tdR }
    if (!ok(c, r)) return false
  }
  return true
}

/** 두꺼운 선분(격자 단위, 반 폭 h): 줄(r)마다 정사각형 띠가 그 줄에 걸치는 t 구간을 구하고, 그 구간의 x 범위 ± h에 걸치는 칸을 모두 본다 */
function thickClear(free: (c: number, r: number) => boolean, x0: number, z0: number, x1: number, z1: number, h: number): boolean {
  const eps = 1e-9
  const dx = x1 - x0, dz = z1 - z0
  const rFirst = Math.floor(Math.min(z0, z1) - h + eps), rLast = Math.ceil(Math.max(z0, z1) + h - eps) - 1
  for (let r = rFirst; r <= rLast; r++) {
    let tA = 0, tB = 1
    if (dz !== 0) {
      const ta = (r - h - z0) / dz, tb = (r + 1 + h - z0) / dz
      tA = Math.max(0, Math.min(ta, tb)); tB = Math.min(1, Math.max(ta, tb))
      if (tA > tB) continue
    }
    const xa = x0 + dx * tA, xb = x0 + dx * tB
    const cFirst = Math.floor(Math.min(xa, xb) - h + eps), cLast = Math.ceil(Math.max(xa, xb) + h - eps) - 1
    for (let c = cFirst; c <= cLast; c++) if (!free(c, r)) return false
  }
  return true
}

/** 경로 다듬기: A* 점 가운데 앞 점에서 뒤 점까지 곧게 갈 수 있으면 그 사이 점을 뺀다. 판정은 반 칸 폭의 두꺼운 선분(segmentClear half = cell/2)이라
 *  다듬은 선도 막힌 칸에서 반 칸 떨어져 지나간다(다듬기 전 경로처럼 장비 발자국에서 약 0.3 m). 이웃한 A* 점끼리는 원래 경로 그대로 둔다.
 *  from(지금 서 있는 자리)을 주면: 거기서 첫 점(서 있는 칸의 가운데) 다음 점들 가운데 하나로 곧게 갈 수 있으면 칸 가운데를 거치지 않고 from에서 바로 출발한다.
 *  못 가면 지금처럼 칸 가운데부터. 목적지(누른 자리)는 그대로, 새 점은 만들지 않는다(from과 원래 점들의 부분 목록) */
export function smoothPath(grid: NavGrid, path: readonly Pt[], from?: Pt): Pt[] {
  const half = grid.cell / 2
  if (path.length === 1) return from ? [from, path[0]!] : path.slice()
  const out: Pt[] = []
  let i = 0
  if (from) {
    let j = path.length - 1
    while (j >= 1 && !segmentClear(grid, from, path[j]!, half)) j--
    if (j >= 1) { out.push(from); i = j }
  }
  out.push(path[i]!)
  while (i < path.length - 1) {
    let j = path.length - 1
    while (j > i + 1 && !segmentClear(grid, path[i]!, path[j]!, half)) j--
    out.push(path[j]!)
    i = j
  }
  return out
}

/** 경로를 따라 speed(m/s)·dt(s)만큼 전진. index는 다음 목표점 인덱스. 지금 자리와 같은 점은 속도가 0이어도 지나간다 */
export function advanceAlongPath(pos: Pt, path: Pt[], index: number, speed: number, dt: number): { pos: Pt; index: number; done: boolean } {
  let remaining = speed * dt
  let p = { ...pos }
  let i = index
  while (i < path.length) {
    const t = path[i]!
    const dx = t.x - p.x
    const dz = t.z - p.z
    const dist = Math.hypot(dx, dz)
    if (dist === 0) { i++; continue }
    if (!(remaining > 0)) break
    if (dist <= remaining) { p = { x: t.x, z: t.z }; remaining -= dist; i++ }
    else { p = { x: p.x + (dx / dist) * remaining, z: p.z + (dz / dist) * remaining }; remaining = 0 }
  }
  return { pos: p, index: i, done: i >= path.length }
}
