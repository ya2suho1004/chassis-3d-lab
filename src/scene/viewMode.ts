// 시점 3단계(게임 화면): 내려다보기 · 따라가기(3인칭, 어깨 뒤) · 내 눈으로(1인칭, 눈높이)
// 카메라 수치·1인칭 고개 돌리기·가운데 조준점이 가리키는 장비를 순수 함수로 둔다(장면과 시험이 같이 쓴다).
import { footprintOf, type Pt, type SceneEquipment } from './layoutModel'

export type ViewMode = 'overview' | 'follow' | 'first'
export const VIEW_MODES: ViewMode[] = ['overview', 'follow', 'first']
export const VIEW_LABEL: Record<ViewMode, string> = { overview: '내려다보기', follow: '따라가기', first: '내 눈으로' }
/** 처음 켰을 때 시점(잠정: 따라가기 — 결정기록에서 확정) */
export const DEFAULT_VIEW: ViewMode = 'follow'

/** 눈높이(m). 캐릭터 키 1.72 기준 */
export const EYE_HEIGHT = 1.6
/** 1인칭에서 조준점으로 장비를 고를 수 있는 거리(m) */
export const AIM_RANGE = 3.5
/** 1인칭에서 이름표를 보이는 거리(m) */
export const FIRST_LABEL_RADIUS = 4
/** 1인칭 고개 돌리기 빠르기(rad/px). 어지러움을 줄이려고 느리게 둔다 */
export const LOOK_SPEED = 0.0045
export const PITCH_LIMIT = 1.2

export interface OrbitPreset { fov: number; targetY: number; distance: number; minDistance: number; maxDistance: number; minPolar: number; maxPolar: number }
export const ORBIT_PRESET: Record<Exclude<ViewMode, 'first'>, OrbitPreset> = {
  overview: { fov: 50, targetY: 1.0, distance: 9, minDistance: 3, maxDistance: 18, minPolar: 0, maxPolar: Math.PI / 2.1 },
  follow: { fov: 55, targetY: 1.35, distance: 3.4, minDistance: 1.8, maxDistance: 5, minPolar: 0.75, maxPolar: 1.5 },
}
export const FIRST_FOV = 70

/** 수평 앞 방향(fx, fz)을 보는 1인칭 yaw(카메라 기본 앞 = -z) */
export function yawFromForward(fx: number, fz: number): number {
  return Math.atan2(-fx, -fz)
}

/** 화면을 dx·dy px 끌었을 때 고개 방향. 오른쪽으로 끌면 오른쪽을 본다, 위아래는 제한 */
export function lookStep(yaw: number, pitch: number, dx: number, dy: number, speed = LOOK_SPEED): { yaw: number; pitch: number } {
  const p = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch - dy * speed))
  return { yaw: yaw - dx * speed, pitch: p }
}

/** 궤도 시점으로 바꿀 때 카메라 자리: 지금 보던 수평 방향을 유지하고 대상 뒤·위에 둔다 */
export function orbitPlacement(mode: Exclude<ViewMode, 'first'>, pos: Pt, fx: number, fz: number): { target: [number, number, number]; position: [number, number, number] } {
  const p = ORBIT_PRESET[mode]
  const l = Math.hypot(fx, fz) || 1
  const ux = fx / l, uz = fz / l
  // 내려다보기는 위에서 비스듬히(약 37°), 따라가기는 어깨 뒤에서 살짝 위(약 15°)
  const elev = mode === 'overview' ? 0.65 : 0.27
  const h = p.distance * Math.cos(elev)
  return {
    target: [pos.x, p.targetY, pos.z],
    position: [pos.x - ux * h, p.targetY + p.distance * Math.sin(elev), pos.z - uz * h],
  }
}

export const NPC_AIM = '__npc'

/**
 * 조준점 광선이 처음 닿은 점(hit)이 어느 장비인지. 바닥 높이 장비 위에 다른 장비가 겹치면(시험기 위 차량)
 * 닿은 높이를 덮는 것 중 가장 낮은 장비를 고른다. 교관 가까이면 NPC_AIM. 멀거나 아무것도 아니면 null.
 */
export function aimedTarget(equipment: SceneEquipment[], npc: Pt, hit: { x: number; y: number; z: number }, distance: number): string | null {
  if (distance > AIM_RANGE) return null
  if (Math.hypot(hit.x - npc.x, hit.z - npc.z) < 0.45 && hit.y < 2.0) return NPC_AIM
  let best: SceneEquipment | null = null
  for (const e of equipment) {
    const f = footprintOf(e)
    if (hit.x < f.xMin - 0.05 || hit.x > f.xMax + 0.05 || hit.z < f.zMin - 0.05 || hit.z > f.zMax + 0.05) continue
    if (e.h + 0.15 < hit.y) continue
    if (!best || e.h < best.h) best = e
  }
  return best?.id ?? null
}

/** 1인칭 이름표: 가까운 장비만(고른 장비·다음 단계 장비는 거리와 상관없이) */
export function firstPersonLabel(pos: Pt, e: SceneEquipment, always: boolean): boolean {
  if (always) return true
  const f = footprintOf(e)
  const dx = Math.max(f.xMin - pos.x, 0, pos.x - f.xMax)
  const dz = Math.max(f.zMin - pos.z, 0, pos.z - f.zMax)
  return Math.hypot(dx, dz) <= FIRST_LABEL_RADIUS
}
