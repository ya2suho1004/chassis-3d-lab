// 공간 채우기 형상 만들기(설계 2026-11-14 §5): 이웃 구역 물건과 벽 꾸밈을 두 형상(정점 색 덩어리, 그림판 판)으로 합치고,
// 바깥 바닥 그림에 넣을 구역 칠·물건 밑 그늘 자리를 함께 돌려준다. 그래픽 장치 없이 만들 수 있다(시험이 node에서 정점을 잰다).
import type * as THREE from 'three'
import type { SceneLayout } from '../layoutModel'
import type { HallBounds } from '../Surroundings'
import { buildNeighborZones, type ZonePaint } from './neighborZones'
import { PartKit, type Footprint } from './partKit'
import { buildWallDressing } from './wallDressing'

export interface SpaceFillPlan { solid: THREE.BufferGeometry | null; decal: THREE.BufferGeometry | null; paint: ZonePaint[]; feet: Footprint[] }

export function buildSpaceFill(b: HallBounds, layout: Pick<SceneLayout, 'mainZone' | 'absProtrusion'>): SpaceFillPlan {
  const kits = { solid: new PartKit(), decal: new PartKit() }
  const paint = buildNeighborZones(kits, b, layout)
  buildWallDressing(kits, b, layout)
  return { solid: kits.solid.build(), decal: kits.decal.build(), paint, feet: kits.solid.feet }
}
