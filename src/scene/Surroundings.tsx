// 실습장 둘레 꾸밈: 트인 쪽(서쪽 엔진 실습 구역·남쪽 전기 실습 구역) 너머 바닥과 건물 벽, 천장과 조명판, 먼 곳 안개.
// 1인칭에서 트인 쪽을 보면 빈 회색이 보이던 것을 메운다. 실제 이웃 구역 재현이 아니며(장비 없음) 걸어 들어갈 수 없다(이동 격자 밖).
// 천장 높이는 미측정 가정값. 천장·조명판은 아래쪽만 보이는 면이라 위에서 내려다보면 가리지 않는다.
import * as THREE from 'three'
import { useMemo } from 'react'
import type { SceneLayout } from './layoutModel'

/** 천장 높이(m, 가정 — 미측정). 실습장 벽(3.4 m) 위는 흰 벽으로 이어 붙인다 */
export const CEILING_H = 4.2
export const LAB_WALL_H = 3.4
/** 트인 쪽 너머로 보이는 바닥 폭(m, 꾸밈) */
export const HALL_MARGIN = 10

export interface HallBounds { xMin: number; xMax: number; zMin: number; zMax: number }

/** 건물 안쪽 범위: 북·동은 실습장 외벽 그대로, 서·남은 트인 쪽 너머로 HALL_MARGIN만큼 */
export function hallBounds(layout: SceneLayout): HallBounds {
  const zones = [layout.mainZone, ...(layout.absProtrusion ? [layout.absProtrusion] : [])]
  return {
    xMin: Math.min(...zones.map((z) => z.xMin)) - HALL_MARGIN,
    xMax: Math.max(...zones.map((z) => z.xMax)),
    zMin: Math.min(...zones.map((z) => z.zMin)),
    zMax: Math.max(...zones.map((z) => z.zMax)) + HALL_MARGIN * 0.6,
  }
}

/** 천장 조명판 자리(3 m 간격 격자) */
export function lightPanels(b: HallBounds, step = 3): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let x = b.xMin + step / 2; x < b.xMax; x += step) for (let z = b.zMin + step / 2; z < b.zMax; z += step) out.push([x, z])
  return out
}

/** 안쪽을 보는 벽 한 면(바깥에서는 보이지 않음) */
function InnerWall({ x1, z1, x2, z2, y0, y1, inward, mat }: { x1: number; z1: number; x2: number; z2: number; y0: number; y1: number; inward: [number, number]; mat: THREE.Material }) {
  const len = Math.hypot(x2 - x1, z2 - z1)
  return (
    <mesh position={[(x1 + x2) / 2, (y0 + y1) / 2, (z1 + z2) / 2]} rotation-y={Math.atan2(inward[0], inward[1])} material={mat}>
      <planeGeometry args={[len, y1 - y0]} />
    </mesh>
  )
}

export function Surroundings({ layout }: { layout: SceneLayout }) {
  const b = useMemo(() => hallBounds(layout), [layout])
  const mats = useMemo(() => ({
    floor: new THREE.MeshStandardMaterial({ color: '#8f979c', roughness: 0.85 }),
    wall: new THREE.MeshStandardMaterial({ color: '#e9ecee', roughness: 0.9 }),
    wallLow: new THREE.MeshStandardMaterial({ color: '#9aa3a8', roughness: 0.9 }),
    // 천장은 조명 영향 없이 밝은 회색(반구광의 바닥색이 아래 보는 면을 초록으로 물들이지 않게)
    ceiling: new THREE.MeshBasicMaterial({ color: '#c9ced1' }),
    panel: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  }), [])
  const panels = useMemo(() => lightPanels(b), [b])
  const panelGeo = useMemo(() => new THREE.PlaneGeometry(1.2, 0.3), [])
  const w = b.xMax - b.xMin, d = b.zMax - b.zMin
  const cx = (b.xMin + b.xMax) / 2, cz = (b.zMin + b.zMax) / 2
  return (
    <group>
      {/* 바깥 바닥: 실습장 바닥보다 아주 조금 아래(겹쳐 깜박이지 않게) */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.004, cz]} material={mats.floor} receiveShadow><planeGeometry args={[w, d]} /></mesh>
      {/* 건물 벽: 북(서쪽으로 이어짐) · 서 · 남 · 동(남쪽으로 이어짐) */}
      <InnerWall x1={b.xMin} z1={b.zMin} x2={layout.mainZone.xMin} z2={b.zMin} y0={0} y1={1.1} inward={[0, 1]} mat={mats.wallLow} />
      <InnerWall x1={b.xMin} z1={b.zMin} x2={layout.mainZone.xMin} z2={b.zMin} y0={1.1} y1={CEILING_H} inward={[0, 1]} mat={mats.wall} />
      <InnerWall x1={b.xMin} z1={b.zMin} x2={b.xMin} z2={b.zMax} y0={0} y1={1.1} inward={[1, 0]} mat={mats.wallLow} />
      <InnerWall x1={b.xMin} z1={b.zMin} x2={b.xMin} z2={b.zMax} y0={1.1} y1={CEILING_H} inward={[1, 0]} mat={mats.wall} />
      <InnerWall x1={b.xMin} z1={b.zMax} x2={b.xMax} z2={b.zMax} y0={0} y1={1.1} inward={[0, -1]} mat={mats.wallLow} />
      <InnerWall x1={b.xMin} z1={b.zMax} x2={b.xMax} z2={b.zMax} y0={1.1} y1={CEILING_H} inward={[0, -1]} mat={mats.wall} />
      <InnerWall x1={b.xMax} z1={layout.mainZone.zMax} x2={b.xMax} z2={b.zMax} y0={0} y1={1.1} inward={[-1, 0]} mat={mats.wallLow} />
      <InnerWall x1={b.xMax} z1={layout.mainZone.zMax} x2={b.xMax} z2={b.zMax} y0={1.1} y1={CEILING_H} inward={[-1, 0]} mat={mats.wall} />
      {/* 실습장 외벽(3.4 m) 위를 천장까지 */}
      {layout.walls.map((wl) => {
        const [x1, z1] = wl.from, [x2, z2] = wl.to
        const inward: [number, number] = Math.abs(z2 - z1) < 1e-6 ? [0, 1] : [-1, 0]
        return <InnerWall key={wl.id} x1={x1} z1={z1} x2={x2} z2={z2} y0={LAB_WALL_H} y1={CEILING_H} inward={inward} mat={mats.wall} />
      })}
      {/* 천장(아래를 보는 면) + 조명판 */}
      <mesh rotation-x={Math.PI / 2} position={[cx, CEILING_H, cz]} material={mats.ceiling}><planeGeometry args={[w, d]} /></mesh>
      {panels.map(([x, z]) => <mesh key={`${x},${z}`} rotation-x={Math.PI / 2} position={[x, CEILING_H - 0.01, z]} geometry={panelGeo} material={mats.panel} />)}
    </group>
  )
}
