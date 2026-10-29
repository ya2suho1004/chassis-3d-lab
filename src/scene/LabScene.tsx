// 3D 실습장 장면 — 사진 기준 장비 모델(models/), 품질 2단계(낮음: 그림자·화면 효과 끔, 해상도 1배, 반사광은 간단한 빛 — 모델은 두 품질 같음), 바닥 탭 이동, 시점 3단계
// 이 장면은 '개발용 임시 배치'를 그린다. 실제 학교 재현 완료가 아니다(layoutConfirmed=false).
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Environment, Html, Lightformer, OrbitControls } from '@react-three/drei'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { MoveInput } from './Joystick'
import { Surroundings } from './Surroundings'
import { STEP_STRIDE, stepsCrossed } from './sound'
import { AIM_RANGE, EYE_HEIGHT, FIRST_FOV, FIRST_LABEL_RADIUS, ORBIT_PRESET, aimedTarget, firstPersonLabel, lookStep, orbitPlacement, yawFromForward, type ViewMode } from './viewMode'
import { CharacterModel, INSTRUCTOR_OUTFIT, STUDENT_OUTFIT, WALK_CYCLE_DISTANCE, headingFor, type CharacterAction } from './models/CharacterModel'
import { AVANTE_SPEC, AvanteModel, SCISSOR, ScissorLiftModel, fitsScissorLift, scissorPose, type ScissorParts } from './models/ScissorLiftModel'

const Effects = lazy(() => import('./Effects'))
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
  /** 조이스틱·키보드 이동 입력(게임 화면). 없으면 탭 이동만 */
  joystickRef?: React.MutableRefObject<MoveInput>
  /** NPC 대화 중: 카메라가 교관 상반신을 비추고 교관이 손짓한다 */
  npcTalking?: boolean
  labelMode: LabelMode
  /** 시점(게임 화면). 없으면 내려다보기 */
  viewMode?: ViewMode
  /** 학생 위치(1인칭 이름표 거리 판단) */
  playerPos?: Pt
  /** 1인칭 가운데 조준점이 가리키는 장비 ID(교관은 '__npc'), 없으면 null. 바뀔 때만 부른다 */
  onAim?: (id: string | null) => void
  /** 바닥 둘레가 빛나는 장비(가까이 있는 장비·조준한 장비) */
  glowIds?: string[]
  /** 한 걸음 디딜 때마다(발소리) */
  onStep?: () => void
}

/** 학생 아바타: 블렌더 캐릭터(걷기·서 있기, 가는 방향으로 돎). 불러오는 중에는 코드 모델 */
function Avatar({ pos, heading, moving }: { pos: Pt; heading: React.MutableRefObject<number>; moving: boolean }) {
  const turn = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    const g = turn.current
    if (!g) return
    // 가장 짧은 쪽으로 부드럽게 돈다
    let d = heading.current - g.rotation.y
    d = Math.atan2(Math.sin(d), Math.cos(d))
    g.rotation.y += d * (prefersReducedMotion ? 1 : 1 - Math.exp(-10 * Math.min(dt, 0.1)))
  })
  const code = <Person suit="#2f5fb3" helmet="#ffd600" />
  return (
    <group position={[pos.x, 0, pos.z]}>
      <group ref={turn}>
        <Suspense fallback={code}><CharacterModel action={moving ? 'Walk' : 'Idle'} outfit={STUDENT_OUTFIT} speed={WALK_SPEED / WALK_CYCLE_DISTANCE} /></Suspense>
      </group>
    </group>
  )
}

const NPC_FACING: Record<string, number> = { west: headingFor(-1, 0), east: headingFor(1, 0), north: headingFor(0, -1), south: headingFor(0, 1) }

/** NPC 교관: 서 있다가 가끔 설명 손짓(6초 서 있기 → 2초 손짓) */
function Instructor({ facing, talking = false }: { facing: number; talking?: boolean }) {
  const [action, setAction] = useState<CharacterAction>('Idle')
  const t = useRef(0)
  useFrame((_, dt) => {
    t.current = (t.current + Math.min(dt, 0.1)) % 8
    // 대화 중에는 손짓을 더 자주(2초 손짓 · 1초 쉼)
    const next: CharacterAction = talking ? (t.current % 3 < 2 ? 'Gesture' : 'Idle') : t.current > 6 ? 'Gesture' : 'Idle'
    if (next !== action) setAction(next)
  })
  const code = <Person suit="#24324a" vest="#c6ff00" helmet="#ffffff" />
  return <group rotation-y={facing}><Suspense fallback={code}><CharacterModel action={action} outfit={INSTRUCTOR_OUTFIT} /></Suspense></group>
}

/** 장비 종류·ID로 모델을 고른다. 모르는 종류는 예전처럼 상자로 그린다. */
function EquipmentModel({ e, m, facing, lowSpec, raised }: { e: SceneEquipment; m: Mats; facing: number | null; lowSpec: boolean; raised: boolean }) {
  const id = e.id
  switch (e.kind) {
    case 'panel': {
      const code = <AbsPanel w={e.w} d={e.d} h={e.h} m={m} />
      return <group rotation-y={facing ?? (e.rotation * Math.PI) / 180}>{fitsAbsPanel(e) ? <Suspense fallback={code}><AbsPanelModel /></Suspense> : code}</group>
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

/** 가까이 있거나 조준한 장비: 바닥 둘레에 노란 띠가 천천히 숨 쉬듯 밝아졌다 어두워진다(모션 줄이기면 고정) */
function GlowFrame({ w, d }: { w: number; d: number }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape()
    const W = w / 2 + 0.3, D = d / 2 + 0.3, t = 0.12
    s.moveTo(-W, -D); s.lineTo(W, -D); s.lineTo(W, D); s.lineTo(-W, D); s.lineTo(-W, -D)
    const hole = new THREE.Path()
    hole.moveTo(-W + t, -D + t); hole.lineTo(-W + t, D - t); hole.lineTo(W - t, D - t); hole.lineTo(W - t, -D + t); hole.lineTo(-W + t, -D + t)
    s.holes.push(hole)
    return new THREE.ShapeGeometry(s)
  }, [w, d])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd54a', transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }), [])
  useFrame(({ clock }) => { mat.opacity = prefersReducedMotion ? 0.75 : 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 3)) })
  return <mesh rotation-x={-Math.PI / 2} position={[0, 0.014, 0]} geometry={geo} material={mat} renderOrder={2} />
}

function Equipment({ e, m, facing, selected, highlight, showLabel, onTap, lowSpec, raised, glow }: { e: SceneEquipment; m: Mats; facing: number | null; selected: boolean; highlight: boolean; showLabel: boolean; onTap: () => void; lowSpec: boolean; raised: boolean; glow: boolean }) {
  const f = footprintOf(e)
  const w = f.xMax - f.xMin
  const d = f.zMax - f.zMin
  return (
    <group position={[e.x, 0, e.z]} onClick={(ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onTap() } }}>
      <EquipmentModel e={e} m={m} facing={facing} lowSpec={lowSpec} raised={raised} />
      {glow && <GlowFrame w={w} d={d} />}
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
  const useModel = fitsScissorLift(e)
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
  const useModel = fitsTestCar(vehicle)
  const onModelWheels = useCallback((front: THREE.Object3D[], rear: THREE.Object3D[]) => { frontWheelRefs.current = front; rearWheelRefs.current = rear }, [])
  // 시험기도 같은 규칙: 블렌더 모델의 롤러·리프트 판 노드를 코드 시험기와 같은 방식으로 움직인다
  const wheelX = vehicle.w / 2 - 0.1
  const useTesterModel = fitsBrakeTester(tester, wheelX)
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

/** NPC 대화 연출: 카메라를 교관 앞 대각선 위치로 부드럽게 옮겨 상반신을 비춘다. 대화가 끝나면 원래 자리로 돌아간다 */
function NpcCamera({ npc, facing }: { npc: Pt; facing: number }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: OrbitControlsImpl | null }
  const saved = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  const look = useRef(new THREE.Vector3())
  useEffect(() => {
    saved.current = { pos: camera.position.clone(), target: controls ? controls.target.clone() : new THREE.Vector3(npc.x, 1, npc.z) }
    look.current.copy(saved.current.target)
    // 대화 장면 구도는 시야각 50 기준(1인칭 70이면 교관이 작게 보인다)
    const fov = camera.fov
    camera.fov = 50; camera.updateProjectionMatrix()
    return () => {
      camera.fov = fov; camera.updateProjectionMatrix()
      const s = saved.current
      if (!s) return
      camera.position.copy(s.pos)
      if (controls) { controls.target.copy(s.target); controls.update() } else camera.lookAt(s.target)
    }
  }, [camera, controls, npc.x, npc.z])
  useFrame((_, dt) => {
    // 교관 얼굴 앞(바라보는 쪽) 1.45 m, 살짝 옆에서 가슴~얼굴 높이를 본다
    const fx = -Math.sin(facing), fz = -Math.cos(facing)
    const sx = -fz, sz = fx
    const goal = new THREE.Vector3(npc.x + fx * 1.45 + sx * 0.35, 1.52, npc.z + fz * 1.45 + sz * 0.35)
    const tgt = new THREE.Vector3(npc.x + sx * 0.12, 1.38, npc.z + sz * 0.12)
    const k = prefersReducedMotion ? 1 : 1 - Math.exp(-4 * Math.min(dt, 0.1))
    camera.position.lerp(goal, k)
    look.current.lerp(tgt, k)
    camera.lookAt(look.current)
  })
  return null
}

/** 시점을 바꿀 때 카메라 자리·시야각을 한 번 맞춘다. 지금 보던 수평 방향은 그대로 이어 간다 */
function CameraRig({ view, posRef, look, start, face }: { view: ViewMode; posRef: React.MutableRefObject<Pt>; look: React.MutableRefObject<{ yaw: number; pitch: number }>; start: Pt; face: Pt }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: OrbitControlsImpl | null }
  const pending = useRef<ViewMode | null>(view)
  // 처음에는 시작점에서 실습장 가운데를 보는 방향(시작점이 서쪽 끝이라 바깥을 보지 않게)
  const fwd = useRef(new THREE.Vector3(face.x - start.x, 0, face.z - start.z))
  const prev = useRef<ViewMode | null>(null)
  useEffect(() => {
    // 바뀐 직후(다음 프레임에 궤도 조작기가 옛 중심을 보게 돌리기 전)에 지금 보던 방향을 잡아 둔다
    if (prev.current !== null && prev.current !== view) camera.getWorldDirection(fwd.current)
    prev.current = view
    pending.current = view
  }, [view, camera])
  useFrame(() => {
    const v = pending.current
    if (!v || (v !== 'first' && !controls)) return
    pending.current = null
    const f = fwd.current
    const p = posRef.current ?? start
    if (v === 'first') {
      look.current = { yaw: yawFromForward(f.x, f.z), pitch: -0.12 }
      camera.fov = FIRST_FOV
    } else {
      const { target, position } = orbitPlacement(v, p, f.x, f.z)
      camera.fov = ORBIT_PRESET[v].fov
      camera.position.set(...position)
      if (controls) { controls.target.set(...target); controls.update() }
    }
    camera.updateProjectionMatrix()
  })
  return null
}

/** 1인칭: 눈높이에 카메라를 두고, 화면(캔버스)을 끌면 고개를 돌린다. 손가락 하나만 쓴다(조이스틱은 캔버스 밖이라 겹치지 않음) */
function FirstPersonLook({ posRef, look }: { posRef: React.MutableRefObject<Pt>; look: React.MutableRefObject<{ yaw: number; pitch: number }> }) {
  const { camera, gl } = useThree()
  useEffect(() => {
    const el = gl.domElement
    let active: number | null = null
    let lx = 0, ly = 0
    const down = (e: PointerEvent) => { if (active !== null || (e.pointerType === 'mouse' && e.button !== 0)) return; active = e.pointerId; lx = e.clientX; ly = e.clientY }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== active) return
      look.current = lookStep(look.current.yaw, look.current.pitch, e.clientX - lx, e.clientY - ly)
      lx = e.clientX; ly = e.clientY
    }
    const up = (e: PointerEvent) => { if (e.pointerId === active) active = null }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  }, [gl, look])
  useFrame(() => {
    const p = posRef.current
    camera.position.set(p.x, EYE_HEIGHT, p.z)
    camera.rotation.set(look.current.pitch, look.current.yaw, 0, 'YXZ')
  })
  return null
}

/** 1인칭 가운데 조준점: 0.15초마다 화면 가운데로 광선을 쏴 처음 닿은 보이는 물체가 어느 장비인지 알린다 */
function AimProbe({ layout, onAim }: { layout: SceneLayout; onAim: (id: string | null) => void }) {
  const { camera, scene } = useThree()
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const last = useRef<string | null>(null)
  const t = useRef(0)
  useEffect(() => () => { if (last.current !== null) onAim(null) }, [onAim])
  useFrame((_, dt) => {
    t.current += dt
    if (t.current < 0.15) return
    t.current = 0
    ray.setFromCamera(new THREE.Vector2(0, 0), camera)
    ray.far = AIM_RANGE + 0.5
    const meshes: THREE.Object3D[] = []
    const collect = (o: THREE.Object3D) => { if (!o.visible) return; if ((o as THREE.Mesh).isMesh) meshes.push(o); o.children.forEach(collect) }
    collect(scene)
    const hit = ray.intersectObjects(meshes, false).find((h) => h.distance > 0.2)
    const id = hit ? aimedTarget(layout.equipment, layout.npc, hit.point, hit.distance) : null
    if (id !== last.current) { last.current = id; onAim(id) }
  })
  return null
}

function Walker({ layout, start, onMove, requestRef, lowSpec, joystickRef, frozen, posRef, view, onStep }: { layout: SceneLayout; start: Pt; onMove: (p: Pt, moving: boolean) => void; requestRef: React.MutableRefObject<Pt | null>; lowSpec: boolean; joystickRef?: React.MutableRefObject<MoveInput>; frozen: boolean; posRef: React.MutableRefObject<Pt>; view: ViewMode; onStep?: () => void }) {
  const grid = useMemo(() => buildNavGrid(layout, 0.5), [layout])
  const [pos, setPos] = useState<Pt>(start)
  // 1인칭은 카메라를 FirstPersonLook이 눈높이에 직접 둔다. 궤도 시점만 이동량만큼 카메라를 함께 옮긴다
  const orbitFollow = view !== 'first'
  const targetY = view === 'first' ? 1.0 : ORBIT_PRESET[view].targetY
  const pathRef = useRef<Pt[] | null>(null)
  const idxRef = useRef(0)
  const lastReport = useRef(0)
  const heading = useRef(0)
  const [walking, setWalking] = useState(false)
  const walkingRef = useRef(false)
  const { camera, controls } = useThree() as unknown as { camera: THREE.Camera; controls: OrbitControlsImpl | null }

  const walked = useRef(0)
  const lastPos = useRef<Pt>(start)
  useFrame((_, dt) => {
    // 발소리: 실제로 움직인 거리로 걸음을 센다(조이스틱·탭 이동 모두)
    const lp = lastPos.current, cp = posRef.current
    const moved = Math.hypot(cp.x - lp.x, cp.z - lp.z)
    lastPos.current = cp
    if (moved > 0 && moved < 1) {
      const n = stepsCrossed(walked.current, walked.current + moved, STEP_STRIDE)
      walked.current += moved
      if (n > 0) onStep?.()
    }
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
    // 조이스틱·키보드: 카메라가 보는 쪽 기준으로 걷는다. 막힌 칸이면 x·z 한쪽만 움직여 벽을 따라 미끄러진다
    const j = joystickRef?.current
    const mag = j && !frozen ? Math.hypot(j.x, j.y) : 0
    if (j && mag > 0.15) {
      pathRef.current = null
      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd)
      const fl = Math.hypot(fwd.x, fwd.z) || 1
      const fx = fwd.x / fl, fz = fwd.z / fl
      const k = Math.min(1, mag), step = WALK_SPEED * k * Math.min(dt, 0.1)
      const vx = ((-fz) * j.x + fx * -j.y) / mag, vz = (fx * j.x + fz * -j.y) / mag
      const prev = posRef.current
      const cands: Pt[] = [{ x: prev.x + vx * step, z: prev.z + vz * step }, { x: prev.x + vx * step, z: prev.z }, { x: prev.x, z: prev.z + vz * step }]
      const nextPos = cands.find((c) => !grid.isBlocked(c.x, c.z))
      heading.current = headingFor(vx, vz)
      if (nextPos) {
        posRef.current = nextPos
        if (orbitFollow) {
          camera.position.x += nextPos.x - prev.x
          camera.position.z += nextPos.z - prev.z
          if (controls) { controls.target.set(nextPos.x, targetY, nextPos.z); controls.update() }
        }
        setPos(nextPos)
        moving = true
        lastReport.current += dt
        if (lastReport.current > 0.25) { lastReport.current = 0; onMove(nextPos, true) }
      }
    } else if (walkingRef.current && !pathRef.current) {
      onMove(posRef.current, false)
    }
    if (pathRef.current && !frozen) {
      const r = advanceAlongPath(posRef.current, pathRef.current, idxRef.current, WALK_SPEED, Math.min(dt, 0.1))
      const prev = posRef.current
      posRef.current = r.pos
      idxRef.current = r.index
      moving = !r.done
      if (r.done) pathRef.current = null
      const dx = r.pos.x - prev.x, dz = r.pos.z - prev.z
      if (dx * dx + dz * dz > 1e-8) heading.current = headingFor(dx, dz)
      // 카메라가 아바타를 따라가도록 이동량만큼 함께 이동
      if (orbitFollow) {
        camera.position.x += r.pos.x - prev.x
        camera.position.z += r.pos.z - prev.z
        if (controls) { controls.target.set(r.pos.x, targetY, r.pos.z); controls.update() }
      }
      setPos(r.pos)
      lastReport.current += dt
      if (!moving || lastReport.current > 0.25) { lastReport.current = 0; onMove(r.pos, moving) }
    }
    if (moving !== walkingRef.current) { walkingRef.current = moving; setWalking(moving) }
  })

  useEffect(() => { onMove(start, false) }, [start, onMove])
  // 대화 중에는 학생을 숨겨 교관을 가리지 않게 한다(게임 대화 장면처럼). 1인칭은 내 몸을 숨긴다
  return <group visible={!frozen && view !== 'first'}><Avatar pos={pos} heading={heading} moving={walking} /></group>
}

export function LabScene({ layout, start, selectedId, highlightIds, lowSpec, raisedLiftIds = [], joystickRef, npcTalking = false, onSelectEquipment, onNpcTap, onMove, moveRequestRef, rig, labelMode, viewMode = 'overview', playerPos, onAim, glowIds = [], onStep }: LabSceneProps) {
  const m = useMaterials()
  const tester = layout.equipment.find((e) => e.id === 'brake-tester-01')
  const vehicle = layout.equipment.find((e) => e.id === 'brake-vehicle-01')
  const requestRef = moveRequestRef
  const posRef = useRef<Pt>(start)
  const look = useRef({ yaw: 0, pitch: 0 })
  const first = viewMode === 'first'
  const orbit = ORBIT_PRESET[first ? 'overview' : viewMode]
  /** 1인칭은 가까운 장비 이름표만(고른 것·다음 단계 장비는 늘) */
  const labelFor = (e: SceneEquipment): boolean => {
    const sel = selectedId === e.id, hl = highlightIds.includes(e.id)
    if (!showsLabel(labelMode, { selected: sel, highlight: hl, interactive: e.interactive })) return false
    return !first || firstPersonLabel(playerPos ?? start, e, sel || hl)
  }
  const npcLabel = !first || Math.hypot((playerPos ?? start).x - layout.npc.x, (playerPos ?? start).z - layout.npc.z) <= FIRST_LABEL_RADIUS
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
    <Canvas shadows={!lowSpec} dpr={lowSpec ? 1 : [1, 1.5]} camera={{ position: [start.x + 4, 5.5, start.z + 6], fov: 50, near: 0.08, far: 120 }} gl={{ antialias: !lowSpec, powerPreference: lowSpec ? 'low-power' : 'default' }} style={{ touchAction: 'none' }}>
      <color attach="background" args={['#d9dfe4']} />
      <fog attach="fog" args={['#d9dfe4', 24, 60]} />
      <Surroundings layout={layout} />
      <hemisphereLight args={['#ffffff', '#2f6b4c', lowSpec ? 1.1 : 0.7]} />
      <directionalLight position={[mz.xMax * 0.6, 14, mz.zMax * 0.3]} intensity={lowSpec ? 1.0 : 1.4} castShadow={!lowSpec}
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-bias={-0.0005} />
      {/* 반사광: 품질 높음은 정비소 HDRI(1.6 MB), 낮음은 내려받기 없이 천장 조명판 모양의 간단한 빛으로 만든다 */}
      {!lowSpec ? <Suspense fallback={null}><Environment files={hdri} environmentIntensity={0.55} /></Suspense> : (
        <Environment resolution={32} environmentIntensity={0.6}>
          <Lightformer form="rect" intensity={2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
          <Lightformer form="rect" intensity={0.6} position={[0, 1, -8]} scale={[20, 3, 1]} />
          <Lightformer form="rect" intensity={0.6} position={[0, 1, 8]} rotation-y={Math.PI} scale={[20, 3, 1]} />
        </Environment>
      )}
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
        <Equipment key={e.id} e={e} m={m} facing={facingOf(e)} lowSpec={lowSpec} raised={raisedLiftIds.includes(e.id)} glow={glowIds.includes(e.id)} selected={selectedId === e.id} highlight={highlightIds.includes(e.id)}
          showLabel={labelFor(e)} onTap={() => onSelectEquipment(e.id)} />
      ))}
      {tester && (
        <group onClick={(ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onSelectEquipment(tester.id) } }}>
          {labelFor(tester) && (
            <Html position={[tester.x, 0.6, tester.z - tester.d / 2 - 0.2]} center style={{ pointerEvents: 'none' }}>
              <div className={`label3d interactive ${highlightIds.includes(tester.id) ? 'hl' : ''}`}>{tester.label}</div>
            </Html>
          )}
        </group>
      )}
      {tester && (glowIds.includes(tester.id) || (vehicle && glowIds.includes(vehicle.id))) && (
        <group position={[tester.x, 0, tester.z]}><GlowFrame w={footprintOf(tester).xMax - footprintOf(tester).xMin} d={footprintOf(tester).zMax - footprintOf(tester).zMin} /></group>
      )}
      {tester && vehicle && <BrakeRig tester={tester} vehicle={vehicle} rig={rig} m={m} lowSpec={lowSpec} selected={selectedId === vehicle.id} testerHighlight={highlightIds.includes(tester.id) || selectedId === tester.id}
        showVehicleLabel={labelFor(vehicle)} onTapVehicle={() => onSelectEquipment(vehicle.id)} />}
      {/* NPC 교관: 남색 작업복 + 형광 조끼 */}
      <group position={[layout.npc.x, 0, layout.npc.z]} onClick={(ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onNpcTap() } }}>
        <Instructor facing={NPC_FACING[layout.npc.facing ?? 'west'] ?? 0} talking={npcTalking} />
        {npcLabel && <Html position={[0, 2.05, 0]} center style={{ pointerEvents: 'none' }}><div className="label3d npc">NPC 교관 — 탭하여 대화</div></Html>}
      </group>
      {/* 시작점 표시 */}
      <mesh rotation-x={-Math.PI / 2} position={[layout.studentStart.x, 0.02, layout.studentStart.z]}><ringGeometry args={[0.3, 0.45, 24]} /><meshBasicMaterial color="#1fbf6b" /></mesh>
      <Walker layout={layout} start={start} onMove={onMove} requestRef={requestRef} lowSpec={lowSpec} joystickRef={joystickRef} frozen={npcTalking} posRef={posRef} view={viewMode} onStep={onStep} />
      {npcTalking && <NpcCamera npc={layout.npc} facing={NPC_FACING[layout.npc.facing ?? 'west'] ?? 0} />}
      <CameraRig view={viewMode} posRef={posRef} look={look} start={start} face={{ x: (mz.xMin + mz.xMax) / 2, z: (mz.zMin + mz.zMax) / 2 }} />
      {first && !npcTalking && <FirstPersonLook posRef={posRef} look={look} />}
      {first && !npcTalking && onAim && <AimProbe layout={layout} onAim={onAim} />}
      <OrbitControls makeDefault enabled={!npcTalking && !first} enablePan={false} minDistance={orbit.minDistance} maxDistance={orbit.maxDistance} minPolarAngle={orbit.minPolar} maxPolarAngle={orbit.maxPolar} />
      {/* 품질 높음: 구석 그늘(AO)·색 보정·가장자리 어둡게. 태블릿(품질 낮음)은 끈다 */}
      {!lowSpec && <Suspense fallback={null}><Effects /></Suspense>}
    </Canvas>
  )
}
