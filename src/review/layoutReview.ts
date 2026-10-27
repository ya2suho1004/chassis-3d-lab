// 3D 배치 눈검토(교사) — 임시 배치를 태블릿으로 둘러보며 항목마다 ‘학교와 비슷한가’를 표시한다.
// 상대 위치·모양만 보는 눈검토이며 치수 확인이 아니다. 결과는 기기 안 초안(localStorage)과 내려받기 JSON으로만 남고 전송하지 않는다.
// 결과가 모두 ‘맞음’이어도 layoutConfirmed는 여기서 바꾸지 않는다(교사 결정과 계약 검토가 따로 필요).
import { footprintOf, type Pt, type SceneLayout } from '../scene/layoutModel'
import { buildNavGrid, type NavGrid } from '../scene/pathfind'

export type Verdict = 'ok' | 'slightlyOff' | 'veryOff' | 'notPresent'
export const VERDICT_LABEL: Record<Verdict, string> = { ok: '맞음', slightlyOff: '조금 다름', veryOff: '많이 다름', notPresent: '없음' }
export type ReviewGroup = 'boundary' | 'pillar' | 'equipment' | 'place'
export const GROUP_LABEL: Record<ReviewGroup, string> = { boundary: '벽·트인 면', pillar: '기둥', equipment: '장비', place: '위치' }

export interface ReviewItem {
  itemId: string
  group: ReviewGroup
  label: string
  basis: string
  /** 항목을 누르면 캐릭터가 걸어갈 자리(막히지 않은 바닥) */
  viewPoint: Pt
  /** 3D에서 강조할 장비 ID(장비 항목만) */
  equipmentId: string | null
}

export interface ReviewAnswer { verdict: Verdict | null; note: string }
export interface ReviewDraft {
  answers: Record<string, ReviewAnswer>
  overall: Verdict | null
  missingEquipment: string
  notes: string
}

export const emptyDraft = (): ReviewDraft => ({ answers: {}, overall: null, missingEquipment: '', notes: '' })

const BOUNDARY_LABEL: Record<string, string> = {
  'wall-north': '북쪽 벽(건물 외벽)',
  'wall-east': '동쪽 벽(건물 외벽)',
  'open-west': '서쪽 트인 면(엔진 실습 구역으로)',
  'open-south': '남쪽 트인 면(전기 실습 구역으로)',
}

function clampInside(layout: SceneLayout, p: Pt): Pt {
  const m = layout.mainZone
  return { x: Math.min(Math.max(p.x, m.xMin + 0.6), m.xMax - 0.6), z: Math.min(Math.max(p.z, m.zMin + 0.6), m.zMax - 0.6) }
}

/** 장비 앞(남쪽, 막히면 북쪽) 0.9 m 바닥. 접근점이 있으면 접근점 */
function besideEquipment(layout: SceneLayout, e: SceneLayout['equipment'][number]): Pt {
  if (e.accessPoint) return e.accessPoint
  const f = footprintOf(e)
  const south = { x: e.x, z: f.zMax + 0.9 }
  return clampInside(layout, south.z < layout.mainZone.zMax - 0.6 ? south : { x: e.x, z: f.zMin - 0.9 })
}

/** 시작점에서 걸어갈 수 있는 칸(8방향, findPath와 같은 모서리 끼임 규칙) */
function reachableCells(grid: NavGrid, from: Pt): Uint8Array {
  const seen = new Uint8Array(grid.cols * grid.rows)
  const s = grid.toCell(from)
  const open = (c: number, r: number) => c >= 0 && r >= 0 && c < grid.cols && r < grid.rows && grid.blocked[r * grid.cols + c] === 0
  if (!open(s.c, s.r)) return seen
  const first = s.r * grid.cols + s.c
  const queue = [first]
  seen[first] = 1
  while (queue.length) {
    const k = queue.pop()!
    const c = k % grid.cols
    const r = (k - c) / grid.cols
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const nc = c + dc
      const nr = r + dr
      if (!open(nc, nr) || seen[nr * grid.cols + nc]) continue
      if (dr && dc && (!open(c + dc, r) || !open(c, r + dr))) continue
      seen[nr * grid.cols + nc] = 1
      queue.push(nr * grid.cols + nc)
    }
  }
  return seen
}

/** 걸어갈 수 없는 자리면 가장 가까운 걸어갈 수 있는 바닥 칸 중심으로 옮긴다 */
function snapToReachable(grid: NavGrid, reach: Uint8Array, p: Pt): Pt {
  let best = p
  let bestD = Infinity
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
    if (!reach[r * grid.cols + c]) continue
    const w = grid.toWorld(c, r)
    const d = Math.hypot(w.x - p.x, w.z - p.z)
    if (d < bestD) { bestD = d; best = w }
  }
  return best
}

export function buildReviewItems(layout: SceneLayout): ReviewItem[] {
  const grid = buildNavGrid(layout, 0.5)
  const reach = reachableCells(grid, layout.studentStart)
  return buildRawItems(layout).map((i) => {
    const { c, r } = grid.toCell(i.viewPoint)
    const ok = c >= 0 && r >= 0 && c < grid.cols && r < grid.rows && reach[r * grid.cols + c] === 1
    return ok ? i : { ...i, viewPoint: snapToReachable(grid, reach, i.viewPoint) }
  })
}

function buildRawItems(layout: SceneLayout): ReviewItem[] {
  const boundary: ReviewItem[] = [...layout.walls, ...layout.openings].map((b) => {
    const mid = { x: (b.from[0] + b.to[0]) / 2, z: (b.from[1] + b.to[1]) / 2 }
    return { itemId: b.id, group: 'boundary', label: BOUNDARY_LABEL[b.id] ?? b.id, basis: b.basis, viewPoint: clampInside(layout, mid), equipmentId: null }
  })
  if (layout.absProtrusion) {
    const a = layout.absProtrusion
    boundary.push({ itemId: 'abs-zone', group: 'boundary', label: 'ABS 측정 구역(남쪽 변 동쪽 끝 아래)', basis: a.basis, viewPoint: clampInside(layout, { x: (a.xMin + a.xMax) / 2, z: a.zMin }), equipmentId: null })
  }
  const pillars: ReviewItem[] = layout.pillars.map((p, i) => ({
    itemId: p.id, group: 'pillar', label: `기둥 ${i + 1}`, basis: p.basis, viewPoint: clampInside(layout, { x: p.x, z: p.z - (p.size / 2 + 0.9) }), equipmentId: null,
  }))
  const equipment: ReviewItem[] = layout.equipment.map((e) => ({
    itemId: e.id, group: 'equipment', label: e.label, basis: e.basis, viewPoint: besideEquipment(layout, e), equipmentId: e.id,
  }))
  const places: ReviewItem[] = [
    { itemId: 'student-start', group: 'place', label: '학생 시작점(초록 원)', basis: layout.studentStart.basis, viewPoint: layout.studentStart, equipmentId: null },
    { itemId: 'npc-instructor', group: 'place', label: 'NPC 교관 자리', basis: layout.npc.basis, viewPoint: { x: layout.npc.x - 1.0, z: layout.npc.z }, equipmentId: null },
  ]
  return [...boundary, ...pillars, ...equipment, ...places]
}

export function progressOf(items: ReviewItem[], draft: ReviewDraft): { answered: number; total: number } {
  return { answered: items.filter((i) => draft.answers[i.itemId]?.verdict).length, total: items.length }
}

/** 아직 표시하지 않은 항목만 ‘맞음’으로 채운다(이미 고른 답·메모는 그대로) */
export function fillUnansweredOk(items: ReviewItem[], draft: ReviewDraft): ReviewDraft {
  const answers = { ...draft.answers }
  for (const i of items) if (!answers[i.itemId]?.verdict) answers[i.itemId] = { verdict: 'ok', note: answers[i.itemId]?.note ?? '' }
  return { ...draft, answers }
}

export function kstDate(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

export function buildReviewResult(layout: SceneLayout, items: ReviewItem[], draft: ReviewDraft, opts: { appVersion: string; now: Date }) {
  const clean = (s: string) => (s.trim() === '' ? null : s.trim())
  return {
    reviewId: '3d-layout-eye-review',
    reviewDateKST: kstDate(opts.now),
    exportedAt: opts.now.toISOString(),
    scope: '3D 임시 배치의 상대 위치·모양 눈검토(치수 확인 아님)',
    layoutId: layout.layoutId,
    appVersion: opts.appVersion,
    layoutConfirmed: false,
    metricScaleKnown: layout.metricScaleKnown,
    progress: progressOf(items, draft),
    items: items.map((i) => ({ itemId: i.itemId, group: i.group, label: i.label, basis: i.basis, verdict: draft.answers[i.itemId]?.verdict ?? null, note: clean(draft.answers[i.itemId]?.note ?? '') })),
    overall: draft.overall,
    missingEquipment: clean(draft.missingEquipment),
    notes: clean(draft.notes),
  }
}
