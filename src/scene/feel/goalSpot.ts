// src/scene/feel/goalSpot.ts
// 목적지 표식이 설 자리(설계 2026-11-12 §4.5): 장비의 바닥 둘레와, 표식을 띄울 높이의 바탕.
import { footprintOf } from '../layoutModel'

/** 가운데(x, z), 바닥 둘레 크기(w × d), 그 자리에서 가장 높은 것의 높이(h). 단위 m */
export interface GoalSpot { x: number; z: number; w: number; d: number; h: number }

interface Placed { id: string; x: number; z: number; w: number; d: number; h: number; rotation: number }

/**
 * 목적지 장비의 표식 자리. 목적지가 없거나 배치에 없으면 null.
 * 높이는 그 자리에 겹쳐 놓인 것(제동력 시험기 위의 차량 등) 가운데 가장 높은 것을 쓴다 — 표식이 그 안에 묻히지 않게.
 * 맞닿기만 한 이웃은 겹친 것으로 치지 않는다.
 */
export function goalSpotOf(equipment: readonly Placed[], goalId: string | null): GoalSpot | null {
  const goal = goalId ? equipment.find((e) => e.id === goalId) : undefined
  if (!goal) return null
  const f = footprintOf(goal)
  let h = goal.h
  for (const e of equipment) {
    if (e.id === goal.id) continue
    const g = footprintOf(e)
    if (g.xMin < f.xMax && g.xMax > f.xMin && g.zMin < f.zMax && g.zMax > f.zMin) h = Math.max(h, e.h)
  }
  return { x: goal.x, z: goal.z, w: f.xMax - f.xMin, d: f.zMax - f.zMin, h }
}
