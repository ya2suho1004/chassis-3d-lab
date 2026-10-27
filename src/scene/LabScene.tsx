// 3D 실습장 장면 — 단순 도형, 그림자 없음, 바닥 탭 이동, 3인칭 추적 카메라
// 이 장면은 '개발용 임시 배치'를 그린다. 실제 학교 재현 완료가 아니다(layoutConfirmed=false).
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { footprintOf, showsLabel, type LabelMode, type Pt, type SceneEquipment, type SceneLayout } from './layoutModel'
import { advanceAlongPath, buildNavGrid, findPath } from './pathfind'
import { OUTSIDE_DISTANCE, type BrakeRigState } from './brakeRig'

const WALK_SPEED = 1.6 // m/s
const TAP_MAX_PX = 6

export interface LabSceneProps {
  layout: SceneLayout
  start: Pt
  selectedId: string | null
  highlightIds: string[]
  lowSpec: boolean
  onSelectEquipment: (id: string | null) => void
  onNpcTap: () => void
  onMove: (pos: Pt, moving: boolean) => void
  /** 바닥 탭 대신 버튼으로 목적지를 넣는 통로(지정 위치 이동 보조, 설계 03 §2) */
  moveRequestRef: React.MutableRefObject<Pt | null>
  /** 제동력 시험기·시험 차량 연출 상태(brakeRig.ts) */
  rig: BrakeRigState
  labelMode: LabelMode
}

function Avatar({ pos, color }: { pos: Pt; color: string }) {
  return (
    <group position={[pos.x, 0, pos.z]}>
      <mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.22, 0.25, 1.1, 12]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, 1.3, 0]}><sphereGeometry args={[0.2, 12, 12]} /><meshStandardMaterial color="#f5d3b3" /></mesh>
      <mesh position={[0, 1.42, 0]}><cylinderGeometry args={[0.24, 0.24, 0.12, 12]} /><meshStandardMaterial color="#ffd600" /></mesh>
    </group>
  )
}

function Equipment({ e, selected, highlight, showLabel, onTap }: { e: SceneEquipment; selected: boolean; highlight: boolean; showLabel: boolean; onTap: () => void }) {
  const f = footprintOf(e)
  const w = f.xMax - f.xMin
  const d = f.zMax - f.zMin
  const color = selected ? '#ffab40' : e.color
  return (
    <group position={[e.x, 0, e.z]}>
      <mesh position={[0, e.h / 2, 0]} onClick={(ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onTap() } }}>
        <boxGeometry args={[w, e.h, d]} />
        <meshStandardMaterial color={color} emissive={highlight ? '#3b6fd6' : '#000000'} emissiveIntensity={highlight ? 0.5 : 0} />
      </mesh>
      {e.kind === 'vehicle' && <mesh position={[0, e.h * 0.95, 0]}><boxGeometry args={[w * 0.8, e.h * 0.5, d * 0.5]} /><meshStandardMaterial color="#b0bec5" /></mesh>}
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

/** 바퀴 양면의 흰 살(회전이 보이도록). 원통 축 = 지역 y */
function WheelSpokes() {
  return (
    <>
      {[0.101, -0.101].map((y) => (
        <mesh key={y} position={[0, y, 0]}><boxGeometry args={[WHEEL_R * 1.5, 0.005, 0.06]} /><meshBasicMaterial color="#eceff1" /></mesh>
      ))}
    </>
  )
}

/** 제동력 시험기 연출: 롤러 4개·리프트 판·시험 차량(진입/이탈·들림·뒷바퀴 회전). 단계 판정과 무관한 표시 전용 */
function BrakeRig({ tester, vehicle, rig, selected, showVehicleLabel, onTapVehicle }: { tester: SceneEquipment; vehicle: SceneEquipment; rig: BrakeRigState; selected: boolean; showVehicleLabel: boolean; onTapVehicle: () => void }) {
  const theta = (vehicle.rotation * Math.PI) / 180
  const away = { x: -Math.sin(theta), z: -Math.cos(theta) }
  const rearAxle = vehicle.d / 2 - 0.6
  const target = {
    dist: rig.vehicle === 'outside' ? OUTSIDE_DISTANCE : 0,
    lift: rig.liftUp ? LIFT_RISE : 0,
  }
  const carRef = useRef<THREE.Group>(null)
  const liftRefs = useRef<Array<THREE.Mesh | null>>([])
  const rollerRefs = useRef<Array<THREE.Mesh | null>>([])
  const rearWheelRefs = useRef<Array<THREE.Mesh | null>>([])
  const frontWheelRefs = useRef<Array<THREE.Mesh | null>>([])
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

  const wheelX = vehicle.w / 2 - 0.1
  // 롤러: 좌·우 바퀴 자리마다 앞뒤 2개(바퀴 아래, 축은 동서 방향)
  const rollerSpots = [-wheelX, wheelX].flatMap((x) => [-ROLLER_DZ, ROLLER_DZ].map((dz) => ({ x, dz })))
  const bodyBottom = WHEEL_R + 0.05
  return (
    <>
      <group position={[tester.x, 0, tester.z]}>
        {rollerSpots.map((r, i) => (
          <mesh key={`roller-${i}`} ref={(m) => { rollerRefs.current[i] = m }} position={[r.x, ROLLER_Y, r.dz]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[ROLLER_R, ROLLER_R, 0.6, 12]} />
            <meshStandardMaterial color="#9e9e9e" metalness={0.4} roughness={0.5} />
            {/* 회전이 보이도록 축 방향 줄무늬 */}
            <mesh position={[ROLLER_R * 0.95, 0, 0]}><boxGeometry args={[0.03, 0.6, 0.04]} /><meshBasicMaterial color="#212121" /></mesh>
          </mesh>
        ))}
        {[-wheelX, wheelX].map((x, i) => (
          <mesh key={`lift-${i}`} ref={(m) => { liftRefs.current[i] = m }} position={[x, target.lift - 0.02, 0]}>
            <boxGeometry args={[0.5, 0.04, 0.3]} />
            <meshStandardMaterial color="#ffd600" />
          </mesh>
        ))}
        {rig.rollersSpinning && (
          <Html position={[0, 0.6, tester.d / 2 + 0.3]} center style={{ pointerEvents: 'none' }}>
            <div className="label3d hl">롤러 회전 중</div>
          </Html>
        )}
      </group>
      <group ref={carRef} position={[vehicle.x + away.x * target.dist, rig.vehicle === 'outside' ? 0 : target.lift, vehicle.z + away.z * target.dist]}>
        <group rotation-y={theta}>
          <mesh position={[0, bodyBottom + (vehicle.h * 0.55) / 2, 0]} onClick={(ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onTapVehicle() } }}>
            <boxGeometry args={[vehicle.w, vehicle.h * 0.55, vehicle.d]} />
            <meshStandardMaterial color={selected ? '#ffab40' : vehicle.color} />
          </mesh>
          <mesh position={[0, bodyBottom + vehicle.h * 0.55 + vehicle.h * 0.15, -0.2]}>
            <boxGeometry args={[vehicle.w * 0.8, vehicle.h * 0.3, vehicle.d * 0.5]} />
            <meshStandardMaterial color="#b0bec5" />
          </mesh>
          {[-wheelX, wheelX].map((x, i) => (
            <group key={`wheels-${i}`}>
              <mesh ref={(m) => { rearWheelRefs.current[i] = m }} position={[x, WHEEL_R, rearAxle]} rotation-z={Math.PI / 2}>
                <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.2, 14]} />
                <meshStandardMaterial color="#263238" />
                <WheelSpokes />
              </mesh>
              <mesh ref={(m) => { frontWheelRefs.current[i] = m }} position={[x, WHEEL_R, rearAxle - 2.4]} rotation-z={Math.PI / 2}>
                <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.2, 14]} />
                <meshStandardMaterial color="#263238" />
                <WheelSpokes />
              </mesh>
            </group>
          ))}
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
  return <Avatar pos={pos} color="#2d6cdf" />
}

export function LabScene({ layout, start, selectedId, highlightIds, lowSpec, onSelectEquipment, onNpcTap, onMove, moveRequestRef, rig, labelMode }: LabSceneProps) {
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
  const Floor = ({ r, color }: { r: { xMin: number; xMax: number; zMin: number; zMax: number }; color: string }) => (
    <mesh rotation-x={-Math.PI / 2} position={[(r.xMin + r.xMax) / 2, 0, (r.zMin + r.zMax) / 2]} onClick={onFloorTap} receiveShadow={false}>
      <planeGeometry args={[r.xMax - r.xMin, r.zMax - r.zMin]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
  return (
    <Canvas dpr={lowSpec ? 1 : [1, 1.5]} camera={{ position: [start.x + 4, 5.5, start.z + 6], fov: 50, near: 0.1, far: 120 }} gl={{ antialias: !lowSpec, powerPreference: 'low-power' }} style={{ touchAction: 'none' }}>
      <color attach="background" args={['#dfe6ec']} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[10, 20, 5]} intensity={0.8} />
      <Floor r={mz} color="#2e8b57" />
      {ab && <Floor r={ab} color="#3a9a63" />}
      {/* 벽(막힘): 북·동 */}
      {layout.walls.map((w) => {
        const [x1, z1] = w.from
        const [x2, z2] = w.to
        const len = Math.hypot(x2 - x1, z2 - z1)
        const horizontal = Math.abs(z2 - z1) < 1e-6
        return (
          <mesh key={w.id} position={[(x1 + x2) / 2, 1.5, (z1 + z2) / 2]}>
            <boxGeometry args={horizontal ? [len, 3, 0.15] : [0.15, 3, len]} />
            <meshStandardMaterial color="#eceff1" transparent opacity={0.85} />
          </mesh>
        )
      })}
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
      {layout.pillars.map((p) => (
        <mesh key={p.id} position={[p.x, 1.6, p.z]}><boxGeometry args={[p.size, 3.2, p.size]} /><meshStandardMaterial color="#cfd8dc" /></mesh>
      ))}
      {layout.equipment.filter((e) => !(vehicle && tester && e.id === vehicle.id)).map((e) => (
        <Equipment key={e.id} e={e.id === tester?.id ? { ...e, h: TESTER_PLATE_H } : e} selected={selectedId === e.id} highlight={highlightIds.includes(e.id)}
          showLabel={showsLabel(labelMode, { selected: selectedId === e.id, highlight: highlightIds.includes(e.id), interactive: e.interactive })} onTap={() => onSelectEquipment(e.id)} />
      ))}
      {tester && vehicle && <BrakeRig tester={tester} vehicle={vehicle} rig={rig} selected={selectedId === vehicle.id}
        showVehicleLabel={showsLabel(labelMode, { selected: selectedId === vehicle.id, highlight: highlightIds.includes(vehicle.id), interactive: vehicle.interactive })} onTapVehicle={() => onSelectEquipment(vehicle.id)} />}
      {/* NPC 교관 */}
      <group position={[layout.npc.x, 0, layout.npc.z]} onClick={(ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onNpcTap() } }}>
        <mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.22, 0.25, 1.1, 12]} /><meshStandardMaterial color="#ef6c00" /></mesh>
        <mesh position={[0, 1.3, 0]}><sphereGeometry args={[0.2, 12, 12]} /><meshStandardMaterial color="#f5d3b3" /></mesh>
        <Html position={[0, 1.9, 0]} center style={{ pointerEvents: 'none' }}><div className="label3d npc">NPC 교관 — 탭하여 대화</div></Html>
      </group>
      {/* 시작점 표시 */}
      <mesh rotation-x={-Math.PI / 2} position={[layout.studentStart.x, 0.02, layout.studentStart.z]}><ringGeometry args={[0.3, 0.45, 24]} /><meshBasicMaterial color="#1fbf6b" /></mesh>
      <Walker layout={layout} start={start} onMove={onMove} requestRef={requestRef} />
      <OrbitControls makeDefault enablePan={false} minDistance={3} maxDistance={18} maxPolarAngle={Math.PI / 2.1} target={[start.x, 1, start.z]} />
    </Canvas>
  )
}
