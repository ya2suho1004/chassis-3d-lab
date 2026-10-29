// 북쪽 벽 정비 기계 블렌더 모델 — 휠 밸런서(public/assets/models/wheel-balancer.glb, scripts/blender/build_wheel_balancer.py)와
// 타이어 탈착기(tire-changer.glb, build_tire_changer.py). 두 품질 모두 쓴다. 불러오는 중·치수가 다를 때는 코드 모델(Machine)을 쓴다.
// 앞면 = 지역 +z(북쪽 벽에 붙인 회전 0 배치에서 실습장 안쪽을 본다). 상표·글자는 없다.
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'

export const WHEEL_BALANCER_URL = `${import.meta.env.BASE_URL}assets/models/wheel-balancer.glb`
export const TIRE_CHANGER_URL = `${import.meta.env.BASE_URL}assets/models/tire-changer.glb`

/** build_wheel_balancer.py의 W, D, H와 같다(m). 바퀴 노드 Wheel은 지역 x축으로 돈다 */
export const WHEEL_BALANCER = { w: 1.4, d: 1.4, h: 1.2, spinNode: 'Wheel' } as const
/** build_tire_changer.py의 W, D, H와 같다(m). 뒤 기둥 때문에 높이는 배치값(스케치 1.2)보다 높은 1.85(사진 37, 가정). 회전판 노드 Turntable은 지역 y축으로 돈다 */
export const TIRE_CHANGER = { w: 1.4, d: 1.7, h: 1.85, spinNode: 'Turntable' } as const

const near = (a: number, b: number) => Math.abs(a - b) <= 0.05

export function fitsWheelBalancer(e: { w: number; d: number; h: number }): boolean {
  return near(e.w, WHEEL_BALANCER.w) && near(e.d, WHEEL_BALANCER.d) && near(e.h, WHEEL_BALANCER.h)
}

/** 바닥 크기만 본다(높이는 모델이 배치값보다 높다) */
export function fitsTireChanger(e: { w: number; d: number }): boolean {
  return near(e.w, TIRE_CHANGER.w) && near(e.d, TIRE_CHANGER.d)
}

function useMachine(url: string, spinNode: string, axis: 'x' | 'y', spin: number) {
  const gltf = useGLTF(url, false, true)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  const part = useMemo(() => scene.getObjectByName(spinNode) ?? null, [scene, spinNode])
  useLayoutEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
    })
  }, [scene])
  useFrame((_, dt) => {
    if (spin && part) part.rotation[axis] += spin * Math.min(dt, 0.1)
  })
  return scene
}

/** spin: 바퀴 도는 빠르기(rad/s, 0이면 멈춤) */
export function WheelBalancerModel({ spin = 0 }: { spin?: number }) {
  const scene = useMachine(WHEEL_BALANCER_URL, WHEEL_BALANCER.spinNode, 'x', spin)
  return <primitive object={scene} />
}

/** spin: 회전판 도는 빠르기(rad/s, 0이면 멈춤) */
export function TireChangerModel({ spin = 0 }: { spin?: number }) {
  const scene = useMachine(TIRE_CHANGER_URL, TIRE_CHANGER.spinNode, 'y', spin)
  return <primitive object={scene} />
}
