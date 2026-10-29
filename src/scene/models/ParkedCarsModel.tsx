// 세워 둔 실습 차량 블렌더 모델 2종 — 두 품질 모두 쓴다. 불러오는 중·치수가 다를 때는 코드 모델(StaticCar)을 쓴다.
//  · 최소회전반경 측정 차량: 은색 준중형 세단(1세대 K3 비례, 앞바퀴 아래 빨간 회전반경 측정판 포함) — scripts/blender/build_k3.py → k3.glb
//  · 캠버·캐스터 측정 차량: 흰색 소형 5도어 해치백(2세대 프라이드 비례) — scripts/blender/build_pride.py → pride.glb
// 상표·로고·번호 글자는 없다. 압축은 meshopt(외부 다운로드 없음). 움직이는 부분이 없어 노드를 넘기지 않는다.
import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'

export const K3_URL = `${import.meta.env.BASE_URL}assets/models/k3.glb`
export const PRIDE_URL = `${import.meta.env.BASE_URL}assets/models/pride.glb`

/** 블렌더 스크립트 상수와 같아야 한다(w = 2·HALF_W, d = L, wheelbase = AXLE_F − AXLE_R). 길이 m */
export const K3_SPEC = { w: 1.78, d: 4.56, h: 1.435, wheelbase: 2.7, wheelR: 0.318 } as const
export const PRIDE_SPEC = { w: 1.72, d: 4.05, h: 1.455, wheelbase: 2.57, wheelR: 0.311 } as const

type Footprint = { w: number; d: number }
const near = (a: number, b: number) => Math.abs(a - b) <= 0.05
/** 배치 데이터의 차 크기(길이 방향은 w·d 중 긴 쪽)가 모델과 맞을 때만 모델을 쓴다 */
function fits(e: Footprint, s: { w: number; d: number }): boolean {
  return near(Math.max(e.w, e.d), s.d) && near(Math.min(e.w, e.d), s.w)
}
export const fitsK3 = (e: Footprint) => fits(e, K3_SPEC)
export const fitsPride = (e: Footprint) => fits(e, PRIDE_SPEC)

function useCarScene(url: string): THREE.Object3D {
  const gltf = useGLTF(url, false, true)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  useLayoutEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
    })
  }, [scene])
  return scene
}

/** 모델 앞은 −z. 배치에서 길이가 x 방향(w > d)이면 alongX로 90° 돌린다(코드 StaticCar와 같은 방향: 앞이 −x) */
export function K3Model({ alongX = false }: { alongX?: boolean }) {
  const scene = useCarScene(K3_URL)
  return <group rotation-y={alongX ? Math.PI / 2 : 0}><primitive object={scene} /></group>
}

export function PrideModel({ alongX = false }: { alongX?: boolean }) {
  const scene = useCarScene(PRIDE_URL)
  return <group rotation-y={alongX ? Math.PI / 2 : 0}><primitive object={scene} /></group>
}
