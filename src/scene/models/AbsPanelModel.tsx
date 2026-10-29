// 공용 조작부 블렌더 모델(public/assets/models/abs-panel.glb) — scripts/blender/build_abs_panel.py로 만든다.
// 두 품질 모두 쓴다(2026-10-29부터). 불러오는 중·치수가 다를 때는 코드 모델(AbsPanel)을 쓴다.
// 모델에는 글자가 없다. 버튼 이름·ABS TESTER·명판 글자는 아래 평면 두 장으로 덧붙인다(자리는 블렌더 스크립트의 FACE·PLATE 값과 같다).
import { useGLTF } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { absTesterLabelTexture, cabinetPlateTexture } from './textures'
import { readoutLines, type PanelReadout } from '../panelReadout'

export const ABS_PANEL_URL = `${import.meta.env.BASE_URL}assets/models/abs-panel.glb`

/** build_abs_panel.py 상수와 같아야 한다. 길이 m, 앞면 = 지역 -z */
export const ABS_PANEL = {
  w: 0.7, d: 0.5, h: 1.5,
  face: { w: 0.63, h: 0.375, y: 1.2, out: 0.11 },
  plate: { w: 0.574, h: 0.18, y: 0.93, out: 0.008 },
  /** 계기 화면 자리(앞면 그림 512×288 기준 u 60~360, v 64~224 — build_abs_panel.py SCREEN과 같음) */
  screen: { u0: 60 / 512, u1: 360 / 512, v0: 64 / 288, v1: 224 / 288 },
} as const

/** 계기 화면: 검은 바탕 붉은 점 글자(축중·좌우 제동력·최대값 고정). 값이 바뀔 때만 다시 그린다 */
function ReadoutScreen({ readout }: { readout: PanelReadout }) {
  const { face, screen, d } = ABS_PANEL
  const canvas = useMemo(() => { const c = document.createElement('canvas'); c.width = 512; c.height = 272; return c }, [])
  const tex = useMemo(() => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t }, [canvas])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [tex])
  const key = readoutLines(readout).join('|')
  useEffect(() => {
    const g = canvas.getContext('2d')
    if (!g) return
    g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, 512, 272)
    for (let y = 4; y < 272; y += 8) for (let x = 4; x < 512; x += 8) { g.fillStyle = 'rgba(255,70,50,0.10)'; g.fillRect(x, y, 3, 3) }
    g.font = 'bold 54px "Courier New", monospace'; g.textBaseline = 'middle'; g.textAlign = 'left'
    g.shadowColor = '#ff3b2f'; g.shadowBlur = 14; g.fillStyle = '#ff4a3a'
    key.split('|').forEach((l, i) => g.fillText(l, 24, 52 + i * 84))
    tex.needsUpdate = true
  }, [key, canvas, tex])
  const w = (screen.u1 - screen.u0) * face.w, h = (screen.v1 - screen.v0) * face.h
  // 앞면 평면은 반 바퀴 돌아 있으므로 그림의 u는 세계 x에서 거꾸로다
  const x = -((screen.u0 + screen.u1) / 2 - 0.5) * face.w
  const y = face.y + (0.5 - (screen.v0 + screen.v1) / 2) * face.h
  // 모델의 화면 유리는 버튼면보다 12 mm 나와 있다(build_abs_panel.py Screen) — 그 바로 앞에 붙인다
  return <mesh material={mat} position={[x, y, -(d / 2 + face.out) - 0.0135]} rotation-y={Math.PI}><planeGeometry args={[w - 0.006, h - 0.006]} /></mesh>
}

export function fitsAbsPanel(e: { w: number; d: number; h: number }): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.05
  return near(e.w, ABS_PANEL.w) && near(e.d, ABS_PANEL.d) && near(e.h, ABS_PANEL.h)
}

export function AbsPanelModel({ readout = null }: { readout?: PanelReadout | null }) {
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
      {readout && <ReadoutScreen readout={readout} />}
    </group>
  )
}
