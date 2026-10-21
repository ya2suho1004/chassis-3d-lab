// 임시 배치 모델 — src/data/layout/layout.dev-provisional.json 을 읽어 3D 장면·길찾기가 쓰는 형태로 만든다.
// 원칙: 이 배치는 '개발용 임시'다. 실측(measured)·부분 실측·스케치 비례·가정·교사 답을 항목마다 basis로 구분하고,
// layoutConfirmed=false·metricScaleKnown=false를 그대로 전달한다. 실제 학교 재현 완료라고 표현하지 않는다.

export type Basis = 'measured' | 'measured-partial' | 'sketch' | 'assumption' | 'teacher'
export interface Pt { x: number; z: number }
export interface Rect { xMin: number; xMax: number; zMin: number; zMax: number }

export interface SceneEquipment {
  id: string
  label: string
  kind: string
  x: number
  z: number
  w: number
  d: number
  h: number
  rotation: number
  color: string
  basis: Basis
  photos: number[]
  interactive: boolean
  accessPoint: Pt | null
  info: string
}
export interface ScenePillar { id: string; x: number; z: number; size: number; basis: Basis }
export interface SceneWall { id: string; from: [number, number]; to: [number, number]; basis: string; note?: string }
export interface SceneOpening { id: string; from: [number, number]; to: [number, number]; connectsTo: string; basis: string }

export interface SceneLayout {
  layoutId: string
  sourceStatus: 'devProvisional' | 'surveyed' | 'teacherApproved'
  layoutConfirmed: boolean
  metricScaleKnown: boolean
  note: string
  mainZone: Rect & { basis: string }
  absProtrusion: (Rect & { basis: string; note?: string }) | null
  walls: SceneWall[]
  openings: SceneOpening[]
  studentStart: Pt & { basis: string }
  npc: { id: string; x: number; z: number; facing: string; basis: string }
  pillars: ScenePillar[]
  equipment: SceneEquipment[]
}

export function loadSceneLayout(raw: unknown): SceneLayout {
  const r = raw as Record<string, unknown>
  const need = (k: string) => {
    if (!(k in r)) throw new Error(`layout: '${k}' 누락`)
    return r[k]
  }
  const mz = need('mainZone') as SceneLayout['mainZone']
  const eq = (need('equipment') as Array<Record<string, unknown>>).map((e) => ({
    id: String(e.id),
    label: String(e.label),
    kind: String(e.kind),
    x: Number(e.x),
    z: Number(e.z),
    w: Number(e.w),
    d: Number(e.d),
    h: Number(e.h ?? 1),
    rotation: Number(e.rotation ?? 0),
    color: String(e.color ?? '#9e9e9e'),
    basis: e.basis as Basis,
    photos: (e.photos as number[] | undefined) ?? [],
    interactive: Boolean(e.interactive),
    accessPoint: (e.accessPoint as Pt | undefined) ?? null,
    info: String(e.info ?? ''),
  }))
  for (const e of eq) {
    if (!Number.isFinite(e.x) || !Number.isFinite(e.z) || !(e.w > 0) || !(e.d > 0)) throw new Error(`layout: 장비 ${e.id} 좌표·크기 오류`)
    if (!e.basis) throw new Error(`layout: 장비 ${e.id} basis 누락`)
  }
  return {
    layoutId: String(need('layoutId')),
    sourceStatus: need('sourceStatus') as SceneLayout['sourceStatus'],
    layoutConfirmed: Boolean(need('layoutConfirmed')),
    metricScaleKnown: Boolean(r.metricScaleKnown ?? false),
    note: String(r.note ?? ''),
    mainZone: mz,
    absProtrusion: (r.absProtrusion as SceneLayout['absProtrusion']) ?? null,
    walls: (r.walls as SceneWall[]) ?? [],
    openings: (r.openings as SceneOpening[]) ?? [],
    studentStart: need('studentStart') as SceneLayout['studentStart'],
    npc: need('npc') as SceneLayout['npc'],
    pillars: (r.pillars as ScenePillar[]) ?? [],
    equipment: eq,
  }
}

/** 회전(0/90/180/270만 지원)을 반영한 축 정렬 발자국 */
export function footprintOf(e: { x: number; z: number; w: number; d: number; rotation: number }): Rect {
  const swap = ((Math.round(e.rotation / 90) % 2) + 2) % 2 === 1
  const w = swap ? e.d : e.w
  const d = swap ? e.w : e.d
  return { xMin: e.x - w / 2, xMax: e.x + w / 2, zMin: e.z - d / 2, zMax: e.z + d / 2 }
}

export function pillarRect(p: ScenePillar): Rect {
  return { xMin: p.x - p.size / 2, xMax: p.x + p.size / 2, zMin: p.z - p.size / 2, zMax: p.z + p.size / 2 }
}

/** 접근점이 있으면 접근점, 없으면 발자국 가장자리까지의 거리로 근접을 판정 */
export function nearEquipment(pos: Pt, e: SceneEquipment, radius: number): boolean {
  if (e.accessPoint) return Math.hypot(pos.x - e.accessPoint.x, pos.z - e.accessPoint.z) <= radius
  const f = footprintOf(e)
  const dx = Math.max(f.xMin - pos.x, 0, pos.x - f.xMax)
  const dz = Math.max(f.zMin - pos.z, 0, pos.z - f.zMax)
  return Math.hypot(dx, dz) <= radius
}
