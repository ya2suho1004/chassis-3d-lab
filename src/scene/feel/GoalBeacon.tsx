// src/scene/feel/GoalBeacon.tsx
// 목적지 표식(설계 2026-11-12 §4.5): 안내 있음에서 다음 단계 장비에 붙는다 — 떠 있는 파란 마름모, 가는 빛기둥, 숨 쉬는 바닥 테두리.
// 목적지가 화면 밖이면 화면 가장자리의 화살표 요소(게임 화면이 준다)를 그쪽에 세운다.
// 붙이는 쪽(LabScene)은 nextHighlightId가 값을 줄 때만 이 부품을 붙인다. 안내 없음·둘러보기에서는 장면에 없다.
// 부품은 미리 만들어 두고 매 화면에는 값만 바꾼다 — 학생이 걷는 동안 장면이 1초에 네 번쯤 다시 계산되기 때문이다.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { prefersReducedMotion } from '../../app/reactions'
import { placeEdgeArrow, type ArrowPlace, type ArrowTrack } from './edgeArrow'

/** 목적지의 색. 장면에서 이 파랑은 목적지 표식에만 쓴다(선택은 주황, 가까이 있음은 노랑, 누름은 흰색) */
const GOAL_COLOR = '#2d6cdf'
/** 마름모가 뜨는 높이: 그 자리에서 가장 높은 것 위로(m) */
const FLOAT = 0.9

/** 화살표를 거둔다. 보이지 않게만 하지 않고 '없는 것'으로 해 둔다 — HUD 겹침을 재는 도구(app/hudLayout.ts)가 숨은 화살표를 세지 않게 */
const hideArrow = (el: HTMLDivElement): void => { if (el.style.visibility !== 'hidden') { el.style.opacity = '0'; el.style.visibility = 'hidden' } }

export function GoalBeacon({ x, z, w, d, h, hidden, arrow, track }: {
  /** 목적지 장비의 가운데(m) */
  x: number
  z: number
  /** 바닥 둘레 크기(m) */
  w: number
  d: number
  /** 그 자리에 겹친 것 가운데 가장 높은 것의 높이(m) */
  h: number
  /** 계기·측정판 가까이 보기 등: 표식과 화살표를 숨긴다(눈금을 가리지 않게) */
  hidden: boolean
  /** 화면 가장자리 화살표 요소와 띠(게임 화면이 준다). 없으면 화살표를 쓰지 않는다 */
  arrow?: RefObject<HTMLDivElement>
  track?: RefObject<ArrowTrack>
}) {
  const still = prefersReducedMotion()
  const pin = useRef<THREE.Group>(null)
  // 크기와 무관한 부품은 한 번만 만든다. 색 보정에서 빼고(toneMapped), 그림자를 만들지도 받지도 않는다
  const fixed = useMemo(() => ({
    frameMat: new THREE.MeshBasicMaterial({ color: GOAL_COLOR, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
    gemGeo: new THREE.OctahedronGeometry(0.2),
    gemMat: new THREE.MeshBasicMaterial({ color: GOAL_COLOR, toneMapped: false }),
    rimMat: new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.BackSide, toneMapped: false }),
    beamGeo: new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true),
    beamMat: new THREE.MeshBasicMaterial({ color: GOAL_COLOR, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }),
  }), [])
  useEffect(() => () => { for (const p of Object.values(fixed)) p.dispose() }, [fixed])
  // 바닥 테두리: 장비 둘레에서 18 cm 바깥, 두께 10 cm. 목적지 장비의 크기가 바뀔 때만 새로 만들고 앞의 것은 버린다
  const frameGeo = useMemo(() => {
    const s = new THREE.Shape()
    const W = w / 2 + 0.18, D = d / 2 + 0.18, t = 0.1
    s.moveTo(-W, -D); s.lineTo(W, -D); s.lineTo(W, D); s.lineTo(-W, D); s.lineTo(-W, -D)
    const hole = new THREE.Path()
    hole.moveTo(-W + t, -D + t); hole.lineTo(-W + t, D - t); hole.lineTo(W - t, D - t); hole.lineTo(W - t, -D + t); hole.lineTo(-W + t, -D + t)
    s.holes.push(hole)
    return new THREE.ShapeGeometry(s)
  }, [w, d])
  useEffect(() => () => frameGeo.dispose(), [frameGeo])
  // 표식이 사라질 때(다음 단계에 목적지가 없을 때 등) 화살표도 거둔다
  useEffect(() => () => { const el = arrow?.current; if (el) hideArrow(el) }, [arrow])
  const top = h + FLOAT
  // 매 화면에 다시 쓰는 그릇: 목적지의 자리(3D)와 그 화면 좌표. 화면마다 새로 만들지 않는다
  const v = useMemo(() => new THREE.Vector3(), [])
  const probe = useMemo(() => ({ nx: 0, ny: 0, behind: false }), [])
  /** 앞 화면의 화살표 자리(없었으면 null). 이어받아서 경계에서 깜빡이거나 가운데 요소의 양 끝을 오가지 않게 한다(edgeArrow.ts) */
  const last = useRef<ArrowPlace | null>(null)
  // 목적지가 바뀌면 앞 목적지에서 이어받던 자리를 비운다 — 새 목적지의 화살표가 앞 목적지 때문에 떠 있거나 한쪽 끝에 머물지 않게
  useEffect(() => { last.current = null }, [x, z])
  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime, wave = Math.sin(t * 2.6)
    // 바닥 테두리는 숨 쉬듯 0.5~0.95, 마름모는 위아래로 8 cm씩 오르내리며 천천히 돈다. 움직임 줄이기면 멈춰 있다
    fixed.frameMat.opacity = still ? 0.8 : 0.725 + 0.225 * wave
    if (pin.current) {
      pin.current.position.y = still ? top : top + 0.08 * wave
      pin.current.rotation.y = still ? 0.6 : t * 0.9
    }
    // 목적지가 화면 밖이면 가장자리 화살표를 그쪽에 세운다. React 상태를 쓰지 않고 요소의 모양 값만 바꾼다
    const el = arrow?.current, tr = track?.current
    if (!el) { last.current = null; return }
    if (hidden || !tr) { hideArrow(el); last.current = null; return }
    v.set(x, h * 0.6, z).project(camera)
    probe.nx = v.x; probe.ny = v.y; probe.behind = v.z > 1
    const a = placeEdgeArrow(probe, tr, last.current)
    last.current = a
    if (!a) { hideArrow(el); return }
    el.style.visibility = 'visible'
    el.style.opacity = '1'
    el.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) translate(-50%, -50%) rotate(${a.angle.toFixed(3)}rad)`
  })
  return (
    <group name="goalBeacon" position={[x, 0, z]} visible={!hidden}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.013} geometry={frameGeo} material={fixed.frameMat} renderOrder={2} />
      <mesh position-y={top / 2} scale-y={top} geometry={fixed.beamGeo} material={fixed.beamMat} renderOrder={2} />
      <group ref={pin} position-y={top} scale={[1, 1.5, 1]}>
        <mesh geometry={fixed.gemGeo} material={fixed.rimMat} scale={1.18} />
        <mesh geometry={fixed.gemGeo} material={fixed.gemMat} />
      </group>
    </group>
  )
}
