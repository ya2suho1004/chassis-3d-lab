// 차동기어 백래시 연습 장면: 받침대에 물린 차동기어 캐리어(diff-carrier.glb) + 긴 접촉자를 단 다이얼 게이지(dial-gauge-b.glb).
// 게이지 측정축을 링기어 맨 위 이빨 면에 접선 방향(이면에 직각)으로 대고 미리 눌림(preload)만큼 맞춰 둔다.
// 링기어를 밀면(push) 이 사이 틈만큼 움직여 바늘이 오가고, 피니언을 잡지 않으면 기어가 같이 돈다(backlash.ts).
// 연습 전용 — 과제 판정·기록과 무관, 값은 연습용(실측 아님).
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { backlashTravel, stepBacklash, type BacklashCase, type BacklashState } from './backlash'
import { DialGaugeModel, DIAL_GAUGE_B_URL } from './models/DialGaugeModel'

export const DIFF_CARRIER_URL = `${import.meta.env.BASE_URL}assets/models/diff-carrier.glb`

// 그리는 도중 불러오기 상태가 바뀌지 않게 미리 받는다
useGLTF.preload(DIFF_CARRIER_URL, false, true)
useGLTF.preload(DIAL_GAUGE_B_URL, false, true)

/** build_diff_carrier.py 상수와 같아야 한다(m): 측정 위치 반지름, 링기어·피니언 잇수, 피니언 피치 반지름 */
export const BACKLASH_RIG = { contactR: 0.102, ringTeeth: 41, pinionTeeth: 10, pinionR: 0.025 } as const

/**
 * glb 노드 자리(뿌리 기준, three 좌표). 테스트가 glb와 대조한다.
 * measure: 맨 위 이빨 이면(diff-carrier), contact·indicator: 게이지 볼 끝·눈금판 가운데(dial-gauge-b, 돌리기 전), flange: 컴패니언 플랜지 가운데
 */
export const BL_GLB_POINTS = {
  measure: [-0.0175, 0.43, 0.0031], contact: [0.2765, 0.43, 0.011], indicator: [0.175, 0.43, 0], flange: [-0.052, 0.31, -0.285],
} as const
/** 게이지를 세로축으로 돌려 측정축(+x)이 북(−z, 링기어 이빨 쪽)을, 눈금판이 서(−x, 학생 쪽)를 보게 한다 */
export const GAUGE_YAW = Math.PI / 2
const UP = new THREE.Vector3(0, 1, 0)
/** 측정축이 미는 방향(장면 좌표) */
const PUSH_DIR = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, GAUGE_YAW)

/** 게이지 뿌리 자리: (돌린) 접촉점이 측정 위치보다 미리 눌림만큼 이빨 안쪽에 오게 */
export function gaugeRootInRig(preload: number): THREE.Vector3 {
  const { measure: m, contact: c } = BL_GLB_POINTS
  const cr = new THREE.Vector3(...c).applyAxisAngle(UP, GAUGE_YAW)
  return new THREE.Vector3(...m).addScaledVector(PUSH_DIR, preload / 1000).sub(cr)
}
/** 장면 원점 기준 눈금판 가운데(카메라가 비춘다) */
export function backlashFaceInRig(preload: number): THREE.Vector3 {
  return gaugeRootInRig(preload).add(new THREE.Vector3(...BL_GLB_POINTS.indicator).applyAxisAngle(UP, GAUGE_YAW))
}

function CarrierModel({ ringRef, pinionRef }: { ringRef: React.MutableRefObject<THREE.Object3D | null>; pinionRef: React.MutableRefObject<THREE.Object3D | null> }) {
  const gltf = useGLTF(DIFF_CARRIER_URL, false, true)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  useLayoutEffect(() => {
    scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
    ringRef.current = scene.getObjectByName('RingGear') ?? null
    pinionRef.current = scene.getObjectByName('Pinion') ?? null
  }, [scene, ringRef, pinionRef])
  return <primitive object={scene} />
}

/** 피니언 잡기 공구(플랜지 홀더): 컴패니언 플랜지 바깥 면에 둥근 머리, 손잡이는 작업대까지 내려와 기댄다 */
function FlangeHolder() {
  const [x, y, z] = BL_GLB_POINTS.flange
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b9bec3', metalness: 0.9, roughness: 0.35 }), [])
  const grip = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.6 }), [])
  const len = y - 0.03
  return (
    <group position={[x, y, z - 0.014]}>
      <mesh material={steel} castShadow><torusGeometry args={[0.034, 0.006, 10, 32]} /></mesh>
      <mesh position={[0, -len / 2, 0]} material={steel} castShadow><boxGeometry args={[0.016, len, 0.008]} /></mesh>
      <mesh position={[0, -len + 0.06, 0]} material={grip} castShadow><boxGeometry args={[0.024, 0.11, 0.016]} /></mesh>
    </group>
  )
}

function Rig({ st, bl, bezelDeg, held }: { st: React.MutableRefObject<BacklashState>; bl: BacklashCase; bezelDeg: number; held: boolean }) {
  const ring = useRef<THREE.Object3D | null>(null)
  const pinion = useRef<THREE.Object3D | null>(null)
  const travelRef = useRef(bl.preload)
  const root = useMemo(() => gaugeRootInRig(bl.preload), [bl.preload])
  useFrame((_, dt) => {
    const s = st.current
    stepBacklash(s, bl, Math.min(dt, 0.1))
    travelRef.current = backlashTravel(s, bl)
    // 이빨이 북(측정축이 들어가는 쪽)으로 갈 때 링기어는 −x축 둘레로 돈다. 피니언은 잇수 비만큼 더 빨리
    if (ring.current) ring.current.rotation.x = -(s.s - bl.bl / 2) / 1000 / BACKLASH_RIG.contactR
    if (pinion.current) pinion.current.rotation.z = (s.p / 1000) / BACKLASH_RIG.pinionR
  })
  return (
    <group>
      <CarrierModel ringRef={ring} pinionRef={pinion} />
      {held && <FlangeHolder />}
      <group position={root} rotation-y={GAUGE_YAW}><DialGaugeModel pose="b" travelRef={travelRef} bezelDeg={bezelDeg} /></group>
    </group>
  )
}

export function BacklashRig({ position, st, bl, bezelDeg, held }: { position: [number, number, number]; st: React.MutableRefObject<BacklashState>; bl: BacklashCase; bezelDeg: number; held: boolean }) {
  return (
    <group position={position}>
      <Suspense fallback={null}><Rig st={st} bl={bl} bezelDeg={bezelDeg} held={held} /></Suspense>
    </group>
  )
}
