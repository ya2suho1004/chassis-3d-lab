// 공간 채우기 그리기(설계 2026-11-14 §5): 정점 색 덩어리 메시 하나, 그림판 판 메시 하나 — 그리기 호출 두 번.
// 바닥 칠·구획선·물건 밑 그늘은 바깥 바닥 그림(hallPaint.ts)에 들어가므로 여기서는 그리지 않는다.
// 장식일 뿐이라 누를 수 없고(광선 검사에서 빠짐 — 1인칭 조준은 뒤의 벽·장비에 맞는다), 그림자를 드리우지 않는다(바닥 그림자 굽기에서도 빠진다).
// 형상은 부르는 쪽(Surroundings)이 배치가 바뀔 때만 만들고, 재질은 부품이 붙을 때 한 번 만든다.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { fillAtlas } from './fillAtlas'
import type { SpaceFillPlan } from './spaceFillPlan'

/** 광선 검사에서 빠지게 하는 빈 함수(시선 판정·누르기에 잡히지 않는다) */
export const noRaycast = (): void => {}

export function SpaceFillMeshes({ plan }: { plan: SpaceFillPlan }) {
  const mats = useMemo(() => {
    const atlas = fillAtlas()
    return {
      solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }),
      decal: new THREE.MeshStandardMaterial({ vertexColors: true, map: atlas.map, emissiveMap: atlas.glow, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.55, alphaTest: 0.5 }),
    }
  }, [])
  useEffect(() => () => { mats.solid.dispose(); mats.decal.dispose() }, [mats])
  useEffect(() => () => { plan.solid?.dispose(); plan.decal?.dispose() }, [plan])
  return (
    <group name="spaceFill">
      {plan.solid && <mesh geometry={plan.solid} material={mats.solid} raycast={noRaycast} receiveShadow />}
      {plan.decal && <mesh geometry={plan.decal} material={mats.decal} raycast={noRaycast} receiveShadow />}
    </group>
  )
}
