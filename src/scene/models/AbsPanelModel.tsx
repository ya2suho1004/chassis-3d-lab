// 공용 조작부 블렌더 모델(public/assets/models/abs-panel.glb) — scripts/blender/build_abs_panel.py로 만든다.
// 품질 높음에서만 쓴다. 품질 낮음(태블릿)·불러오는 중·치수가 다를 때는 코드 모델(AbsPanel)을 쓴다.
// 모델에는 글자가 없다. 버튼 이름·ABS TESTER·명판 글자는 아래 평면 두 장으로 덧붙인다(자리는 블렌더 스크립트의 FACE·PLATE 값과 같다).
import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { absTesterLabelTexture, cabinetPlateTexture } from './textures'

export const ABS_PANEL_URL = `${import.meta.env.BASE_URL}assets/models/abs-panel.glb`

/** build_abs_panel.py 상수와 같아야 한다. 길이 m, 앞면 = 지역 -z */
export const ABS_PANEL = {
  w: 0.7, d: 0.5, h: 1.5,
  face: { w: 0.63, h: 0.375, y: 1.2, out: 0.11 },
  plate: { w: 0.574, h: 0.18, y: 0.93, out: 0.008 },
} as const

export function fitsAbsPanel(e: { w: number; d: number; h: number }): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.05
  return near(e.w, ABS_PANEL.w) && near(e.d, ABS_PANEL.d) && near(e.h, ABS_PANEL.h)
}

export function AbsPanelModel() {
  const gltf = useGLTF(ABS_PANEL_URL, false, true)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  const labelMat = useMemo(() => new THREE.MeshBasicMaterial({ map: absTesterLabelTexture(), transparent: true, depthWrite: false, toneMapped: false }), [])
  const plateMat = useMemo(() => new THREE.MeshStandardMaterial({ map: cabinetPlateTexture(), roughness: 0.5 }), [])
  useLayoutEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
    })
  }, [scene])
  const { face, plate, d } = ABS_PANEL
  return (
    <group>
      <primitive object={scene} />
      {/* 평면은 기본으로 +z를 보므로 반 바퀴 돌려 앞(-z)을 보게 한다 */}
      <mesh material={labelMat} position={[0, face.y, -(d / 2 + face.out) - 0.0008]} rotation-y={Math.PI}><planeGeometry args={[face.w, face.h]} /></mesh>
      <mesh material={plateMat} position={[0, plate.y, -(d / 2 + plate.out) - 0.0006]} rotation-y={Math.PI}><planeGeometry args={[plate.w, plate.h]} /></mesh>
    </group>
  )
}
