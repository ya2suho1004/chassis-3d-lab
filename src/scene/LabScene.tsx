// 3D 실습장 장면 — 사진 기준 장비 모델(models/), 품질 2단계(낮음: 실시간 그림자·화면 효과 끔, 해상도 1배 — 모델·빛·반사광은 두 품질 같고 바닥 그림자는 구워서 깐다, look/), 바닥 탭 이동, 시점 3단계
// 이 장면은 '개발용 임시 배치'를 그린다. 실제 학교 재현 완료가 아니다(layoutConfirmed=false).
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls, useProgress } from '@react-three/drei'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { distanceToFootprint, footprintOf, labelState, type LabelMode, type Pt, type SceneEquipment, type SceneLayout } from './layoutModel'
import { advanceAlongPath, buildNavGrid, findPath, smoothPath } from './pathfind'
import { STICK_DEADZONE, approachSpeed, nextWalking, pathArrived, pathRemaining, pathSpeed, stickTargetSpeed, walkPlayback } from './locomotion'
import { OUTSIDE_DISTANCE, type BrakeRigState } from './brakeRig'
import { AbsPanel, BrakeTesterBase, CarBody, CheckerSurround, Desk, FootprintFrame, Machine, Person, Pillar, Roller, StaticCar, Stand, ToeGauge, Wall, Wheel, Workbench, useMaterials, type Mats } from './models/models'
import { TestCarModel, fitsTestCar } from './models/TestCarModel'
import { BrakeTesterModel, fitsBrakeTester } from './models/BrakeTesterModel'
import { AbsPanelModel, fitsAbsPanel } from './models/AbsPanelModel'
import type { MoveInput } from './Joystick'
import { Surroundings } from './Surroundings'
import type { PanelReadout } from './panelReadout'
import { ACTION_SECONDS, type AvatarAction } from './avatarActions'
import { K3Model, PrideModel, fitsK3, fitsPride } from './models/ParkedCarsModel'
import { frontWheelWorld, STRAIGHT, type TurningRig } from './turningRig'
import { TireChangerModel, WheelBalancerModel, fitsTireChanger, fitsWheelBalancer } from './models/ShopMachinesModel'
import { DiscCamera, DiscRunoutRig, gaugeFaceInRig, type DiscCase, type DiscControl } from './DiscRunout'
import { BacklashRig, backlashFaceInRig } from './BacklashRig'
import type { BacklashCase, BacklashState } from './backlash'
import { ShockStandModel, TransmissionSimulatorModel, fitsShockStand, fitsTransmissionSimulator } from './models/TrainersModel'
import { STEP_STRIDE, stepsCrossed } from './sound'
import { TapRing } from './feel/TapRing'
import type { TapPulse } from './feel/tapPulse'
import { GoalBeacon } from './feel/GoalBeacon'
import { goalSpotOf } from './feel/goalSpot'
import type { ArrowTrack } from './feel/edgeArrow'
import { AIM_RANGE, EYE_HEIGHT, FIRST_FOV, FIRST_LABEL_RADIUS, ORBIT_PRESET, aimedTarget, firstPersonLabel, lookStep, orbitPlacement, yawFromForward, type ViewMode } from './viewMode'
import { CHARACTER_LAYER, CharacterModel, DEFAULT_LOOK, INSTRUCTOR_EYE, INSTRUCTOR_HEIGHT, SAFETY_SHOES, INSTRUCTOR_OUTFIT, STUDENT_OUTFIT, WALK_CYCLE_DISTANCE, headingFor, type CharacterAction, type CharacterLook } from './models/CharacterModel'
import { bodyScale } from '../app/avatar'
import { AVANTE_SPEC, AvanteModel, SCISSOR, ScissorLiftModel, fitsScissorLift, scissorPose, type ScissorParts } from './models/ScissorLiftModel'
import { CEILING_H, hallBounds } from './Surroundings'
import { FOG, PALETTE, labBounds, lookFor } from './look/lookConfig'
import { WorkshopEnv, probePoint } from './look/WorkshopEnv'
import { makeFloorMaterial } from './look/floorMaterial'
import { KeyLight } from './look/KeyLight'
import { ToneSetup } from './look/ToneSetup'
import { FloorShadowBake } from './look/FloorShadowBake'

const Effects = lazy(() => import('./Effects'))
const TAP_MAX_PX = 6

export interface LabSceneProps {
  layout: SceneLayout
  start: Pt
  selectedId: string | null
  highlightIds: string[]
  lowSpec: boolean
  /** 품질 낮음에서도 계단 줄이기를 켠다(주소 ?aa=1 — 실기기 비교용, app/quality.ts) */
  antialias?: boolean
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
  /** 검사 통과: 교관이 고개를 끄덕인다(npcTalking과 함께 켠다) */
  npcNod?: boolean
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
  /** 누름 고리(설계 2026-11-12 §4.3): 장비나 교관을 누를 때마다 번호가 오른다. 없으면 고리도 없다 */
  tapPulse?: TapPulse | null
  /** 목적지 방향 화살표(설계 2026-11-12 §4.5): 화면 가장자리의 화살표 요소와 띠. 게임 화면만 준다 */
  goalArrow?: React.RefObject<HTMLDivElement>
  arrowTrack?: React.RefObject<ArrowTrack>
  /** 공용 조작부 계기 화면 값(과제 중) */
  panelReadout?: PanelReadout | null
  /** 계기 화면 가까이 보기: 카메라가 조작부 앞면을 비춘다 */
  panelCloseUp?: boolean
  /** 모델을 다 불러온 뒤 4초 동안 잰 평균 화면 속도(fps)를 한 번 알린다(자동 품질) */
  onFps?: (fps: number) => void
  /** 단계를 마친 뒤 학생 몸짓(seq가 바뀔 때마다 한 번, target을 바라본다) */
  avatarCue?: AvatarCue | null
  /** 보호구 착용 단계를 마쳤으면 학생에게 보안경·안전화 */
  ppe?: boolean
  /** 학생 캐릭터 외모(캐릭터 만들기, 설계 2026-11-03). 없으면 기본 */
  studentLook?: CharacterLook
  /** 디스크 런아웃 연습 */
  discPractice?: DiscPractice | null
  backlashPractice?: BacklashPractice | null
  /** 최소회전반경 과제: 앞바퀴 조향각(연출) */
  turning?: TurningRig
  /** 측정판 가까이 보기(좌·우 앞바퀴) */
  turntableCloseUp?: 'left' | 'right' | null
  /** 기록 창이 열린 동안 걷기 멈춤(설계 2026-11-10 §3.3): 가던 길·이동 요청·조이스틱을 버린다. 학생은 숨기지 않는다 */
  holdStill?: boolean
}

export interface AvatarCue { action: AvatarAction; seq: number; target: Pt | null }

/** 디스크 런아웃 연습(작업대 위 장면, open이면 카메라가 게이지를 가까이 비춘다) */
export interface DiscPractice { ctl: React.MutableRefObject<DiscControl>; disc: DiscCase; bezelDeg: number; open: boolean }
export const DISC_BENCH_ID = 'parts-bench-01/디스크'
/** 디스크 작업대(지역 좌표) 위 연습 장면 자리 */
const DISC_RIG_AT = { x: 0.05, z: -0.15 }
/** 차동기어 백래시 연습(기록 없음): 피니언 잡기 여부는 화면에서 바꾼다 */
export interface BacklashPractice { st: React.MutableRefObject<BacklashState>; bl: BacklashCase; bezelDeg: number; held: boolean; open: boolean }
export const BACKLASH_BENCH_ID = 'parts-bench-01/차동'
/** 작업대 가운데 기준 연습 장면 자리(링기어가 학생 쪽 모서리 가까이, 게이지 받침이 남쪽) */
const BL_RIG_AT = { x: -0.12, z: -0.05 }
/** 백래시 가까이 보기: 눈금판 서쪽 조금 위에서(링기어 맨 위 이빨이 눈금판 왼쪽에 함께 보이게) */
const BL_CAM_BACK = [-0.19, 0.057, 0.03] as const

/** 학생 아바타: 블렌더 캐릭터(걷기·서 있기, 가는 방향으로 돎). 불러오는 중에는 코드 모델 */
/** 사람 발밑 둥근 그림자(바닥 그림자 굽기에서 빠지므로 따로 둔다) */
const blobTexture = (() => {
  let t: THREE.Texture | null = null
  return () => {
    if (t) return t
    const c = document.createElement('canvas'); c.width = c.height = 64
    const g = c.getContext('2d')!
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31)
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
    t = new THREE.CanvasTexture(c)
    return t
  }
})()
/** size: 그림자 지름(m) — 몸 폭(팔 포함)의 약 1.5배. 학생 0.62 m → 0.95, 교관 0.69 m → 1.05 */
function BlobShadow({ size = 0.95 }: { size?: number }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }), [])
  return <mesh rotation-x={-Math.PI / 2} position-y={0.008} material={mat} renderOrder={1}><planeGeometry args={[size, size]} /></mesh>
}

/** speed: 현재 이동 속도(m/s, Walker의 ref). 걷기 동작 재생 속도를 여기서 프레임마다 정해 rate ref로 넘긴다(React 상태를 거치지 않는다) */
function Avatar({ pos, heading, moving, speed, oneShot, ppe, look }: { pos: Pt; heading: React.MutableRefObject<number>; moving: boolean; speed: React.MutableRefObject<number>; oneShot: AvatarAction | null; ppe: boolean; look: CharacterLook }) {
  const outfit = useMemo(() => (ppe ? { ...STUDENT_OUTFIT, shoes: SAFETY_SHOES } : STUDENT_OUTFIT), [ppe])
  const turn = useRef<THREE.Group>(null)
  const rate = useRef(1)
  useFrame((_, dt) => {
    // 걷기 동작은 현재 속도에 비례(최고 속도에서 예전 고정값과 같다), 다른 동작은 1배
    rate.current = moving ? walkPlayback(speed.current, WALK_CYCLE_DISTANCE * bodyScale(look.body)) : 1
    const g = turn.current
    if (!g) return
    // 가장 짧은 쪽으로 부드럽게 돈다
    let d = heading.current - g.rotation.y
    d = Math.atan2(Math.sin(d), Math.cos(d))
    g.rotation.y += d * (prefersReducedMotion ? 1 : 1 - Math.exp(-10 * Math.min(dt, 0.1)))
  })
  const code = <Person suit={STUDENT_OUTFIT.top} helmet="#ffd600" />
  return (
    <group position={[pos.x, 0, pos.z]}>
      <BlobShadow />
      <group ref={turn}>
        <Suspense fallback={code}><CharacterModel action={moving ? 'Walk' : oneShot ?? 'Idle'} outfit={outfit} goggles={ppe} look={look} rate={rate} /></Suspense>
      </group>
    </group>
  )
}

const NPC_FACING: Record<string, number> = { west: headingFor(-1, 0), east: headingFor(1, 0), north: headingFor(0, -1), south: headingFor(0, 1) }

/** NPC 교관: 서 있다가 가끔 설명 손짓(6초 서 있기 → 2초 손짓). nod = 검사 통과 끄덕임(손짓 없이 서서) */
function Instructor({ facing, talking = false, nod = false }: { facing: number; talking?: boolean; nod?: boolean }) {
  const [action, setAction] = useState<CharacterAction>('Idle')
  const t = useRef(0)
  useFrame((_, dt) => {
    t.current = (t.current + Math.min(dt, 0.1)) % 8
    // 대화 중에는 손짓을 더 자주(2초 손짓 · 1초 쉼)
    const next: CharacterAction = nod ? 'Idle' : talking ? (t.current % 3 < 2 ? 'Gesture' : 'Idle') : t.current > 6 ? 'Gesture' : 'Idle'
    if (next !== action) setAction(next)
  })
  const code = <Person suit={INSTRUCTOR_OUTFIT.trim!} vest={INSTRUCTOR_OUTFIT.top} helmet="#ffffff" height={INSTRUCTOR_HEIGHT} head={0.467} />
  return <group rotation-y={facing}><BlobShadow size={1.05} /><Suspense fallback={code}><CharacterModel instructor action={action} outfit={INSTRUCTOR_OUTFIT} goggles nod={nod} /></Suspense></group>
}

/** 장비 종류·ID로 모델을 고른다. 모르는 종류는 예전처럼 상자로 그린다. */
function EquipmentModel({ e, m, facing, lowSpec, raised, readout, disc, backlash, steer }: { e: SceneEquipment; m: Mats; facing: number | null; lowSpec: boolean; raised: boolean; readout: PanelReadout | null; disc: DiscPractice | null; backlash: BacklashPractice | null; steer: TurningRig | null }) {
  const id = e.id
  switch (e.kind) {
    case 'panel': {
      const code = <AbsPanel w={e.w} d={e.d} h={e.h} m={m} />
      return <group rotation-y={facing ?? (e.rotation * Math.PI) / 180}>{fitsAbsPanel(e) ? <Suspense fallback={code}><AbsPanelModel readout={readout} /></Suspense> : code}</group>
    }
    case 'desk': return <Desk w={e.w} d={e.d} h={e.h} m={m} />
    case 'toeGauge': return <ToeGauge w={e.w} d={e.d} h={e.h} m={m} />
    case 'lift': return <LiftRig e={e} m={m} lowSpec={lowSpec} raised={raised} car={LIFT_CARS[id] ?? null} />
    case 'vehicle': {
      // 사진 31 최소회전반경 차량(K3형 세단 + 회전반경 측정판), 사진 35 캠버·캐스터 차량(프라이드형 해치백)
      const code = <StaticCar w={e.w} d={e.d} h={e.h} m={m} />
      const alongX = e.w > e.d
      if (id === 'min-turning-radius-01' && fitsK3(e)) return <Suspense fallback={code}><K3Model alongX={alongX} steer={steer ?? STRAIGHT} /></Suspense>
      if (id === 'camber-caster-vehicle-01' && fitsPride(e)) return <Suspense fallback={code}><PrideModel alongX={alongX} /></Suspense>
      return code
    }
    case 'stand': {
      const code = <Stand w={e.w} d={e.d} h={e.h} m={m} kind={id.includes('shock') ? 'shock' : 'generic'} />
      if (id === 'shock-absorber-stand-01' && fitsShockStand(e)) return <Suspense fallback={code}><ShockStandModel /></Suspense>
      return code
    }
    case 'bench':
      if (id.includes('simulator')) {
        const code = <Machine w={e.w} d={e.d} h={e.h} m={m} kind="simulator" />
        return id === 'transmission-simulator-01' && fitsTransmissionSimulator(e) ? <Suspense fallback={code}><TransmissionSimulatorModel /></Suspense> : code
      }
      if (id.includes('balancer')) { const code = <Machine w={e.w} d={e.d} h={e.h} m={m} kind="balancer" />; return fitsWheelBalancer(e) ? <Suspense fallback={code}><WheelBalancerModel /></Suspense> : code }
      if (id.includes('changer')) { const code = <Machine w={e.w} d={e.d} h={e.h} m={m} kind="changer" />; return fitsTireChanger(e) ? <Suspense fallback={code}><TireChangerModel /></Suspense> : code }
      if (id === DISC_BENCH_ID && disc) {
        // 디스크 런아웃 연습 장면: 바이스에 물린 허브·디스크 + 옆으로 댄 다이얼 게이지(작업대 위 짐은 치운다)
        return (
          <group>
            <Workbench w={e.w} d={e.d} h={e.h} m={m} load={null} />
            <DiscRunoutRig position={[DISC_RIG_AT.x, e.h, DISC_RIG_AT.z]} ctl={disc.ctl} disc={disc.disc} bezelDeg={disc.bezelDeg} />
          </group>
        )
      }
      if (id === BACKLASH_BENCH_ID && backlash) {
        // 차동기어 백래시 연습 장면: 받침대에 물린 캐리어 + 링기어 이빨에 댄 다이얼 게이지
        return (
          <group>
            <Workbench w={e.w} d={e.d} h={e.h} m={m} load={null} />
            <BacklashRig position={[BL_RIG_AT.x, e.h, BL_RIG_AT.z]} st={backlash.st} bl={backlash.bl} bezelDeg={backlash.bezelDeg} held={backlash.held} />
          </group>
        )
      }
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

type LabelKind = 'label' | 'marker' | null

/** 멀리 있는 작동 장비 표시(◆). 이름표 대신 작게 */
function Marker({ y }: { y: number }) {
  return <Html position={[0, y, 0]} center style={{ pointerEvents: 'none' }}><div className="label3d marker" aria-hidden>◆</div></Html>
}

function Equipment({ e, m, facing, selected, highlight, label, onTap, lowSpec, raised, glow, readout, disc, backlash, steer = null }: { e: SceneEquipment; m: Mats; facing: number | null; selected: boolean; highlight: boolean; label: LabelKind; onTap: () => void; lowSpec: boolean; raised: boolean; glow: boolean; readout: PanelReadout | null; disc: DiscPractice | null; backlash: BacklashPractice | null; steer?: TurningRig | null }) {
  const f = footprintOf(e)
  const w = f.xMax - f.xMin
  const d = f.zMax - f.zMin
  return (
    <group position={[e.x, 0, e.z]} onClick={(ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onTap() } }}>
      <EquipmentModel e={e} m={m} facing={facing} lowSpec={lowSpec} raised={raised} readout={readout} disc={disc} backlash={backlash} steer={steer} />
      {glow && <GlowFrame w={w} d={d} />}
      {selected && <FootprintFrame w={w} d={d} color="#ff9800" />}
      {label === 'label' && (
        <Html position={[0, e.h + 0.35, 0]} center style={{ pointerEvents: 'none' }}>
          <div className={`label3d ${e.interactive ? 'interactive' : ''} ${highlight ? 'hl' : ''}`}>{e.label}</div>
        </Html>
      )}
      {label === 'marker' && <Marker y={e.h + 0.3} />}
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
function BrakeRig({ tester, vehicle, rig, m, selected, testerSelected, vehicleLabel, onTapVehicle, lowSpec }: { tester: SceneEquipment; vehicle: SceneEquipment; rig: BrakeRigState; m: Mats; selected: boolean; testerSelected: boolean; vehicleLabel: LabelKind; onTapVehicle: () => void; lowSpec: boolean }) {
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
  const s = useRef({ dist: target.dist, lift: target.lift, spin: 0, brake: 0, t: 0 })
  const bodyRef = useRef<THREE.Group>(null)

  useFrame((_, dt) => {
    const st = s.current
    const prevDist = st.dist
    st.dist = approach(st.dist, target.dist, 1.6, dt)
    st.lift = approach(st.lift, target.lift, 3, dt)
    // 제동 중: 롤러는 부하로 느려지고(멈추지는 않음) 뒷바퀴는 잡혀 멈춘다
    st.brake = approach(st.brake, rig.braking ? 1 : 0, 4, dt)
    st.t += dt
    st.spin = approach(st.spin, rig.rollersSpinning ? ROLLER_SPIN * (1 - 0.55 * st.brake) : 0, 2.5, dt)
    // 차량 위치·높이: 진입·이탈 중이면 바퀴가 이동 거리만큼 구른다
    const lift = rig.vehicle === 'outside' ? 0 : st.lift
    if (carRef.current) carRef.current.position.set(vehicle.x + away.x * st.dist, lift, vehicle.z + away.z * st.dist)
    for (const m of liftRefs.current) if (m) m.position.y = st.lift - 0.02
    const rollerTurn = st.spin * Math.min(dt, 0.1)
    for (const m of rollerRefs.current) if (m) m.rotation.x += rollerTurn
    const roll = (st.dist - prevDist) / WHEEL_R
    // 롤러가 돌면 뒷바퀴도 롤러에 맞물려 반대로 돈다(들린 상태에서는 닿지 않음)
    const rearDrive = st.lift < 0.02 && rig.vehicle !== 'outside' ? -rollerTurn * (ROLLER_R / WHEEL_R) * (1 - st.brake) : 0
    // 제동하면 차체가 살짝 눌리고 잠깐 떨린다(모션 줄이기면 떨림 없음)
    if (bodyRef.current) {
      const shake = prefersReducedMotion ? 0 : 0.003 * st.brake * (1 - st.brake) * 4 * Math.sin(st.t * 38)
      bodyRef.current.position.y = -0.012 * st.brake + shake
      bodyRef.current.rotation.x = 0.006 * st.brake
    }
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
        {testerSelected && <FootprintFrame w={tester.w} d={tester.d} color="#ff9800" />}
        {rig.rollersSpinning && (
          <Html position={[0, 0.6, tester.d / 2 + 0.3]} center style={{ pointerEvents: 'none' }}>
            <div className="label3d hl">롤러 회전 중</div>
          </Html>
        )}
      </group>
      <group ref={carRef} position={[vehicle.x + away.x * target.dist, rig.vehicle === 'outside' ? 0 : target.lift, vehicle.z + away.z * target.dist]}>
        <group rotation-y={theta}>
          <group ref={bodyRef}>
          {useModel ? (
            <Suspense fallback={codeCar}>
              <group onClick={tapVehicle}><TestCarModel highlight={selected} onWheels={onModelWheels} brakeLights={rig.braking} /></group>
            </Suspense>
          ) : codeCar}
          </group>
        </group>
        {vehicleLabel === 'label' && (
          <Html position={[0, vehicle.h + 0.35, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="label3d">{vehicle.label}</div>
          </Html>
        )}
        {vehicleLabel === 'marker' && <Marker y={vehicle.h + 0.3} />}
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
    // 교관 얼굴 앞(바라보는 쪽) 1.45 m, 살짝 옆에서 가슴~얼굴 높이를 본다.
    // 카메라는 교관 눈높이(1.339 m), 목표는 그보다 0.14 아래(턱 1.15와 눈 사이) — 큰 머리가 화면 위쪽 3분의 2쯤에 오는 예전 구도
    const fx = -Math.sin(facing), fz = -Math.cos(facing)
    const sx = -fz, sz = fx
    const goal = new THREE.Vector3(npc.x + fx * 1.45 + sx * 0.35, INSTRUCTOR_EYE, npc.z + fz * 1.45 + sz * 0.35)
    const tgt = new THREE.Vector3(npc.x + sx * 0.12, INSTRUCTOR_EYE - 0.14, npc.z + sz * 0.12)
    const k = prefersReducedMotion ? 1 : 1 - Math.exp(-4 * Math.min(dt, 0.1))
    camera.position.lerp(goal, k)
    look.current.lerp(tgt, k)
    camera.lookAt(look.current)
  })
  return null
}

/** 모델을 다 불러온 뒤 1초 쉬고 4초 동안 평균 fps를 재서 한 번 알린다 */
function FpsProbe({ onFps }: { onFps: (fps: number) => void }) {
  const { active } = useProgress()
  const st = useRef({ wait: 1, t: 0, n: 0, done: false })
  useFrame((_, dt) => {
    const s = st.current
    if (s.done || active) return
    if (s.wait > 0) { s.wait -= dt; return }
    s.t += dt; s.n += 1
    if (s.t >= 4) { s.done = true; onFps(s.n / s.t) }
  })
  return null
}

/** 화면 카메라와 클릭 광선이 사람 레이어(2)도 보게 한다 */
function LayerSetup() {
  const { camera, raycaster } = useThree()
  useEffect(() => { camera.layers.enable(CHARACTER_LAYER); raycaster.layers.enable(CHARACTER_LAYER) }, [camera, raycaster])
  return null
}

/** 계기 화면 가까이 보기: 조작부 앞면(바라보는 쪽) 0.8 m에서 계기 높이를 비춘다. 끝나면 원래 자리로 */
function PanelCamera({ panel, facing }: { panel: SceneEquipment; facing: number }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: OrbitControlsImpl | null }
  const look = useRef(new THREE.Vector3())
  useEffect(() => {
    const pos = camera.position.clone(), target = controls ? controls.target.clone() : null, fov = camera.fov, quat = camera.quaternion.clone()
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir)
    look.current.copy(camera.position).add(dir)
    camera.fov = 45; camera.updateProjectionMatrix()
    return () => {
      camera.fov = fov; camera.updateProjectionMatrix()
      camera.position.copy(pos); camera.quaternion.copy(quat)
      if (controls && target) { controls.target.copy(target); controls.update() }
    }
  }, [camera, controls])
  useFrame((_, dt) => {
    const fx = -Math.sin(facing), fz = -Math.cos(facing)
    const goal = new THREE.Vector3(panel.x + fx * 0.85, 1.28, panel.z + fz * 0.85)
    const tgt = new THREE.Vector3(panel.x + fx * 0.3, 1.2, panel.z + fz * 0.3)
    const k = prefersReducedMotion ? 1 : 1 - Math.exp(-5 * Math.min(dt, 0.1))
    camera.position.lerp(goal, k)
    look.current.lerp(tgt, k)
    camera.lookAt(look.current)
  })
  return null
}

/** 측정판 가까이 보기: 앞바퀴 바깥쪽 위에서 눈금(바퀴 바깥 0°)을 내려다본다. 끝나면 원래 자리로 */
function TurntableCamera({ car, side }: { car: SceneEquipment; side: 'left' | 'right' }) {
  const { camera, controls, size } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: OrbitControlsImpl | null; size: { width: number; height: number } }
  const look = useRef(new THREE.Vector3())
  useEffect(() => {
    const pos = camera.position.clone(), target = controls ? controls.target.clone() : null, fov = camera.fov, near = camera.near, quat = camera.quaternion.clone()
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir)
    look.current.copy(camera.position).add(dir)
    camera.fov = 40; camera.near = 0.02; camera.updateProjectionMatrix()
    return () => {
      camera.fov = fov; camera.near = near; camera.updateProjectionMatrix()
      camera.position.copy(pos); camera.quaternion.copy(quat)
      if (controls && target) { controls.target.copy(target); controls.update() }
    }
  }, [camera, controls])
  useFrame((_, dt) => {
    const w = frontWheelWorld(car, side)
    // 세로 화면은 가로 시야가 좁아 눈금 양 끝이 잘리므로 더 멀리서 본다
    // 낮은 가로 화면(폰 가로)은 조금 더 가까이
    const far = size.width < size.height ? Math.min(1.8, (0.7 * size.height) / size.width) : size.height < 500 ? 0.8 : 1
    const goal = new THREE.Vector3(w.x + w.outX * 0.5 * far, 0.07 + 0.62 * far, w.z + w.outZ * 0.5 * far)
    const tgt = new THREE.Vector3(w.x + w.outX * 0.19, 0.07, w.z + w.outZ * 0.19)
    const k = prefersReducedMotion ? 1 : 1 - Math.exp(-5 * Math.min(dt, 0.1))
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
  const ray = useMemo(() => { const r = new THREE.Raycaster(); r.layers.enable(CHARACTER_LAYER); return r }, [])
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

function Walker({ layout, start, onMove, requestRef, lowSpec, joystickRef, frozen, holdStill = false, posRef, view, onStep, cue, ppe, look }: { layout: SceneLayout; start: Pt; onMove: (p: Pt, moving: boolean) => void; requestRef: React.MutableRefObject<Pt | null>; lowSpec: boolean; joystickRef?: React.MutableRefObject<MoveInput>; frozen: boolean; holdStill?: boolean; posRef: React.MutableRefObject<Pt>; view: ViewMode; onStep?: () => void; cue: AvatarCue | null; ppe: boolean; look: CharacterLook }) {
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
  // 현재 이동 속도(m/s)와 걷는 방향(단위 벡터). 목표 속도로 가속·감속한다(locomotion.ts). 속도는 React 상태로 올리지 않는다
  const speed = useRef(0)
  const dirX = useRef(0)
  const dirZ = useRef(0)
  // 마지막으로 알린 뒤 자리가 바뀌었는가(걷기 판정에 들기 전의 아주 짧은 이동도 멈출 때 알린다)
  const unreported = useRef(false)
  const fwd = useMemo(() => new THREE.Vector3(), [])
  const { camera, controls } = useThree() as unknown as { camera: THREE.Camera; controls: OrbitControlsImpl | null }

  // 단계를 마친 뒤 몸짓: 장비 쪽으로 돌아 한 번 하고, 걷기 시작하면 바로 그친다
  const [oneShot, setOneShot] = useState<AvatarAction | null>(null)
  const shotLeft = useRef(0)
  useEffect(() => {
    if (!cue) return
    const p = posRef.current
    if (cue.target) {
      const dx = cue.target.x - p.x, dz = cue.target.z - p.z
      if (dx * dx + dz * dz > 1e-4) heading.current = headingFor(dx, dz)
    }
    shotLeft.current = ACTION_SECONDS[cue.action]
    // 멈추는 중(손을 뗀 뒤 미끄러지는 사이)이어도 그 자리에 서서 한다 — 다음 프레임에 걷는 중으로 판정돼 바로 끊기지 않게
    speed.current = 0
    setOneShot(cue.action)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue?.seq])
  const walked = useRef(0)
  const lastPos = useRef<Pt>(start)
  useFrame((_, dt) => {
    // 발소리: 실제로 움직인 거리로 걸음을 센다(조이스틱·탭 이동 모두)
    const lp = lastPos.current, cp = posRef.current
    const moved = Math.hypot(cp.x - lp.x, cp.z - lp.z)
    lastPos.current = cp
    if (moved > 0 && moved < 1) {
      // 보폭도 걷기 재생 속도처럼 체형 배율을 곱한다(체형 2는 약 6% 짧다)
      const n = stepsCrossed(walked.current, walked.current + moved, STEP_STRIDE * bodyScale(look.body))
      walked.current += moved
      if (n > 0) onStep?.()
    }
    // 기록 창이 열린 동안(설계 2026-11-10 §3.3): 가던 길과 새 이동 요청을 버리고 조이스틱을 무시한다. 학생은 숨기지 않는다(frozen과 다름)
    if (holdStill) {
      requestRef.current = null
      if (pathRef.current) { pathRef.current = null; onMove(posRef.current, false) }
    }
    // 새 목적지 요청 처리: A* 격자 경로에서 곧게 갈 수 있는 중간 점을 빼 꺾임을 줄이고, 서 있는 자리에서 곧게 갈 수 있으면 칸 가운데를 거치지 않는다(누른 자리는 그대로)
    if (requestRef.current) {
      const target = requestRef.current
      requestRef.current = null
      const found = findPath(grid, posRef.current, target)
      const path = found && smoothPath(grid, found, posRef.current)
      pathRef.current = path
      idxRef.current = 0
      if (!path) onMove(posRef.current, false)
      // 서 있는 자리가 곧 목적지(같은 장비 버튼을 다시 누름): 바로 끝내고, 도착 알림은 프레임 끝에서 한 번 간다
      if (path && pathArrived(posRef.current, path, 0)) { pathRef.current = null; speed.current = 0; unreported.current = true }
    }
    // 대화·가까이 보기(frozen)·기록 창(holdStill): 감속 없이 바로 선다
    if (frozen || holdStill) speed.current = 0
    const prev = posRef.current
    // 조이스틱·키보드: 카메라가 보는 쪽 기준으로 걷는다
    const j = joystickRef?.current
    const mag = j && !frozen && !holdStill ? Math.hypot(j.x, j.y) : 0
    if (j && mag > STICK_DEADZONE) {
      pathRef.current = null
      camera.getWorldDirection(fwd)
      const fl = Math.hypot(fwd.x, fwd.z) || 1
      const fx = fwd.x / fl, fz = fwd.z / fl
      dirX.current = ((-fz) * j.x + fx * -j.y) / mag
      dirZ.current = (fx * j.x + fz * -j.y) / mag
      heading.current = headingFor(dirX.current, dirZ.current)
    }
    if (pathRef.current) {
      // 경로 이동: 최고 속도로 가속하고 남은 거리에 맞춰 감속해 누른 자리에 정확히 선다
      if (!frozen) {
        speed.current = pathSpeed(speed.current, pathRemaining(posRef.current, pathRef.current, idxRef.current), dt, prefersReducedMotion)
        const r = advanceAlongPath(posRef.current, pathRef.current, idxRef.current, speed.current, Math.min(dt, 0.1))
        posRef.current = r.pos
        idxRef.current = r.index
        if (r.done) { pathRef.current = null; speed.current = 0 }
        const dx = r.pos.x - prev.x, dz = r.pos.z - prev.z
        const d = Math.hypot(dx, dz)
        if (d > 1e-4) { dirX.current = dx / d; dirZ.current = dz / d; heading.current = headingFor(dx, dz) }
      }
    } else {
      // 조이스틱 입력 크기(없으면 0)를 목표 속도로 가속·감속. 손을 떼면(또는 갈 수 없는 자리를 누르면) 마지막 방향으로 감속하며 조금 더 나아가 선다.
      // 막힌 칸이면 x·z 한쪽만 움직여 벽을 따라 미끄러지고, 둘 다 막히면 그 자리에 선다
      speed.current = approachSpeed(speed.current, stickTargetSpeed(mag), dt, prefersReducedMotion)
      const step = speed.current * Math.min(dt, 0.1)
      if (step > 0) {
        const nx = prev.x + dirX.current * step, nz = prev.z + dirZ.current * step
        if (!grid.isBlocked(nx, nz)) posRef.current = { x: nx, z: nz }
        else if (!grid.isBlocked(nx, prev.z)) posRef.current = { x: nx, z: prev.z }
        else if (!grid.isBlocked(prev.x, nz)) posRef.current = { x: prev.x, z: nz }
        else speed.current = 0
      }
    }
    const nextPos = posRef.current
    if (nextPos.x !== prev.x || nextPos.z !== prev.z) {
      // 궤도 시점은 카메라가 아바타를 따라가도록 이동량만큼 함께 옮긴다
      if (orbitFollow) {
        camera.position.x += nextPos.x - prev.x
        camera.position.z += nextPos.z - prev.z
        if (controls) { controls.target.set(nextPos.x, targetY, nextPos.z); controls.update() }
      }
      setPos(nextPos)
      unreported.current = true
    }
    // 걷기·서기는 현재 속도로 판정(이력 있음). 걷는 동안 0.25초마다, 설 때 한 번 알린다
    const was = walkingRef.current
    const now = nextWalking(was, speed.current)
    if (now) {
      lastReport.current += dt
      if (lastReport.current > 0.25) { lastReport.current = 0; unreported.current = false; onMove(nextPos, true) }
    } else if (was || (unreported.current && speed.current === 0)) {
      lastReport.current = 0
      unreported.current = false
      onMove(nextPos, false)
    }
    if (now !== was) { walkingRef.current = now; setWalking(now) }
    // 단계를 마친 뒤 몸짓: 정한 길이가 지나거나 걷기 시작하면(이번 프레임의 판정) 그친다
    if (shotLeft.current > 0) {
      shotLeft.current -= Math.min(dt, 0.1)
      if (shotLeft.current <= 0 || now) { shotLeft.current = 0; setOneShot(null) }
    }
  })

  useEffect(() => { onMove(start, false) }, [start, onMove])
  // 대화 중에는 학생을 숨겨 교관을 가리지 않게 한다(게임 대화 장면처럼). 1인칭은 내 몸을 숨긴다
  return <group visible={!frozen && view !== 'first'}><Avatar pos={pos} heading={heading} moving={walking} speed={speed} oneShot={oneShot} ppe={ppe} look={look} /></group>
}

export function LabScene({ layout, start, selectedId, highlightIds, lowSpec, antialias = false, raisedLiftIds = [], joystickRef, npcTalking = false, npcNod = false, onSelectEquipment, onNpcTap, onMove, moveRequestRef, rig, labelMode, viewMode = 'overview', playerPos, onAim, glowIds = [], onStep, tapPulse = null, goalArrow, arrowTrack, panelReadout = null, panelCloseUp = false, onFps, avatarCue = null, ppe = false, studentLook = DEFAULT_LOOK, discPractice = null, backlashPractice = null, turning = STRAIGHT, turntableCloseUp = null, holdStill = false }: LabSceneProps) {
  const m = useMaterials()
  const tester = layout.equipment.find((e) => e.id === 'brake-tester-01')
  const vehicle = layout.equipment.find((e) => e.id === 'brake-vehicle-01')
  const requestRef = moveRequestRef
  const panel = layout.equipment.find((e) => e.kind === 'panel')
  const discBench = layout.equipment.find((e) => e.id === DISC_BENCH_ID)
  const discOpen = !!discPractice?.open && !!discBench && !npcTalking
  const discGauge = useMemo(() => {
    if (!discBench) return null
    const f = gaugeFaceInRig(discPractice?.disc.preload ?? 0.5)
    return new THREE.Vector3(discBench.x + DISC_RIG_AT.x + f.x, discBench.h + f.y, discBench.z + DISC_RIG_AT.z + f.z)
  }, [discBench, discPractice?.disc.preload])
  const blBench = layout.equipment.find((e) => e.id === BACKLASH_BENCH_ID)
  const blOpen = !!backlashPractice?.open && !!blBench && !npcTalking && !discOpen
  const blGauge = useMemo(() => {
    if (!blBench) return null
    const f = backlashFaceInRig(backlashPractice?.bl.preload ?? 1)
    return new THREE.Vector3(blBench.x + BL_RIG_AT.x + f.x, blBench.h + f.y, blBench.z + BL_RIG_AT.z + f.z)
  }, [blBench, backlashPractice?.bl.preload])
  /** 대화·계기 가까이 보기·런아웃·백래시 연습 중에는 카메라를 연출이 쥐고 학생은 멈춰 숨는다 */
  const turningCar = layout.equipment.find((e) => e.id === 'min-turning-radius-01') ?? null
  const ttOpen = turntableCloseUp !== null && !npcTalking && turningCar !== null
  const camBusy = npcTalking || panelCloseUp || discOpen || blOpen || ttOpen
  // 목적지 표식(안내 있음): 다음 단계 장비가 있을 때만 자리가 나온다. 장비 이름(글자)으로 기억해 걷는 동안 다시 계산하지 않는다
  const goalId = highlightIds[0] ?? null
  const goal = useMemo(() => goalSpotOf(layout.equipment, goalId), [layout, goalId])
  const posRef = useRef<Pt>(start)
  const look = useRef({ yaw: 0, pitch: 0 })
  const first = viewMode === 'first'
  const orbit = ORBIT_PRESET[first ? 'overview' : viewMode]
  const me = playerPos ?? start
  /** 이름표·표시·숨김. 'near'(게임 기본)는 가까운 것만 이름표, 먼 작동 장비는 ◆. 다른 모드의 1인칭은 가까운 것만(고른 것·강조는 늘) */
  const labelFor = (e: SceneEquipment): LabelKind => {
    const sel = selectedId === e.id, hl = highlightIds.includes(e.id)
    const k = labelState(labelMode, { selected: sel, highlight: hl, interactive: e.interactive, aimed: glowIds.includes(e.id), distance: distanceToFootprint(me, e) })
    if (k === 'label' && first && labelMode !== 'near' && !firstPersonLabel(me, e, sel || hl)) return null
    return k
  }
  const npcDist = Math.hypot(me.x - layout.npc.x, me.z - layout.npc.z)
  /** 교관 이름표: 'near'·1인칭에서 멀면 짧게("교관"), 1인칭에서 아주 멀면 숨김 */
  const npcLabel: 'full' | 'short' | null = first && labelMode !== 'near' ? (npcDist <= FIRST_LABEL_RADIUS ? 'full' : null) : labelMode === 'near' && npcDist > 5 ? 'short' : 'full'
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
    const hall = hallBounds(layout)
    return makeFloorMaterial({ min: new THREE.Vector3(hall.xMin, 0, hall.zMin), max: new THREE.Vector3(hall.xMax, CEILING_H, hall.zMax) }, probePoint(layout), repeat)
  }, [layout, mz.xMax, mz.xMin, mz.zMax, mz.zMin])
  const tier = useMemo(() => lookFor(lowSpec), [lowSpec])
  const shadowBounds = useMemo(() => labBounds(layout), [layout])
  /** 조작부는 시험기를 바라보게 둔다(앞면 = 지역 -z) */
  const facingOf = (e: SceneEquipment): number | null => {
    if (e.kind !== 'panel' || !tester) return null
    return Math.atan2(-(tester.x - e.x), -(tester.z - e.z))
  }
  // 바닥 한 구역. 장면 안쪽에서 정의한 부품으로 두면 LabScene이 다시 그려질 때마다 새 부품으로 여겨져 바닥 메시와 모양을 통째로 다시 만든다(학생이 걷는 동안 초당 네 번쯤). 그래서 그냥 함수로 부른다
  const floorOf = (r: { xMin: number; xMax: number; zMin: number; zMax: number }, key: string) => (
    <mesh key={key} rotation-x={-Math.PI / 2} position={[(r.xMin + r.xMax) / 2, 0, (r.zMin + r.zMax) / 2]} onClick={onFloorTap} receiveShadow material={floorMat}>
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
  return (
    <Canvas shadows={tier.realtimeShadows ? 'percentage' : false} dpr={lowSpec ? 1 : [1, 1.5]} camera={{ position: [start.x + 4, 5.5, start.z + 6], fov: 50, near: 0.08, far: 120 }} gl={{ antialias: !lowSpec || antialias, powerPreference: lowSpec ? 'low-power' : 'default' }} style={{ touchAction: 'none' }}>
      {/* 빛과 재질(설계 2026-11-11): 색 보정 곡선 · 주된 빛 하나 · 낮춘 주변광 · 실습장 자체로 만든 반사광. 두 품질이 같은 빛을 쓴다 */}
      <ToneSetup />
      <color attach="background" args={[PALETTE.background]} />
      <fog attach="fog" args={[PALETTE.background, FOG.near, FOG.far]} />
      <Surroundings layout={layout} halo={tier.halo} />
      <hemisphereLight args={[PALETTE.sky, PALETTE.ground, tier.hemi]} />
      <KeyLight bounds={shadowBounds} castShadow={tier.realtimeShadows} />
      <WorkshopEnv layout={layout} resolution={tier.envResolution} />
      <LayerSetup />
      {onFps && <FpsProbe onFps={onFps} />}
      {floorOf(mz, 'main')}
      {/* 바닥 그림자: 낮음은 주된 빛 그림자 + 닿는 그늘, 높음은 닿는 그늘만 굽는다(주된 빛 그림자는 실시간) */}
      <FloorShadowBake bounds={shadowBounds} sun={tier.sunShadow} contact={tier.contactShadow} stateKey={`${raisedLiftIds.join(',')}|${rig.vehicle}|${rig.liftUp}`} />
      {ab && floorOf(ab, 'abs')}
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
            <mesh rotation-x={-Math.PI / 2} position={[(x1 + x2) / 2, 0.01, (z1 + z2) / 2]} receiveShadow>
              <planeGeometry args={horizontal ? [len, 0.3] : [0.3, len]} />
              <meshStandardMaterial color={PALETTE.line} roughness={0.5} />
            </mesh>
            <Html position={[(x1 + x2) / 2, 0.6, (z1 + z2) / 2]} center style={{ pointerEvents: 'none' }}><div className="label3d open">→ {o.connectsTo}</div></Html>
          </group>
        )
      })}
      {layout.pillars.map((p) => <group key={p.id} position={[p.x, 0, p.z]}><Pillar size={p.size} m={m} /></group>)}
      {layout.equipment.filter((e) => !(vehicle && tester && (e.id === vehicle.id || e.id === tester.id))).map((e) => (
        <Equipment key={e.id} e={e} m={m} facing={facingOf(e)} lowSpec={lowSpec} raised={raisedLiftIds.includes(e.id)} glow={glowIds.includes(e.id)} readout={e.kind === 'panel' ? panelReadout : null} disc={e.id === DISC_BENCH_ID ? discPractice : null} backlash={e.id === BACKLASH_BENCH_ID ? backlashPractice : null} steer={e.id === 'min-turning-radius-01' ? turning : null} selected={selectedId === e.id} highlight={highlightIds.includes(e.id)}
          label={discOpen || blOpen || ttOpen ? null : labelFor(e)} onTap={() => onSelectEquipment(e.id)} />
      ))}
      {tester && (
        <group onClick={(ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onSelectEquipment(tester.id) } }}>
          {labelFor(tester) === 'label' && (
            <Html position={[tester.x, 0.6, tester.z - tester.d / 2 - 0.2]} center style={{ pointerEvents: 'none' }}>
              <div className={`label3d interactive ${highlightIds.includes(tester.id) ? 'hl' : ''}`}>{tester.label}</div>
            </Html>
          )}
          {labelFor(tester) === 'marker' && <group position={[tester.x, 0, tester.z - tester.d / 2 - 0.2]}><Marker y={0.6} /></group>}
        </group>
      )}
      {tester && (glowIds.includes(tester.id) || (vehicle && glowIds.includes(vehicle.id))) && (
        <group position={[tester.x, 0, tester.z]}><GlowFrame w={footprintOf(tester).xMax - footprintOf(tester).xMin} d={footprintOf(tester).zMax - footprintOf(tester).zMin} /></group>
      )}
      {tester && vehicle && <BrakeRig tester={tester} vehicle={vehicle} rig={rig} m={m} lowSpec={lowSpec} selected={selectedId === vehicle.id} testerSelected={selectedId === tester.id}
        vehicleLabel={labelFor(vehicle)} onTapVehicle={() => onSelectEquipment(vehicle.id)} />}
      {goal && <GoalBeacon x={goal.x} z={goal.z} w={goal.w} d={goal.d} h={goal.h} hidden={camBusy} arrow={goalArrow} track={arrowTrack} />}
      {/* NPC 교관: 남색 작업복 + 형광 조끼 */}
      <group position={[layout.npc.x, 0, layout.npc.z]} onClick={(ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onNpcTap() } }}>
        <Instructor facing={NPC_FACING[layout.npc.facing ?? 'west'] ?? 0} talking={npcTalking} nod={npcNod} />
        {/* 이름표: 교관 키(1.62 m) 위 0.33 m — 예전(키 1.72 m, 2.05)과 같은 간격 */}
        {npcLabel && <Html position={[0, INSTRUCTOR_HEIGHT + 0.33, 0]} center style={{ pointerEvents: 'none' }}><div className="label3d npc">{npcLabel === 'full' ? 'NPC 교관 — 탭하여 대화' : '교관'}</div></Html>}
      </group>
      {/* 시작점 표시 */}
      <mesh rotation-x={-Math.PI / 2} position={[layout.studentStart.x, 0.02, layout.studentStart.z]} receiveShadow><ringGeometry args={[0.3, 0.45, 24]} /><meshStandardMaterial color={PALETTE.line} roughness={0.5} /></mesh>
      <TapRing pulse={tapPulse} />
      <Walker layout={layout} start={start} onMove={onMove} requestRef={requestRef} lowSpec={lowSpec} joystickRef={joystickRef} frozen={camBusy} holdStill={holdStill} posRef={posRef} view={viewMode} onStep={onStep} cue={avatarCue} ppe={ppe} look={studentLook} />
      {npcTalking && <NpcCamera npc={layout.npc} facing={NPC_FACING[layout.npc.facing ?? 'west'] ?? 0} />}
      {panelCloseUp && !npcTalking && panel && <PanelCamera panel={panel} facing={facingOf(panel) ?? 0} />}
      {discOpen && discGauge && <DiscCamera gaugeWorld={discGauge} />}
      {blOpen && blGauge && <DiscCamera key="bl" gaugeWorld={blGauge} back={BL_CAM_BACK} xFrac={0.62} />}
      {ttOpen && turningCar && turntableCloseUp && <TurntableCamera key={turntableCloseUp} car={turningCar} side={turntableCloseUp} />}
      <CameraRig view={viewMode} posRef={posRef} look={look} start={start} face={{ x: (mz.xMin + mz.xMax) / 2, z: (mz.zMin + mz.zMax) / 2 }} />
      {first && !camBusy && <FirstPersonLook posRef={posRef} look={look} />}
      {first && !camBusy && onAim && <AimProbe layout={layout} onAim={onAim} />}
      <OrbitControls makeDefault enabled={!camBusy && !first} enablePan={false} minDistance={orbit.minDistance} maxDistance={orbit.maxDistance} minPolarAngle={orbit.minPolar} maxPolarAngle={orbit.maxPolar} />
      {/* 품질 높음: 구석 그늘(AO)·색 보정·가장자리 어둡게. 태블릿(품질 낮음)은 끈다 */}
      {tier.postEffects && <Suspense fallback={null}><Effects /></Suspense>}
    </Canvas>
  )
}
