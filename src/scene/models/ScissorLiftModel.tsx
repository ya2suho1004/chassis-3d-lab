// 가위형 리프트 블렌더 모델(public/assets/models/scissor-lift.glb) — scripts/blender/build_scissor_lift.py로 만든다.
// 리프트 위 차량(1세대 아반떼, public/assets/models/avante.glb) — scripts/blender/build_avante.py로 만든다.
// 품질 높음에서만 쓴다. 품질 낮음(태블릿)·불러오는 중·치수가 다를 때는 코드 모델(CodeScissorLift·StaticCar)을 쓴다.
// 오르내림은 표시 전용이다(과제 판정·기록과 무관). 압축은 meshopt(외부 다운로드 없음).
import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'

export const SCISSOR_LIFT_URL = `${import.meta.env.BASE_URL}assets/models/scissor-lift.glb`
export const AVANTE_URL = `${import.meta.env.BASE_URL}assets/models/avante.glb`

/** 블렌더 스크립트의 상수와 같아야 한다(build_scissor_lift.py). 길이 m. */
export const SCISSOR = {
  w: 2.2, d: 4.0,
  restTop: 0.4, raisedTop: 1.6, // 발판 윗면 높이: 내려감(배치 데이터 h) / 올라감(가정)
  deck: 0.12, pinZ: 0.1, arm: 1.9,
} as const
export const SCISSOR_NODES = { runways: ['Runway_L', 'Runway_R'], armBase: ['ArmBase_L', 'ArmBase_R'], armTop: ['ArmTop_L', 'ArmTop_R'] } as const

/** 아반떼 J2 공식 제원(전폭 1.70 · 전장 4.42 · 전고 1.395) */
export const AVANTE_SPEC = { w: 1.7, d: 4.42, h: 1.395 } as const

/** 발판 높이 → 가위 다리 각도 φ(rad)와 위 핀 높이. φ = asin((발판 − deck − pinZ) / arm) */
export function scissorPose(top: number): { phi: number; armTopY: number } {
  const s = (top - SCISSOR.deck - SCISSOR.pinZ) / SCISSOR.arm
  return { phi: Math.asin(Math.min(0.99, Math.max(0, s))), armTopY: top - SCISSOR.deck }
}

export function fitsScissorLift(e: { w: number; d: number; h: number }): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.05
  return near(e.w, SCISSOR.w) && near(e.d, SCISSOR.d) && near(e.h, SCISSOR.restTop)
}

export interface ScissorParts { runways: THREE.Object3D[]; armBase: THREE.Object3D[]; armTop: THREE.Object3D[] }

/** 움직이는 노드를 넘겨 준다. 높이는 부모(LiftRig)가 매 프레임 scissorPose로 맞춘다. */
export function ScissorLiftModel({ onParts }: { onParts: (p: ScissorParts) => void }) {
  const gltf = useGLTF(SCISSOR_LIFT_URL, false, true)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  useLayoutEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
    })
    const pick = (names: readonly string[]) => names.map((n) => scene.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o)
    onParts({ runways: pick(SCISSOR_NODES.runways), armBase: pick(SCISSOR_NODES.armBase), armTop: pick(SCISSOR_NODES.armTop) })
  }, [scene, onParts])
  return <primitive object={scene} />
}

export function AvanteModel() {
  const gltf = useGLTF(AVANTE_URL, false, true)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  useLayoutEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
    })
  }, [scene])
  return <primitive object={scene} />
}
