// 시험 차량 블렌더 모델(public/assets/models/test-car.glb) — scripts/blender/build_test_car.py로 만든다.
// 두 품질 모두 쓴다(2026-10-29부터). 불러오는 중·치수가 다를 때는 코드로 만든 차량(CarBody)을 쓴다.
// 파일은 meshopt 압축이다. 압축 해제기는 앱 안에 들어 있어 외부 사이트에서 받지 않는다(Draco 끔).
import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'

export const TEST_CAR_URL = `${import.meta.env.BASE_URL}assets/models/test-car.glb`

/** 모델이 맞춘 치수. 장면 코드의 바퀴 반지름 0.3, 축간 2.4, 뒤축 = 길이/2 − 0.6, 바퀴 중심 x = 폭/2 − 0.1과 같다. */
export const TEST_CAR_SPEC = { w: 1.6, d: 3.6, h: 1.5 } as const
export const TEST_CAR_WHEELS = { front: ['Wheel_FL', 'Wheel_FR'], rear: ['Wheel_RL', 'Wheel_RR'] } as const

/** 배치 데이터의 차량 크기가 모델과 같을 때만 모델을 쓴다(다르면 위치·바퀴가 어긋난다). */
export function fitsTestCar(v: { w: number; d: number; h: number }): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.05
  return near(v.w, TEST_CAR_SPEC.w) && near(v.d, TEST_CAR_SPEC.d) && near(v.h, TEST_CAR_SPEC.h)
}

export function TestCarModel({ highlight, onWheels }: { highlight?: boolean; onWheels: (front: THREE.Object3D[], rear: THREE.Object3D[]) => void }) {
  const gltf = useGLTF(TEST_CAR_URL, false, true)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffb74d', emissive: '#ff8f00', emissiveIntensity: 0.35, roughness: 0.4 }), [])
  const paint = useMemo(() => {
    const list: Array<{ mesh: THREE.Mesh; original: THREE.Material }> = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const mat = mesh.material as THREE.Material
      if (mat.name === 'Paint') list.push({ mesh, original: mat })
    })
    return list
  }, [scene])

  useLayoutEffect(() => {
    for (const p of paint) p.mesh.material = highlight ? glow : p.original
  }, [paint, glow, highlight])

  useLayoutEffect(() => {
    const pick = (names: readonly string[]) => names.map((n) => scene.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o)
    onWheels(pick(TEST_CAR_WHEELS.front), pick(TEST_CAR_WHEELS.rear))
  }, [scene, onWheels])

  return <primitive object={scene} />
}
