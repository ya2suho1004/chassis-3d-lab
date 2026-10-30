// 디스크 런아웃 연습 장면: 바이스에 물린 너클·허브·디스크(disc-fixture.glb) + 옆으로 댄 다이얼 게이지(dial-gauge-h.glb).
// 게이지 볼 접촉점을 디스크 측정 위치(MeasurePoint, 가장자리 안쪽 10 mm)에 미리 눌림(preload)만큼 맞춰 둔다.
// 디스크를 돌리면(spin) 측정축이 discTravel 모형대로 오르내리고 바늘이 따라 돈다. 연습 전용 — 과제 판정·기록과 무관, 값은 연습용(실측 아님).
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { discTravel } from './dialGauge'
import { DialGaugeModel, DIAL_GAUGE_H_URL } from './models/DialGaugeModel'

export const DISC_FIXTURE_URL = `${import.meta.env.BASE_URL}assets/models/disc-fixture.glb`

// 연습 장면 모델은 화면을 그리는 도중이 아니라 미리 받기 시작한다(그리는 중 불러오기 진행 상태가 바뀌면 React 경고)
useGLTF.preload(DISC_FIXTURE_URL, false, true)
useGLTF.preload(DIAL_GAUGE_H_URL, false, true)

/** build_disc_fixture.py 상수와 같아야 한다(m) */
export const DISC_FIXTURE = { axisZ: 0.3, discR: 0.14, measureIn: 0.01 } as const

/** 연습 상태(LabScreen이 들고 있다): 돌리는 방향(−1·0·1), 디스크 각도(rad), 측정축 위치(mm) */
export interface DiscControl { spin: number; angle: number; travel: number }
export interface DiscCase { tir: number; phase: number; preload: number }

/** 디스크 돌리는 빠르기(rad/s) — 손으로 천천히 */
export const DISC_SPIN_SPEED = 0.7

/** 연습용 디스크 하나(전체 흔들림 0.02~0.09 mm 중 하나, 가장 높은 곳 각도 무작위). 실측값 아님 */
export function randomDiscCase(rand: () => number = Math.random): DiscCase {
  const tir = (2 + Math.floor(rand() * 8)) / 100
  return { tir, phase: rand() * 2 * Math.PI, preload: 0.5 }
}

/** 학생이 적은 런아웃이 맞는지(눈금 반 칸 0.005 mm 안) */
export function checkRunout(answer: number, c: DiscCase): boolean {
  return Number.isFinite(answer) && Math.abs(answer - c.tir) < 0.005 + 1e-9
}

function FixtureModel({ rotorRef }: { rotorRef: React.MutableRefObject<THREE.Object3D | null> }) {
  const gltf = useGLTF(DISC_FIXTURE_URL, false, true)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  useLayoutEffect(() => {
    scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
    rotorRef.current = scene.getObjectByName('Rotor') ?? null
  }, [scene, rotorRef])
  return <primitive object={scene} />
}

/** 게이지 뿌리를 어디 둘지: 접촉점(측정축이 다 나온 자리)이 측정 위치보다 preload만큼 디스크 안쪽(+x)에 오게 */
function useGaugeOffset(preload: number): THREE.Vector3 | null {
  const fix = useGLTF(DISC_FIXTURE_URL, false, true)
  const gauge = useGLTF(DIAL_GAUGE_H_URL, false, true)
  return useMemo(() => {
    fix.scene.updateMatrixWorld(true); gauge.scene.updateMatrixWorld(true)
    const m = fix.scene.getObjectByName('MeasurePoint'), c = gauge.scene.getObjectByName('ContactPoint')
    if (!m || !c) return null
    const mp = m.getWorldPosition(new THREE.Vector3()), cp = c.getWorldPosition(new THREE.Vector3())
    return mp.add(new THREE.Vector3(preload / 1000, 0, 0)).sub(cp)
  }, [fix.scene, gauge.scene, preload])
}

function Rig({ ctl, disc, bezelDeg }: { ctl: React.MutableRefObject<DiscControl>; disc: DiscCase; bezelDeg: number }) {
  const rotor = useRef<THREE.Object3D | null>(null)
  const travelRef = useRef(disc.preload)
  const offset = useGaugeOffset(disc.preload)
  useFrame((_, dt) => {
    const c = ctl.current
    c.angle += c.spin * DISC_SPIN_SPEED * Math.min(dt, 0.1)
    c.travel = discTravel(c.angle, disc.preload, disc.tir, disc.phase)
    travelRef.current = c.travel
    if (rotor.current) rotor.current.rotation.x = c.angle
  })
  return (
    <group>
      <FixtureModel rotorRef={rotor} />
      {offset && <group position={offset}><DialGaugeModel pose="h" travelRef={travelRef} bezelDeg={bezelDeg} /></group>}
    </group>
  )
}

/** 작업대 위 연습 장면. 게이지 눈금판이 서쪽(−x, 학생 쪽)을 보도록 반 바퀴의 반(π/2) 돌려 놓는다 */
export const RIG_ROTATION = Math.PI / 2

/**
 * 장면 안 게이지 눈금판 가운데(연습 장면 원점 기준, 돌린 뒤). 모델 노드 값(테스트가 glb와 대조)으로 계산:
 * 게이지 뿌리 = 측정점 + 미리 눌림 − 접촉점, 눈금판 = 뿌리 + Indicator 자리, 그 뒤 RIG_ROTATION만큼 돌림
 */
export const GLB_POINTS = { measure: [-0.086, 0.43, 0], contact: [0.2365, 0.43, 0.011], indicator: [0.175, 0.43, 0] } as const
export function gaugeFaceInRig(preload: number): THREE.Vector3 {
  const { measure: m, contact: c, indicator: i } = GLB_POINTS
  const v = new THREE.Vector3(m[0] + preload / 1000 - c[0] + i[0], m[1] - c[1] + i[1], m[2] - c[2] + i[2])
  return v.applyAxisAngle(new THREE.Vector3(0, 1, 0), RIG_ROTATION)
}

export function DiscRunoutRig({ position, ctl, disc, bezelDeg }: { position: [number, number, number]; ctl: React.MutableRefObject<DiscControl>; disc: DiscCase; bezelDeg: number }) {
  return (
    <group position={position} rotation-y={RIG_ROTATION}>
      <Suspense fallback={null}><Rig ctl={ctl} disc={disc} bezelDeg={bezelDeg} /></Suspense>
    </group>
  )
}

/** 연습 가까이 보기 카메라: 게이지 눈금판 앞(서쪽) 조금 남쪽 위에서 게이지와 디스크를 함께 비춘다. 끝나면 원래 자리로 */
export function DiscCamera({ gaugeWorld }: { gaugeWorld: THREE.Vector3 }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null }
  const look = useRef(new THREE.Vector3())
  useLayoutEffect(() => {
    const pos = camera.position.clone(), quat = camera.quaternion.clone(), fov = camera.fov, near = camera.near
    const target = controls ? controls.target.clone() : null
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir)
    look.current.copy(camera.position).add(dir)
    camera.fov = 40; camera.near = 0.01; camera.updateProjectionMatrix()
    return () => {
      camera.fov = fov; camera.near = near; camera.updateProjectionMatrix()
      camera.position.copy(pos); camera.quaternion.copy(quat)
      if (controls && target) { controls.target.copy(target); controls.update() }
    }
  }, [camera, controls])
  useFrame((_, dt) => {
    // 눈금판 앞 0.25 m, 디스크 쪽(북)이 함께 보이게 남쪽으로 조금 비켜서. 아래 연습 판에 가리지 않게 화면 위쪽에 눈금판이 오도록 조금 아래를 본다
    const goal = new THREE.Vector3(gaugeWorld.x - 0.24, gaugeWorld.y + 0.02, gaugeWorld.z + 0.07)
    const tgt = new THREE.Vector3(gaugeWorld.x, gaugeWorld.y - 0.045, gaugeWorld.z - 0.035)
    const k = 1 - Math.exp(-5 * Math.min(dt, 0.1))
    camera.position.lerp(goal, k)
    look.current.lerp(tgt, k)
    camera.lookAt(look.current)
  })
  return null
}
