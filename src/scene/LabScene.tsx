// 3D 실습장 장면 — 단순 도형, 그림자 없음, 바닥 탭 이동, 3인칭 추적 카메라
// 이 장면은 '개발용 임시 배치'를 그린다. 실제 학교 재현 완료가 아니다(layoutConfirmed=false).
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { footprintOf, type Pt, type SceneEquipment, type SceneLayout } from './layoutModel'
import { advanceAlongPath, buildNavGrid, findPath } from './pathfind'

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

function Equipment({ e, selected, highlight, onTap }: { e: SceneEquipment; selected: boolean; highlight: boolean; onTap: () => void }) {
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
      <Html position={[0, e.h + 0.35, 0]} center distanceFactor={14} style={{ pointerEvents: 'none' }}>
        <div className={`label3d ${e.interactive ? 'interactive' : ''} ${highlight ? 'hl' : ''}`}>{e.label}</div>
      </Html>
    </group>
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

export function LabScene({ layout, start, selectedId, highlightIds, lowSpec, onSelectEquipment, onNpcTap, onMove, moveRequestRef }: LabSceneProps) {
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
            <Html position={[(x1 + x2) / 2, 0.6, (z1 + z2) / 2]} center distanceFactor={16} style={{ pointerEvents: 'none' }}><div className="label3d open">→ {o.connectsTo}</div></Html>
          </group>
        )
      })}
      {layout.pillars.map((p) => (
        <mesh key={p.id} position={[p.x, 1.6, p.z]}><boxGeometry args={[p.size, 3.2, p.size]} /><meshStandardMaterial color="#cfd8dc" /></mesh>
      ))}
      {layout.equipment.map((e) => (
        <Equipment key={e.id} e={e} selected={selectedId === e.id} highlight={highlightIds.includes(e.id)} onTap={() => onSelectEquipment(e.id)} />
      ))}
      {/* NPC 교관 */}
      <group position={[layout.npc.x, 0, layout.npc.z]} onClick={(ev: ThreeEvent<MouseEvent>) => { if (ev.delta < TAP_MAX_PX) { ev.stopPropagation(); onNpcTap() } }}>
        <mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.22, 0.25, 1.1, 12]} /><meshStandardMaterial color="#ef6c00" /></mesh>
        <mesh position={[0, 1.3, 0]}><sphereGeometry args={[0.2, 12, 12]} /><meshStandardMaterial color="#f5d3b3" /></mesh>
        <Html position={[0, 1.9, 0]} center distanceFactor={12} style={{ pointerEvents: 'none' }}><div className="label3d npc">NPC 교관 — 탭하여 대화</div></Html>
      </group>
      {/* 시작점 표시 */}
      <mesh rotation-x={-Math.PI / 2} position={[layout.studentStart.x, 0.02, layout.studentStart.z]}><ringGeometry args={[0.3, 0.45, 24]} /><meshBasicMaterial color="#1fbf6b" /></mesh>
      <Walker layout={layout} start={start} onMove={onMove} requestRef={requestRef} />
      <OrbitControls makeDefault enablePan={false} minDistance={3} maxDistance={18} maxPolarAngle={Math.PI / 2.1} target={[start.x, 1, start.z]} />
    </Canvas>
  )
}
