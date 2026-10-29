// 실습장 사람 캐릭터(public/assets/models/character.glb) — scripts/blender/build_character.py로 만든다.
// 학생 아바타와 NPC 교관이 같은 모델을 쓰고 옷 색만 바꾼다. 동작: Idle(서 있기)·Walk(걷기)·Gesture(설명 손짓).
// 두 품질 모두 쓴다(2026-10-29부터). 불러오는 중은 코드 모델(Person)을 쓴다. 특정 인물을 닮지 않은 일반 캐릭터다.
import { useAnimations, useGLTF } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { SkeletonUtils } from 'three-stdlib'

export const CHARACTER_URL = `${import.meta.env.BASE_URL}assets/models/character.glb`
export const CHARACTER_CLIPS = ['Idle', 'Walk', 'Gesture'] as const
export type CharacterAction = (typeof CHARACTER_CLIPS)[number]

/** 옷 색(재질 이름 Top·Bottom·Shoes). 실습복 사진을 받으면 여기 값만 바꾼다 */
export interface Outfit { top: string; bottom: string; shoes?: string }
export const STUDENT_OUTFIT: Outfit = { top: '#2f5fb3', bottom: '#2b3a55' }
export const INSTRUCTOR_OUTFIT: Outfit = { top: '#24324a', bottom: '#1f2733' }

/** 걷기 동작 한 주기(1초)에 나아가는 거리(m) — 이동 속도에 맞춰 재생 속도를 정한다 */
export const WALK_CYCLE_DISTANCE = 1.47

/** 모델 앞은 -z. 이동 방향(dx, dz)을 보게 하는 y 회전 */
export function headingFor(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz)
}

export function CharacterModel({ action, outfit, speed = 1 }: { action: CharacterAction; outfit: Outfit; speed?: number }) {
  const { scene, animations } = useGLTF(CHARACTER_URL, false, true)
  // 뼈대가 있는 모델은 SkeletonUtils로 복제해야 학생·교관이 따로 움직인다
  const clone = useMemo(() => SkeletonUtils.clone(scene) as THREE.Group, [scene])
  const root = useRef<THREE.Group>(null)
  const { actions } = useAnimations(animations, root)

  useLayoutEffect(() => {
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.frustumCulled = false // 뼈로 움직인 몸이 원래 경계 상자를 벗어나도 사라지지 않게
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
      const color = mat.name === 'Top' ? outfit.top : mat.name === 'Bottom' ? outfit.bottom : mat.name === 'Shoes' ? outfit.shoes : undefined
      if (color) mat.color.set(color)
      mesh.material = mat
    })
  }, [clone, outfit])

  useEffect(() => {
    const a = actions[action]
    if (!a) return
    a.reset().fadeIn(0.25).play()
    return () => { a.fadeOut(0.25) }
  }, [action, actions])

  useEffect(() => {
    const a = actions[action]
    if (a) a.timeScale = speed
  }, [action, actions, speed])

  return <group ref={root}><primitive object={clone} /></group>
}
