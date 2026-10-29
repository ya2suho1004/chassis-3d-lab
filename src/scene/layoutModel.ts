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

/** 차량 진입 방향(세션 설정)에 따른 시험 차량 자리. 후륜 축 = 롤러 중심. 미설정(null)은 북쪽을 가정으로 두고 assumed=true(U6: 방향에 의존하는 연출을 자동 시작하지 않음). */
export function vehiclePlacement(layout: SceneLayout, dir: 'north' | 'south' | null): { x: number; z: number; rotation: number; assumed: boolean } {
  const tester = layout.equipment.find((e) => e.id === 'brake-tester-01')
  const vehicle = layout.equipment.find((e) => e.id === 'brake-vehicle-01')
  if (!tester || !vehicle) return { x: vehicle?.x ?? 0, z: vehicle?.z ?? 0, rotation: 0, assumed: true }
  const half = vehicle.d / 2
  const rearAxleOffset = half - 0.6 // 뒤축이 차체 뒤끝에서 약 0.6 m 앞(제원 추정)
  const z = dir === 'south' ? tester.z + rearAxleOffset : tester.z - rearAxleOffset
  return { x: tester.x, z, rotation: dir === 'south' ? 180 : 0, assumed: dir === null }
}

export type LabelMode = 'all' | 'focus' | 'near'
/** 3D 이름표 표시 규칙. 'focus'(과제 중 기본)는 고른 장비·다음 단계 장비·작동 장비만 보여 화면 가림을 줄인다 */
export function showsLabel(mode: LabelMode, e: { selected: boolean; highlight: boolean; interactive: boolean }): boolean {
  return mode === 'all' || e.selected || e.highlight || e.interactive
}

/** 'near'(게임 화면 기본) 모드에서 이름표를 보이는 거리(m, 장비 바닥 둘레까지) */
export const NEAR_LABEL_RADIUS = 3
/**
 * 게임 화면 이름표: 가까운(3 m)·고른·강조·조준한 장비는 이름표, 멀리 있는 작동 장비는 작은 표시(◆)만, 나머지는 숨김.
 * 표시는 '작동 장비'면 늘 같아 다음 단계를 드러내지 않는다(안내 없음 조건).
 * 'all'·'focus'는 기존 규칙(showsLabel) 그대로 이름표 또는 숨김.
 */
export function labelState(mode: LabelMode, e: { selected: boolean; highlight: boolean; interactive: boolean; aimed?: boolean; distance: number }): 'label' | 'marker' | null {
  if (mode !== 'near') return showsLabel(mode, e) ? 'label' : null
  if (e.selected || e.highlight || e.aimed || e.distance <= NEAR_LABEL_RADIUS) return 'label'
  return e.interactive ? 'marker' : null
}

/** 점에서 장비 바닥 둘레까지 거리(m). 안이면 0 */
export function distanceToFootprint(p: Pt, e: { x: number; z: number; w: number; d: number; rotation: number }): number {
  const f = footprintOf(e)
  const dx = Math.max(f.xMin - p.x, 0, p.x - f.xMax)
  const dz = Math.max(f.zMin - p.z, 0, p.z - f.zMax)
  return Math.hypot(dx, dz)
}
