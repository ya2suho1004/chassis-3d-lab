// 제동력 시험기 블렌더 모델(public/assets/models/brake-tester.glb) — scripts/blender/build_brake_tester.py로 만든다.
// 두 품질 모두 쓴다(2026-10-29부터). 불러오는 중·치수가 다를 때는 코드로 만든 시험기(BrakeTesterBase+Roller)를 쓴다.
// 둘레 줄무늬 철판은 모델에 없고 장면 코드(CheckerSurround)가 그린다. 압축은 meshopt(외부 다운로드 없음).
import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'

export const BRAKE_TESTER_URL = `${import.meta.env.BASE_URL}assets/models/brake-tester.glb`

/** 모델이 맞춘 치수: 시험기 3.0×1.2, 바퀴 중심 x=±0.7(시험 차량 폭 1.6). 롤러·리프트 판 위치는 BrakeRig 상수와 같다. */
export const BRAKE_TESTER_SPEC = { w: 3.0, d: 1.2, wheelX: 0.7 } as const
export const BRAKE_TESTER_ROLLERS = ['Roller_LN', 'Roller_LS', 'Roller_RN', 'Roller_RS'] as const
export const BRAKE_TESTER_LIFTS = ['Lift_L', 'Lift_R'] as const

/** 배치 데이터의 시험기 크기와 바퀴 자리가 모델과 같을 때만 모델을 쓴다. */
export function fitsBrakeTester(t: { w: number; d: number }, wheelX: number): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.05
  return near(t.w, BRAKE_TESTER_SPEC.w) && near(t.d, BRAKE_TESTER_SPEC.d) && near(wheelX, BRAKE_TESTER_SPEC.wheelX)
}

export function BrakeTesterModel({ onParts }: { onParts: (rollers: THREE.Object3D[], lifts: THREE.Object3D[]) => void }) {
  const gltf = useGLTF(BRAKE_TESTER_URL, false, true)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])

  useLayoutEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
  }, [scene])

  useLayoutEffect(() => {
    const pick = (names: readonly string[]) => names.map((n) => scene.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o)
    onParts(pick(BRAKE_TESTER_ROLLERS), pick(BRAKE_TESTER_LIFTS))
  }, [scene, onParts])

  return <primitive object={scene} />
}
