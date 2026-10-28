// 3D 실습장 장면 — 사진 기준 장비 모델(models/), 품질 2단계(낮음: 그림자·환경광 끔), 바닥 탭 이동, 3인칭 추적 카메라
// 이 장면은 '개발용 임시 배치'를 그린다. 실제 학교 재현 완료가 아니다(layoutConfirmed=false).
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Environment, Html, OrbitControls } from '@react-three/drei'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { footprintOf, showsLabel, type LabelMode, type Pt, type SceneEquipment, type SceneLayout } from './layoutModel'
import { advanceAlongPath, buildNavGrid, findPath } from './pathfind'
import { OUTSIDE_DISTANCE, type BrakeRigState } from './brakeRig'
import { AbsPanel, BrakeTesterBase, CarBody, CheckerSurround, Desk, FootprintFrame, Machine, Person, Pillar, Roller, StaticCar, Stand, ToeGauge, Wall, Wheel, Workbench, useMaterials, type Mats } from './models/models'
import { epoxyFloorTexture } from './models/textures'
import { TestCarModel, fitsTestCar } from './models/TestCarModel'
import { BrakeTesterModel, fitsBrakeTester } from './models/BrakeTesterModel'
import { AbsPanelModel, fitsAbsPanel } from './models/AbsPanelModel'
import { AVANTE_SPEC, AvanteModel, SCISSOR, ScissorLiftModel, fitsScissorLift, scissorPose, type ScissorParts } from './models/ScissorLiftModel'

const WALK_SPEED = 1.6 // m/s
const TAP_MAX_PX = 6

export interface LabSceneProps {
  layout: SceneLayout
  start: Pt
  selectedId: string | null
  highlightIds: string[]
  lowSpec: boolean
  /** 올려 둔 리프트 ID(표시 전용, 과제 기록과 무관) */
  raisedLiftIds?: string[]
  onSelectEquipment: (id: string | null) => void
  onNpcTap: () => void
  onMove: (pos: Pt, moving: boolean) => void
  /** 바닥 탭 대신 버튼으로 목적지를 넣는 통로(지정 위치 이동 보조, 설계 03 §2) */
  moveRequestRef: React.MutableRefObject<Pt | null>
  /** 제동력 시험기·시험 차량 연출 상태(brakeRig.ts) */
  rig: BrakeRigState
  labelMode: LabelMode
}

function Avatar({ pos }: { pos: Pt }) {
  return <group position={[pos.x, 0, pos.z]}><Person suit="#2f5fb3" helmet="#ffd600" /></group>
}

/** 장비 종류·ID로 모델을 고른다. 모르는 종류는 예전처럼 상자로 그린다. */
function EquipmentModel({ e, m, facing, lowSpec, raised }: { e: SceneEquipment; m: Mats; facing: number | null; lowSpec: boolean; raised: boolean }) {
  const id = e.id
  switch (e.kind) {
    case 'panel': {
      const code = <AbsPanel w={e.w} d={e.d} h={e.h} m={m} />
      return <group rotation-y={facing ?? (e.rotation * Math.PI) / 180}>{!lowSpec && fitsAbsPanel(e) ? <Suspense fallback={code}><AbsPanelModel /></Suspense> : code}</group>
    }
    case 'desk': return <Desk w={e.w} d={e.d} h={e.h} m={m} />
    case 'toeGauge': return <ToeGauge w={e.w} d={e.d} h={e.h} m={m} />
    case 'lift': return <LiftRig e={e} m={m} lowSpec={lowSpec} raised={raised} car={LIFT_CARS[id] ?? null} />
    case 'vehicle': return <StaticCar w={e.w} d={e.d} h={e.h} m={m} />
    case 'stand': return <Stand w={e.w} d={e.d} h={e.h} m={m} kind={id.includes('shock') ? 'shock' : 'generic'} />
    case 'bench':
      if (id.includes('simulator')) return <Machine w={e.w} d={e.d} h={e.h} m={m} kind="simulator" />
      if (id.includes('balancer')) return <Machine w={e.w} d={e.d} h={e.h} m={m} kind="balancer" />
      if (id.includes('changer')) return <Machine w={e.w} d={e.d} h={e.h} m={m} kind="changer" />
      return <Workbench w={e.w} d={e.d} h={e.h} m={m} load={id.includes('at-mt') || id.includes('endplay') ? 'transmission' : id.includes('parts') || id.includes('toe') ? 'parts' : null} />
    default:
      return <mesh position={[0, e.h / 2, 0]}><boxGeometry args={[e.w, e.h, e.d]} /><meshStandardMaterial color={e.color} /></mesh>
  }
}

function Equipment({ e, m, facing, selected, highlight, showLabel, onTap, lowSpec, raised }: { e: SceneEquipment; m: Mats; facing: number | null; selected: boolean; highlight: boolean; showLabel: boolean; onTap: () => void; lowSpec: boolean; raised: boolean }) {
  const f = footprintOf(e)
  const w = f.xMax - f.xMin
  const d = f.zMax - f.zMin
  return (
    <group position={[e.x, 0, e.z]} onClick={(ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onTap() } }}>
      <EquipmentModel e={e} m={m} facing={facing} lowSpec={lowSpec} raised={raised} />
      {(selected || highlight) && <FootprintFrame w={w} d={d} color={selected ? '#ff9800' : '#2d6cdf'} />}
      {showLabel && (
        <Html position={[0, e.h + 0.35, 0]} center style={{ pointerEvents: 'none' }}>
          <div className={`label3d ${e.interactive ? 'interactive' : ''} ${highlight ? 'hl' : ''}`}>{e.label}</div>
        </Html>
      )}
    </group>
  )
}

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** 다가가는 값(지수 감쇠). 모션 줄이기 설정이면 바로 목표값 */
function approach(cur: number, target: number, rate: number, dt: number): number {
  if (prefersReducedMotion) return target
  const k = 1 - Math.exp(-rate * Math.min(dt, 0.1))
  const next = cur + (target - cur) * k
  return Math.abs(target - next) < 1e-3 ? target : next
}

const ROLLER_R = 0.1
const WHEEL_R = 0.3
const LIFT_RISE = 0.15
const ROLLER_SPIN = 14 // rad/s
/** 덮개판은 바닥 높이(사진 28) — 장면에서는 얇은 판으로 그리고 롤러는 판 아래 홈에 둔다 */
export const TESTER_PLATE_H = 0.05
const ROLLER_DZ = 0.28 // 바퀴 하나를 받치는 앞뒤 롤러 간격의 절반(가정)
const ROLLER_Y = WHEEL_R - Math.sqrt((WHEEL_R + ROLLER_R) ** 2 - ROLLER_DZ ** 2) // 바퀴가 두 롤러에 걸리는 높이

/** 리프트 위에 올려 둔 차량(사진 8: 가운데 리프트 위 1세대 아반떼). 위치·방향은 가정 */
const LIFT_CARS: Record<string, 'avante'> = { 'lift-zone-01/b': 'avante' }
const LIFT_SPEED = 0.9 // 오르내림 빠르기(지수 접근 계수)

/** 가위형 리프트: 발판이 오르내리고 가위 다리가 따라 펴진다(표시 전용). 품질 높음은 블렌더 모델, 낮음은 코드 모델 */
function LiftRig({ e, m, lowSpec, raised, car }: { e: SceneEquipment; m: Mats; lowSpec: boolean; raised: boolean; car: 'avante' | null }) {
  const useModel = !lowSpec && fitsScissorLift(e)
  const rest = e.h
  const up = useModel ? SCISSOR.raisedTop : rest + 1.2
  const parts = useRef<ScissorParts | null>(null)
  const onParts = useCallback((p: ScissorParts) => { parts.current = p }, [])
  const runwayRefs = useRef<Array<THREE.Object3D | null>>([])
  const legRefs = useRef<Array<THREE.Object3D | null>>([])
  const carRef = useRef<THREE.Group>(null)
  const top = useRef(raised ? up : rest)
  const runW = Math.min(0.62, e.w * 0.3)
  const px = e.w / 2 - runW / 2
  const half = e.d * 0.5
  // 코드 발판은 두께 0.08 상자의 가운데가 높이 top이라 윗면이 0.04 높다
  const carLift = useModel ? 0 : 0.04

  useFrame((_, dt) => {
    const t = approach(top.current, raised ? up : rest, LIFT_SPEED, dt)
    top.current = t
    const p = parts.current
    if (useModel && p) {
      const { phi, armTopY } = scissorPose(t)
      for (const r of p.runways) r.position.y = t
      for (const a of p.armBase) a.rotation.x = phi
      for (const a of p.armTop) { a.position.y = armTopY; a.rotation.x = -phi }
    }
    for (const r of runwayRefs.current) if (r) r.position.y = t
    legRefs.current.forEach((l, i) => {
      if (!l) return
      const s = i % 2 === 0 ? 1 : -1
      l.position.y = t / 2
      l.rotation.x = s * Math.atan2(t, half)
      l.scale.z = Math.hypot(t, half)
    })
    if (carRef.current) carRef.current.position.y = t + carLift
  })

  const codeLift = (
    <group>
      {[-px, px].map((x, k) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh ref={(o) => { runwayRefs.current[k] = o }} material={m.blueChecker} position={[0, top.current, 0]} castShadow receiveShadow><boxGeometry args={[runW, 0.08, e.d * 0.78]} /></mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={m.blueChecker} position={[0, rest / 2, s * (e.d * 0.39 + e.d * 0.06)]} rotation-x={s * Math.atan2(rest, e.d * 0.12)} castShadow>
              <boxGeometry args={[runW, 0.04, Math.hypot(rest, e.d * 0.12)]} />
            </mesh>
          ))}
          {[0, 1].map((j) => (
            <mesh key={j} ref={(o) => { legRefs.current[k * 2 + j] = o }} material={m.blue} position={[0, top.current / 2, 0]}
              rotation-x={(j === 0 ? 1 : -1) * Math.atan2(top.current, half)} scale={[1, 1, Math.hypot(top.current, half)]} castShadow>
              <boxGeometry args={[0.08, 0.08, 1]} />
            </mesh>
          ))}
          <mesh material={m.blue} position={[0, 0.02, 0]}><boxGeometry args={[runW * 0.7, 0.04, e.d * 0.55]} /></mesh>
        </group>
      ))}
    </group>
  )
  const codeCar = <StaticCar w={AVANTE_SPEC.w} d={AVANTE_SPEC.d} h={AVANTE_SPEC.h} m={m} />
  return (
    <>
      {useModel ? <Suspense fallback={codeLift}><ScissorLiftModel onParts={onParts} /></Suspense> : codeLift}
      {car && (
        <group ref={carRef} position={[0, top.current + carLift, 0]}>
          {useModel ? <Suspense fallback={codeCar}><AvanteModel /></Suspense> : codeCar}
        </group>
      )}
    </>
  )
}

/** 제동력 시험기 연출: 롤러 4개·리프트 판·시험 차량(진입/이탈·들림·뒷바퀴 회전). 단계 판정과 무관한 표시 전용 */
function BrakeRig({ tester, vehicle, rig, m, selected, testerHighlight, showVehicleLabel, onTapVehicle, lowSpec }: { tester: SceneEquipment; vehicle: SceneEquipment; rig: BrakeRigState; m: Mats; selected: boolean; testerHighlight: boolean; showVehicleLabel: boolean; onTapVehicle: () => void; lowSpec: boolean }) {
  const theta = (vehicle.rotation * Math.PI) / 180
  const away = { x: -Math.sin(theta), z: -Math.cos(theta) }
  const rearAxle = vehicle.d / 2 - 0.6
  const target = {
    dist: rig.vehicle === 'outside' ? OUTSIDE_DISTANCE : 0,
    lift: rig.liftUp ? LIFT_RISE : 0,
  }
  const carRef = useRef<THREE.Group>(null)
  const liftRefs = useRef<Array<THREE.Object3D | null>>([])
  const rollerRefs = useRef<Array<THREE.Object3D | null>>([])
  const rearWheelRefs = useRef<Array<THREE.Object3D | null>>([])
  const frontWheelRefs = useRef<Array<THREE.Object3D | null>>([])
  // 품질 높음 + 치수가 맞으면 블렌더 모델(바퀴 노드를 같은 방식으로 돌린다), 아니면 코드 차량
  const useModel = !lowSpec && fitsTestCar(vehicle)
  const onModelWheels = useCallback((front: THREE.Object3D[], rear: THREE.Object3D[]) => { frontWheelRefs.current = front; rearWheelRefs.current = rear }, [])
  // 시험기도 같은 규칙: 블렌더 모델의 롤러·리프트 판 노드를 코드 시험기와 같은 방식으로 움직인다
  const wheelX = vehicle.w / 2 - 0.1
  const useTesterModel = !lowSpec && fitsBrakeTester(tester, wheelX)
  const onTesterParts = useCallback((rollers: THREE.Object3D[], lifts: THREE.Object3D[]) => { rollerRefs.current = rollers; liftRefs.current = lifts }, [])
  const s = useRef({ dist: target.dist, lift: target.lift, spin: 0 })

  useFrame((_, dt) => {
    const st = s.current
    const prevDist = st.dist
    st.dist = approach(st.dist, target.dist, 1.6, dt)
    st.lift = approach(st.lift, target.lift, 3, dt)
    st.spin = approach(st.spin, rig.rollersSpinning ? ROLLER_SPIN : 0, 2.5, dt)
    // 차량 위치·높이: 진입·이탈 중이면 바퀴가 이동 거리만큼 구른다
    const lift = rig.vehicle === 'outside' ? 0 : st.lift
    if (carRef.current) carRef.current.position.set(vehicle.x + away.x * st.dist, lift, vehicle.z + away.z * st.dist)
    for (const m of liftRefs.current) if (m) m.position.y = st.lift - 0.02
    const rollerTurn = st.spin * Math.min(dt, 0.1)
    for (const m of rollerRefs.current) if (m) m.rotation.x += rollerTurn
    const roll = (st.dist - prevDist) / WHEEL_R
    // 롤러가 돌면 뒷바퀴도 롤러에 맞물려 반대로 돈다(들린 상태에서는 닿지 않음)
    const rearDrive = st.lift < 0.02 && rig.vehicle !== 'outside' ? -rollerTurn * (ROLLER_R / WHEEL_R) : 0
    for (const m of rearWheelRefs.current) if (m) m.rotation.x += roll + rearDrive
    for (const m of frontWheelRefs.current) if (m) m.rotation.x += roll
  })

  // 롤러: 좌·우 바퀴 자리마다 앞뒤 2개(바퀴 아래, 축은 동서 방향)
  const rollerSpots = [-wheelX, wheelX].flatMap((x) => [-ROLLER_DZ, ROLLER_DZ].map((dz) => ({ x, dz })))
  const bodyBottom = WHEEL_R + 0.05
  const tapVehicle = (ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onTapVehicle() } }
  const codeCar = (
    <>
      <group onClick={tapVehicle}>
        <CarBody w={vehicle.w} d={vehicle.d} h={vehicle.h} m={m} highlight={selected} />
      </group>
      {[-wheelX, wheelX].map((x, i) => {
        const out = (x > 0 ? 1 : -1) as 1 | -1
        return (
          <group key={`wheels-${i}`}>
            <group ref={(g) => { rearWheelRefs.current[i] = g }} position={[x, WHEEL_R, rearAxle]} rotation-z={Math.PI / 2}><Wheel r={WHEEL_R} width={0.2} m={m} outward={(-out) as 1 | -1} /></group>
            <group ref={(g) => { frontWheelRefs.current[i] = g }} position={[x, WHEEL_R, rearAxle - 2.4]} rotation-z={Math.PI / 2}><Wheel r={WHEEL_R} width={0.2} m={m} outward={(-out) as 1 | -1} /></group>
            {/* 캘리퍼는 돌지 않는다 */}
            <mesh material={m.caliper} position={[x - out * 0.06, WHEEL_R + 0.1, rearAxle - 0.08]}><boxGeometry args={[0.05, 0.12, 0.09]} /></mesh>
          </group>
        )
      })}
    </>
  )
  const codeTester = (
    <>
      <BrakeTesterBase w={tester.w} d={tester.d} wheelX={wheelX} m={m} />
      {rollerSpots.map((r, i) => (
        <group key={`roller-${i}`} position={[r.x, ROLLER_Y, r.dz]}>
          <Roller ref={(mm) => { rollerRefs.current[i] = mm }} r={ROLLER_R} len={0.6} m={m} />
        </group>
      ))}
      {[-wheelX, wheelX].map((x, i) => (
        <mesh key={`lift-${i}`} ref={(mm) => { liftRefs.current[i] = mm }} material={m.greyMetal} position={[x, target.lift - 0.02, 0]} castShadow>
          <boxGeometry args={[0.55, 0.03, 0.22]} />
        </mesh>
      ))}
    </>
  )
  return (
    <>
      <group position={[tester.x, 0, tester.z]}>
        {useTesterModel ? (
          <>
            <CheckerSurround w={tester.w} d={tester.d} m={m} />
            <Suspense fallback={codeTester}><BrakeTesterModel onParts={onTesterParts} /></Suspense>
          </>
        ) : codeTester}
        {testerHighlight && <FootprintFrame w={tester.w} d={tester.d} color="#2d6cdf" />}
        {rig.rollersSpinning && (
          <Html position={[0, 0.6, tester.d / 2 + 0.3]} center style={{ pointerEvents: 'none' }}>
            <div className="label3d hl">롤러 회전 중</div>
          </Html>
        )}
      </group>
      <group ref={carRef} position={[vehicle.x + away.x * target.dist, rig.vehicle === 'outside' ? 0 : target.lift, vehicle.z + away.z * target.dist]}>
        <group rotation-y={theta}>
          {useModel ? (
            <Suspense fallback={codeCar}>
              <group onClick={tapVehicle}><TestCarModel highlight={selected} onWheels={onModelWheels} /></group>
            </Suspense>
          ) : codeCar}
        </group>
        {showVehicleLabel && (
          <Html position={[0, vehicle.h + 0.35, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="label3d">{vehicle.label}</div>
          </Html>
        )}
      </group>
    </>
  )
}

function Walker({ layout, start, onMove, requestRef }: { layout: SceneLayout; start: Pt; onMove: (p: Pt, moving: boolean) => void; requestRef: React.MutableRefObject<Pt | null> }) {
  const grid = useMemo(() => buildNavGrid(layout, 0.5), [layout])
  const [pos, setPos] = useState<Pt>(start)
  const posRef = useRef<Pt>(start)
  const pathRef = useRef<Pt[] | null>(null)
  const idxRef = useRef(0)
  const lastReport = useRef(0)
  const { camera, controls } = useThree() as unknown as { camera: THREE.Camera; controls: OrbitControlsImpl | null }

  useFrame((_, dt) => {
    // 새 목적지 요청 처리
    if (requestRef.current) {
      const target = requestRef.current
      requestRef.current = null
      const path = findPath(grid, posRef.current, target)
      pathRef.current = path
      idxRef.current = 0
      if (!path) onMove(posRef.current, false)
    }
    let moving = false
    if (pathRef.current) {
      const r = advanceAlongPath(posRef.current, pathRef.current, idxRef.current, WALK_SPEED, Math.min(dt, 0.1))
      const prev = posRef.current
      posRef.current = r.pos
      idxRef.current = r.index
      moving = !r.done
      if (r.done) pathRef.current = null
      // 카메라가 아바타를 따라가도록 이동량만큼 함께 이동
      camera.position.x += r.pos.x - prev.x
      camera.position.z += r.pos.z - prev.z
      if (controls) { controls.target.set(r.pos.x, 1.0, r.pos.z); controls.update() }
      setPos(r.pos)
      lastReport.current += dt
      if (!moving || lastReport.current > 0.25) { lastReport.current = 0; onMove(r.pos, moving) }
    }
  })

  useEffect(() => { onMove(start, false) }, [start, onMove])
  return <Avatar pos={pos} />
}

export function LabScene({ layout, start, selectedId, highlightIds, lowSpec, raisedLiftIds = [], onSelectEquipment, onNpcTap, onMove, moveRequestRef, rig, labelMode }: LabSceneProps) {
  const m = useMaterials()
  const tester = layout.equipment.find((e) => e.id === 'brake-tester-01')
  const vehicle = layout.equipment.find((e) => e.id === 'brake-vehicle-01')
  const requestRef = moveRequestRef
  const mz = layout.mainZone
  const ab = layout.absProtrusion
  const onFloorTap = (ev: ThreeEvent<MouseEvent>) => {
    if (ev.delta >= TAP_MAX_PX) return
    ev.stopPropagation()
    requestRef.current = { x: ev.point.x, z: ev.point.z }
    onSelectEquipment(null)
  }
  const floorMat = useMemo(() => {
    const repeat: [number, number] = [Math.max(1, Math.round((mz.xMax - mz.xMin) / 4)), Math.max(1, Math.round((mz.zMax - mz.zMin) / 4))]
    return new THREE.MeshStandardMaterial({ map: epoxyFloorTexture(repeat), roughness: 0.38, metalness: 0.02, envMapIntensity: 0.35 })
  }, [mz.xMax, mz.xMin, mz.zMax, mz.zMin])
  /** 조작부는 시험기를 바라보게 둔다(앞면 = 지역 -z) */
  const facingOf = (e: SceneEquipment): number | null => {
    if (e.kind !== 'panel' || !tester) return null
    return Math.atan2(-(tester.x - e.x), -(tester.z - e.z))
  }
  const Floor = ({ r }: { r: { xMin: number; xMax: number; zMin: number; zMax: number } }) => (
    <mesh rotation-x={-Math.PI / 2} position={[(r.xMin + r.xMax) / 2, 0, (r.zMin + r.zMax) / 2]} onClick={onFloorTap} receiveShadow material={floorMat}>
      <planeGeometry args={[r.xMax - r.xMin, r.zMax - r.zMin]} />
    </mesh>
  )
  const wallInward = (from: [number, number], to: [number, number]): [number, number] => {
    // 벽 선분의 법선 중 실습장 가운데를 향하는 쪽
    const cx = (mz.xMin + mz.xMax) / 2, cz = (mz.zMin + mz.zMax) / 2
    const nx = -(to[1] - from[1]), nz = to[0] - from[0]
    const mx = (from[0] + to[0]) / 2, mzz = (from[1] + to[1]) / 2
    const s = Math.sign(nx * (cx - mx) + nz * (cz - mzz)) || 1
    const len = Math.hypot(nx, nz) || 1
    return [(s * nx) / len, (s * nz) / len]
  }
  const hdri = `${import.meta.env.BASE_URL}assets/hdri/autoshop_01_1k.hdr`
  return (
    <Canvas shadows={!lowSpec} dpr={lowSpec ? 1 : [1, 1.5]} camera={{ position: [start.x + 4, 5.5, start.z + 6], fov: 50, near: 0.1, far: 120 }} gl={{ antialias: !lowSpec, powerPreference: lowSpec ? 'low-power' : 'default' }} style={{ touchAction: 'none' }}>
      <color attach="background" args={['#d9dfe4']} />
      <hemisphereLight args={['#ffffff', '#2f6b4c', lowSpec ? 1.1 : 0.7]} />
      <directionalLight position={[mz.xMax * 0.6, 14, mz.zMax * 0.3]} intensity={lowSpec ? 1.0 : 1.4} castShadow={!lowSpec}
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-bias={-0.0005} />
      {!lowSpec && <Suspense fallback={null}><Environment files={hdri} environmentIntensity={0.55} /></Suspense>}
      <Floor r={mz} />
      {ab && <Floor r={ab} />}
      {/* 시험 차로 흰 차선(사진 27·28) */}
      {tester && [-1, 1].map((s) => (
        <mesh key={s} rotation-x={-Math.PI / 2} position={[tester.x + s * (tester.w / 2 + 0.25), 0.003, tester.z]}>
          <planeGeometry args={[0.1, 7]} /><meshStandardMaterial color="#f2f2f2" roughness={0.6} />
        </mesh>
      ))}
      {/* 벽(막힘): 북·동. 안쪽 면만 보인다 */}
      {layout.walls.map((w, i) => <Wall key={w.id} from={w.from} to={w.to} inward={wallInward(w.from, w.to)} m={m} sign={i === 0} />)}
      {/* 트인 변: 바닥에 초록 띠 */}
      {layout.openings.map((o) => {
        const [x1, z1] = o.from
        const [x2, z2] = o.to
        const len = Math.hypot(x2 - x1, z2 - z1)
        const horizontal = Math.abs(z2 - z1) < 1e-6
        return (
          <group key={o.id}>
            <mesh rotation-x={-Math.PI / 2} position={[(x1 + x2) / 2, 0.01, (z1 + z2) / 2]}>
              <planeGeometry args={horizontal ? [len, 0.3] : [0.3, len]} />
              <meshBasicMaterial color="#1fbf6b" />
            </mesh>
            <Html position={[(x1 + x2) / 2, 0.6, (z1 + z2) / 2]} center style={{ pointerEvents: 'none' }}><div className="label3d open">→ {o.connectsTo}</div></Html>
          </group>
        )
      })}
      {layout.pillars.map((p) => <group key={p.id} position={[p.x, 0, p.z]}><Pillar size={p.size} m={m} /></group>)}
      {layout.equipment.filter((e) => !(vehicle && tester && (e.id === vehicle.id || e.id === tester.id))).map((e) => (
        <Equipment key={e.id} e={e} m={m} facing={facingOf(e)} lowSpec={lowSpec} raised={raisedLiftIds.includes(e.id)} selected={selectedId === e.id} highlight={highlightIds.includes(e.id)}
          showLabel={showsLabel(labelMode, { selected: selectedId === e.id, highlight: highlightIds.includes(e.id), interactive: e.interactive })} onTap={() => onSelectEquipment(e.id)} />
      ))}
      {tester && (
        <group onClick={(ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onSelectEquipment(tester.id) } }}>
          {showsLabel(labelMode, { selected: selectedId === tester.id, highlight: highlightIds.includes(tester.id), interactive: tester.interactive }) && (
            <Html position={[tester.x, 0.6, tester.z - tester.d / 2 - 0.2]} center style={{ pointerEvents: 'none' }}>
              <div className={`label3d interactive ${highlightIds.includes(tester.id) ? 'hl' : ''}`}>{tester.label}</div>
            </Html>
          )}
        </group>
      )}
      {tester && vehicle && <BrakeRig tester={tester} vehicle={vehicle} rig={rig} m={m} lowSpec={lowSpec} selected={selectedId === vehicle.id} testerHighlight={highlightIds.includes(tester.id) || selectedId === tester.id}
        showVehicleLabel={showsLabel(labelMode, { selected: selectedId === vehicle.id, highlight: highlightIds.includes(vehicle.id), interactive: vehicle.interactive })} onTapVehicle={() => onSelectEquipment(vehicle.id)} />}
      {/* NPC 교관: 남색 작업복 + 형광 조끼 */}
      <group position={[layout.npc.x, 0, layout.npc.z]} onClick={(ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onNpcTap() } }}>
        <Person suit="#24324a" vest="#c6ff00" helmet="#ffffff" />
        <Html position={[0, 2.05, 0]} center style={{ pointerEvents: 'none' }}><div className="label3d npc">NPC 교관 — 탭하여 대화</div></Html>
      </group>
      {/* 시작점 표시 */}
      <mesh rotation-x={-Math.PI / 2} position={[layout.studentStart.x, 0.02, layout.studentStart.z]}><ringGeometry args={[0.3, 0.45, 24]} /><meshBasicMaterial color="#1fbf6b" /></mesh>
      <Walker layout={layout} start={start} onMove={onMove} requestRef={requestRef} />
      <OrbitControls makeDefault enablePan={false} minDistance={3} maxDistance={18} maxPolarAngle={Math.PI / 2.1} target={[start.x, 1, start.z]} />
    </Canvas>
  )
}
