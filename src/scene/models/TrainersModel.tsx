// 교육용 장비 블렌더 모델 — 변속기 시뮬레이터(public/assets/models/transmission-simulator.glb, scripts/blender/build_transmission_simulator.py)와
// 쇽업소버 분해 장비(shock-stand.glb, build_shock_stand.py). 두 품질 모두 쓴다. 불러오는 중·자리가 좁을 때는 코드 모델(Machine·Stand)을 쓴다.
// 모델 앞(조작판·손잡이 쪽)은 지역 -z(블렌더 +Y)다. 두 장비 모두 북쪽 벽을 등지고 있으므로 반 바퀴 돌려 앞이 +z(남쪽, 실습장 안쪽)를 보게 둔다.
// 글자·상표는 넣지 않았다. 치수는 사진 비례 가정(미측정).
import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'

export const TRANSMISSION_SIMULATOR_URL = `${import.meta.env.BASE_URL}assets/models/transmission-simulator.glb`
export const SHOCK_STAND_URL = `${import.meta.env.BASE_URL}assets/models/shock-stand.glb`

/** build_transmission_simulator.py 상수(W, D, H)와 같아야 한다. reach = 변속 레버까지 포함한 바닥 크기(폭·깊이) */
export const TRANSMISSION_SIMULATOR = { w: 1.8, d: 1.4, h: 1.65, reach: { w: 2.0, d: 1.45 } } as const
/** build_shock_stand.py 상수(BASE_R, H)와 같아야 한다. reach = 손잡이까지 포함한 바닥 크기 */
export const SHOCK_STAND = { baseR: 0.32, h: 1.47, reach: { w: 0.8, d: 0.75 } } as const

/** 배치 자리(폭·깊이)가 모델 바닥 크기보다 넓을 때만 모델을 쓴다 */
export function fitsTransmissionSimulator(e: { w: number; d: number }): boolean {
  return e.w >= TRANSMISSION_SIMULATOR.reach.w && e.d >= TRANSMISSION_SIMULATOR.reach.d
}
export function fitsShockStand(e: { w: number; d: number }): boolean {
  return e.w >= SHOCK_STAND.reach.w && e.d >= SHOCK_STAND.reach.d
}

function useModel(url: string) {
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

export function TransmissionSimulatorModel() {
  const scene = useModel(TRANSMISSION_SIMULATOR_URL)
  return <group rotation-y={Math.PI}><primitive object={scene} /></group>
}

export function ShockStandModel() {
  const scene = useModel(SHOCK_STAND_URL)
  return <group rotation-y={Math.PI}><primitive object={scene} /></group>
}
