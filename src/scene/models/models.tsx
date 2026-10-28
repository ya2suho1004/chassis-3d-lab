// 장비 3D 모델(설계 07 §7) — 실습장 사진(14·27·28·3·21)을 보고 코드로 다시 만든 모양. 외부 모델 파일 없음.
// 크기는 배치 데이터의 w·d·h(일부 실측, 나머지 임시)에 맞춰 늘이고 줄인다. 상표·로고는 넣지 않는다.
import { RoundedBox } from '@react-three/drei'
import { forwardRef, useMemo } from 'react'
import * as THREE from 'three'
import { absTesterFaceTexture, cabinetPlateTexture, checkerPlateTexture, dangerSignTexture, rollerTexture, woodTexture } from './textures'

// ---------- 공통 재질 ----------
export function useMaterials() {
  return useMemo(() => ({
    carPaint: new THREE.MeshPhysicalMaterial({ color: '#e9e6df', metalness: 0.2, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
    carPaintSilver: new THREE.MeshPhysicalMaterial({ color: '#b9bdc1', metalness: 0.55, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ color: '#1c2228', metalness: 0.3, roughness: 0.1, transparent: true, opacity: 0.85 }),
    trim: new THREE.MeshStandardMaterial({ color: '#2a2d30', roughness: 0.7 }),
    tailLight: new THREE.MeshStandardMaterial({ color: '#b3121b', emissive: '#5a0006', roughness: 0.3 }),
    headLight: new THREE.MeshStandardMaterial({ color: '#e8eef2', emissive: '#30363a', roughness: 0.2, metalness: 0.4 }),
    tire: new THREE.MeshStandardMaterial({ color: '#161616', roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: '#a8adb2', metalness: 0.85, roughness: 0.3 }),
    disc: new THREE.MeshStandardMaterial({ color: '#7d7f82', metalness: 0.9, roughness: 0.45 }),
    caliper: new THREE.MeshStandardMaterial({ color: '#b71c1c', roughness: 0.5 }),
    redPaint: new THREE.MeshStandardMaterial({ color: '#c8201e', roughness: 0.55, metalness: 0.15 }),
    rubber: new THREE.MeshStandardMaterial({ map: rollerTexture(), roughness: 0.85 }),
    pit: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 1 }),
    redChecker: new THREE.MeshStandardMaterial({ map: checkerPlateTexture('#7a2a24', [6, 3]), roughness: 0.6, metalness: 0.4 }),
    olive: new THREE.MeshStandardMaterial({ color: '#5d6146', roughness: 0.75, metalness: 0.2 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#f2d21b', roughness: 0.45 }),
    absFace: new THREE.MeshStandardMaterial({ map: absTesterFaceTexture(), roughness: 0.4 }),
    cabinetPlate: new THREE.MeshStandardMaterial({ map: cabinetPlateTexture(), roughness: 0.5 }),
    blue: new THREE.MeshStandardMaterial({ color: '#2340a8', roughness: 0.5, metalness: 0.3 }),
    blueChecker: new THREE.MeshStandardMaterial({ map: checkerPlateTexture('#2a47b0', [2, 8]), roughness: 0.5, metalness: 0.35 }),
    woodLight: new THREE.MeshStandardMaterial({ map: woodTexture('light'), roughness: 0.7 }),
    woodDark: new THREE.MeshStandardMaterial({ map: woodTexture('dark'), roughness: 0.65 }),
    greenFrame: new THREE.MeshStandardMaterial({ color: '#7cc243', roughness: 0.55, metalness: 0.2 }),
    greyMetal: new THREE.MeshStandardMaterial({ color: '#8d9399', metalness: 0.7, roughness: 0.4 }),
    castAlu: new THREE.MeshStandardMaterial({ color: '#9fa3a6', metalness: 0.6, roughness: 0.55 }),
    teal: new THREE.MeshStandardMaterial({ color: '#2f8f83', roughness: 0.5, metalness: 0.2 }),
    darkPanel: new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.6 }),
    chromeLeg: new THREE.MeshStandardMaterial({ color: '#cfd3d6', metalness: 0.8, roughness: 0.3 }),
    stoolGreen: new THREE.MeshStandardMaterial({ color: '#3fb79a', roughness: 0.4 }),
    spring: new THREE.MeshStandardMaterial({ color: '#2b2b2b', metalness: 0.5, roughness: 0.4 }),
    orange: new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.5 }),
    wallWhite: new THREE.MeshStandardMaterial({ color: '#eceff1', roughness: 0.9, side: THREE.FrontSide }),
    wallGrey: new THREE.MeshStandardMaterial({ color: '#9aa2a7', roughness: 0.85, side: THREE.FrontSide }),
    pillarWhite: new THREE.MeshStandardMaterial({ color: '#f1f3f4', roughness: 0.85 }),
    sign: new THREE.MeshStandardMaterial({ map: dangerSignTexture(), roughness: 0.6 }),
  }), [])
}
export type Mats = ReturnType<typeof useMaterials>

const S = { cast: true, rcv: true }

// ---------- 차량 ----------
/** 바퀴: 지역 y축이 회전축(바깥에서 rotation-z=π/2로 눕힌다). 타이어·알로이 휠·살 5개·뒤쪽 브레이크 디스크 */
export const Wheel = forwardRef<THREE.Group, { r: number; width: number; m: Mats; outward: 1 | -1 }>(function Wheel({ r, width, m, outward }, ref) {
  return (
    <group ref={ref}>
      <mesh material={m.tire} castShadow={S.cast}><cylinderGeometry args={[r, r, width, 28]} /></mesh>
      <mesh material={m.rim} position={[0, (outward * width) / 2 + outward * 0.002, 0]}><cylinderGeometry args={[r * 0.66, r * 0.66, 0.012, 28]} /></mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} material={m.rim} position={[0, (outward * width) / 2 + outward * 0.012, 0]} rotation-y={(i * 2 * Math.PI) / 5}>
          <boxGeometry args={[r * 1.2, 0.02, r * 0.12]} />
        </mesh>
      ))}
      <mesh material={m.disc} position={[0, (outward * width) / 2 - outward * 0.03, 0]}><cylinderGeometry args={[r * 0.55, r * 0.55, 0.02, 28]} /></mesh>
    </group>
  )
})

/** 옆모습 윤곽(z: 앞 -L/2 → 뒤 +L/2, y: 높이)을 폭 방향으로 밀어 만든 형상. 가운데 정렬, 축은 rotation-y=-π/2로 맞춘다. */
function useProfileGeometry(points: Array<[number, number]>, depth: number, bevel: number) {
  return useMemo(() => {
    const s = new THREE.Shape()
    points.forEach(([z, y], i) => (i === 0 ? s.moveTo(z, y) : s.lineTo(z, y)))
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: depth - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 })
    g.translate(0, 0, -(depth - 2 * bevel) / 2)
    g.computeVertexNormals()
    return g
  }, [JSON.stringify(points), depth, bevel]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** 해치백 차체(사진 27·28: 흰색 소형 해치백). 앞 = 지역 -z, 뒤 = +z. 바퀴는 바깥에서 붙인다. 상표·로고 없음. */
export function CarBody({ w, d, h, m, paint, highlight }: { w: number; d: number; h: number; m: Mats; paint?: THREE.Material; highlight?: boolean }) {
  const L = d, k = h / 1.5
  const body = paint ?? m.carPaint
  const glowMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffb74d', emissive: '#ff8f00', emissiveIntensity: 0.35, roughness: 0.4 }), [])
  const glow = highlight ? glowMat : body
  // 아래 차체(보닛 포함, 허리선 아래)
  const lower = useProfileGeometry([[-0.5 * L, 0.3 * k], [-0.5 * L, 0.6 * k], [-0.47 * L, 0.71 * k], [-0.2 * L, 0.8 * k], [0.47 * L, 0.84 * k], [0.5 * L, 0.72 * k], [0.5 * L, 0.3 * k]], w - 0.06, 0.05)
  // 실내(유리): 앞 유리 경사·지붕·뒤 해치
  const cabin = useProfileGeometry([[-0.19 * L, 0.8 * k], [-0.02 * L, 1.15 * k], [0.36 * L, 1.17 * k], [0.47 * L, 1.0 * k], [0.47 * L, 0.84 * k]], w * 0.84, 0.03)
  const roofY = 1.17 * k
  return (
    <group>
      <mesh geometry={lower} material={glow} rotation-y={-Math.PI / 2} castShadow receiveShadow />
      <mesh geometry={cabin} material={m.glass} rotation-y={-Math.PI / 2} castShadow />
      <RoundedBox args={[w * 0.86, 0.05, 0.4 * L]} radius={0.02} smoothness={2} position={[0, roofY + 0.015, 0.165 * L]} material={glow} castShadow />
      {/* 기둥(A·C) 느낌의 차체색 띠 */}
      {[-1, 1].map((s) => <mesh key={s} material={glow} position={[s * (w * 0.42 + 0.005), 0.98 * k, 0.16 * L]}><boxGeometry args={[0.012, 0.36 * k, 0.05]} /></mesh>)}
      {/* 범퍼·아래 몰딩 */}
      <mesh material={m.trim} position={[0, 0.34 * k, -0.5 * L - 0.01]}><boxGeometry args={[w * 0.9, 0.1, 0.06]} /></mesh>
      <mesh material={m.trim} position={[0, 0.34 * k, 0.5 * L + 0.01]}><boxGeometry args={[w * 0.9, 0.1, 0.06]} /></mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh material={m.tailLight} position={[s * (w / 2 - 0.17), 0.76 * k, 0.5 * L + 0.012]}><boxGeometry args={[0.22, 0.2, 0.02]} /></mesh>
          <mesh material={m.headLight} position={[s * (w / 2 - 0.2), 0.62 * k, -0.5 * L - 0.012]}><boxGeometry args={[0.3, 0.1, 0.02]} /></mesh>
          <mesh material={m.trim} position={[s * (w / 2 + 0.04), 0.84 * k, -0.17 * L]}><boxGeometry args={[0.08, 0.07, 0.14]} /></mesh>
        </group>
      ))}
      {/* 번호판 자리(글자 없음) */}
      <mesh position={[0, 0.5 * k, 0.5 * L + 0.016]}><boxGeometry args={[0.44, 0.11, 0.01]} /><meshStandardMaterial color="#f4f4f4" roughness={0.5} /></mesh>
    </group>
  )
}

/** 정적인 차(리프트 위·측정 차량). length가 x축이면 회전해서 놓는다. */
export function StaticCar({ w, d, h, m, highlight }: { w: number; d: number; h: number; m: Mats; highlight?: boolean }) {
  const alongX = w > d
  const len = alongX ? w : d
  const wid = alongX ? d : w
  const r = 0.3
  const axle = len / 2 - 0.65
  return (
    <group rotation-y={alongX ? Math.PI / 2 : 0}>
      <CarBody w={wid} d={len} h={h} m={m} paint={m.carPaintSilver} highlight={highlight} />
      {[-1, 1].flatMap((sx) => [-axle, axle].map((z) => (
        <group key={`${sx}-${z}`} position={[sx * (wid / 2 - 0.1), r, z]} rotation-z={Math.PI / 2}>
          <Wheel r={r} width={0.2} m={m} outward={(-sx) as 1 | -1} />
        </group>
      )))}
    </group>
  )
}

// ---------- 제동력 시험기 (사진 27·28) ----------
/** 시험기 둘레 줄무늬 철판(코드 시험기·블렌더 시험기 공통) */
export function CheckerSurround({ w, d, m }: { w: number; d: number; m: Mats }) {
  return <mesh material={m.redChecker} rotation-x={-Math.PI / 2} position={[0, 0.004, 0]} receiveShadow><planeGeometry args={[w + 0.6, d + 0.6]} /></mesh>
}

/** 바닥 구덩이·빨간 틀·양끝 빨간 덮개 상자·둘레 줄무늬 철판. 롤러·리프트 판은 BrakeRig가 움직인다. */
export function BrakeTesterBase({ w, d, wheelX, m }: { w: number; d: number; wheelX: number; m: Mats }) {
  const coverW = Math.max(0.3, w / 2 - wheelX - 0.35)
  return (
    <group>
      <CheckerSurround w={w} d={d} m={m} />
      {/* 롤러 구덩이(좌·우 바퀴 자리) */}
      {[-wheelX, wheelX].map((x) => (
        <group key={x}>
          <mesh material={m.pit} rotation-x={-Math.PI / 2} position={[x, 0.006, 0]}><planeGeometry args={[0.72, d * 0.9]} /></mesh>
          {/* 롤러 사이 빨간 가로대(앞·가운데·뒤) */}
          {[-d * 0.42, 0, d * 0.42].map((z) => (
            <mesh key={z} material={m.redPaint} position={[x, 0.03, z]} castShadow><boxGeometry args={[0.7, 0.05, 0.08]} /></mesh>
          ))}
          <mesh material={m.redPaint} position={[x - 0.36, 0.03, 0]}><boxGeometry args={[0.04, 0.05, d * 0.9]} /></mesh>
          <mesh material={m.redPaint} position={[x + 0.36, 0.03, 0]}><boxGeometry args={[0.04, 0.05, d * 0.9]} /></mesh>
        </group>
      ))}
      {/* 가운데 덮개(바퀴 사이) */}
      <mesh material={m.redPaint} position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[Math.max(0.2, 2 * wheelX - 0.75), 0.04, d * 0.9]} /></mesh>
      {/* 양끝 빨간 덮개 상자 */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={m.redPaint} position={[s * (w / 2 - coverW / 2), 0.09, 0]} castShadow receiveShadow><boxGeometry args={[coverW, 0.18, d]} /></mesh>
      ))}
    </group>
  )
}

/** 롤러 하나(축 = 지역 x). BrakeRig가 rotation.x를 돌린다. */
export const Roller = forwardRef<THREE.Mesh, { r: number; len: number; m: Mats }>(function Roller({ r, len, m }, ref) {
  return <mesh ref={ref} material={m.rubber} rotation-z={Math.PI / 2} castShadow><cylinderGeometry args={[r, r, len, 20]} /></mesh>
})

// ---------- 공용 조작부: 올리브 캐비닛 + 노란 ABS TESTER (사진 14) ----------
export function AbsPanel({ w, d, h, m }: { w: number; d: number; h: number; m: Mats }) {
  // 앞면 = 지역 -z
  return (
    <group>
      <RoundedBox args={[w, h, d]} radius={0.02} smoothness={2} position={[0, h / 2, 0]} material={m.olive} castShadow receiveShadow />
      <mesh material={m.cabinetPlate} position={[0, h * 0.62, -d / 2 - 0.005]}><boxGeometry args={[w * 0.82, h * 0.12, 0.01]} /></mesh>
      <mesh material={m.yellow} position={[0, h * 0.8, -d / 2 - 0.06]} castShadow><boxGeometry args={[w * 0.92, h * 0.26, 0.1]} /></mesh>
      <mesh material={m.absFace} position={[0, h * 0.8, -d / 2 - 0.112]}><planeGeometry args={[w * 0.9, h * 0.25]} /></mesh>
      {/* 서랍 두 칸 */}
      {[0.38, 0.18].map((y) => <mesh key={y} material={m.olive} position={[0, h * y, -d / 2 - 0.006]}><boxGeometry args={[w * 0.86, h * 0.16, 0.01]} /></mesh>)}
    </group>
  )
}

// ---------- 가위형 리프트(파란색, 발판·경사로, 사진 3) ----------
export function ScissorLift({ w, d, h, m }: { w: number; d: number; h: number; m: Mats }) {
  const runW = Math.min(0.62, w * 0.3)
  const x = w / 2 - runW / 2
  return (
    <group>
      {[-x, x].map((px) => (
        <group key={px} position={[px, 0, 0]}>
          <mesh material={m.blueChecker} position={[0, h, 0]} castShadow receiveShadow><boxGeometry args={[runW, 0.08, d * 0.78]} /></mesh>
          {/* 경사로 앞뒤 */}
          {[-1, 1].map((s) => (
            <mesh key={s} material={m.blueChecker} position={[0, h / 2, s * (d * 0.39 + d * 0.06)]} rotation-x={s * Math.atan2(h, d * 0.12)} castShadow>
              <boxGeometry args={[runW, 0.04, Math.hypot(h, d * 0.12)]} />
            </mesh>
          ))}
          {/* 가위 다리(X) */}
          {[-1, 1].map((s) => (
            <mesh key={s} material={m.blue} position={[0, h / 2, 0]} rotation-x={s * Math.atan2(h, d * 0.5)} castShadow><boxGeometry args={[0.08, 0.08, Math.hypot(h, d * 0.5)]} /></mesh>
          ))}
          <mesh material={m.blue} position={[0, 0.02, 0]}><boxGeometry args={[runW * 0.7, 0.04, d * 0.55]} /></mesh>
        </group>
      ))}
      {/* 유압 실린더 */}
      <mesh material={m.greyMetal} position={[0, h * 0.45, 0]} rotation-x={Math.PI / 2.6}><cylinderGeometry args={[0.05, 0.05, h * 1.1, 12]} /></mesh>
    </group>
  )
}

// ---------- 작업대·기계·스탠드·책상 ----------
export function Workbench({ w, d, h, m, load }: { w: number; d: number; h: number; m: Mats; load?: 'transmission' | 'parts' | null }) {
  const legs = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const
  return (
    <group>
      <mesh material={m.woodDark} position={[0, h - 0.025, 0]} castShadow receiveShadow><boxGeometry args={[w, 0.05, d]} /></mesh>
      {legs.map(([sx, sz]) => <mesh key={`${sx}${sz}`} material={m.greenFrame} position={[sx * (w / 2 - 0.05), (h - 0.05) / 2, sz * (d / 2 - 0.05)]} castShadow><boxGeometry args={[0.05, h - 0.05, 0.05]} /></mesh>)}
      <mesh material={m.greenFrame} position={[0, 0.15, 0]}><boxGeometry args={[w - 0.1, 0.03, d - 0.1]} /></mesh>
      {load === 'transmission' && <RoundedBox args={[Math.min(0.55, w * 0.5), 0.38, Math.min(0.5, d * 0.4)]} radius={0.05} smoothness={2} position={[0, h + 0.19, 0]} material={m.castAlu} castShadow />}
      {load === 'parts' && [-0.3, 0, 0.3].map((z, i) => (
        <mesh key={i} material={i === 1 ? m.disc : m.castAlu} position={[(i - 1) * w * 0.25, h + 0.06, z * d * 0.5]} castShadow><cylinderGeometry args={[0.12, 0.12, 0.1, 18]} /></mesh>
      ))}
    </group>
  )
}

/** 청록색 장비(변속기 시뮬레이터·휠 밸런서·타이어 탈부착기, 사진 10·37·43) */
export function Machine({ w, d, h, m, kind }: { w: number; d: number; h: number; m: Mats; kind: 'simulator' | 'balancer' | 'changer' }) {
  return (
    <group>
      <RoundedBox args={[w * 0.8, h * 0.62, d * 0.7]} radius={0.04} smoothness={2} position={[0, h * 0.31, 0]} material={m.teal} castShadow receiveShadow />
      <mesh material={m.darkPanel} position={[0, h * 0.5, -d * 0.35 - 0.006]}><boxGeometry args={[w * 0.5, h * 0.2, 0.01]} /></mesh>
      {kind === 'balancer' && <mesh material={m.greyMetal} position={[-w * 0.3, h * 0.72, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.04, 0.04, w * 0.4, 12]} /></mesh>}
      {kind === 'changer' && <>
        <mesh material={m.greyMetal} position={[0, h * 0.64, 0]}><cylinderGeometry args={[w * 0.3, w * 0.3, 0.05, 24]} /></mesh>
        <mesh material={m.blue} position={[w * 0.3, h * 0.85, d * 0.25]}><boxGeometry args={[0.12, h * 0.7, 0.12]} /></mesh>
      </>}
      {kind === 'simulator' && <mesh material={m.castAlu} position={[0, h * 0.78, 0]} castShadow><boxGeometry args={[w * 0.5, h * 0.3, d * 0.35]} /></mesh>}
    </group>
  )
}

/** 분해 스탠드(쇽업소버·라이닝 슈·추진축, 사진 12·16·33): 받침·기둥·부품 */
export function Stand({ w, d, h, m, kind }: { w: number; d: number; h: number; m: Mats; kind: 'shock' | 'generic' }) {
  return (
    <group>
      <mesh material={m.chromeLeg} position={[0, 0.03, 0]}><boxGeometry args={[w * 0.7, 0.06, d * 0.6]} /></mesh>
      <mesh material={m.darkPanel} position={[0, h * 0.45, 0]} castShadow><cylinderGeometry args={[0.04, 0.05, h * 0.9, 10]} /></mesh>
      {kind === 'shock'
        ? [0, 1, 2, 3, 4, 5].map((i) => <mesh key={i} material={m.spring} position={[0, h * 0.55 + i * 0.07, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[0.11, 0.015, 8, 20]} /></mesh>)
        : <mesh material={m.castAlu} position={[0, h * 0.85, 0]} rotation-z={Math.PI / 2} castShadow><cylinderGeometry args={[0.08, 0.08, w * 0.8, 14]} /></mesh>}
      {kind === 'shock' && [-1, 1].map((s) => <mesh key={s} material={m.orange} position={[s * 0.18, h * 0.62, 0]}><sphereGeometry args={[0.04, 10, 10]} /></mesh>)}
    </group>
  )
}

/** 기록 책상(나무 상판·철제 다리, 사진 27) + 초록 의자 */
export function Desk({ w, d, h, m }: { w: number; d: number; h: number; m: Mats }) {
  return (
    <group>
      <mesh material={m.woodLight} position={[0, h - 0.02, 0]} castShadow receiveShadow><boxGeometry args={[w, 0.03, d]} /></mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh material={m.chromeLeg} position={[s * (w / 2 - 0.05), (h - 0.03) / 2, 0]}><boxGeometry args={[0.03, h - 0.03, 0.03]} /></mesh>
          <mesh material={m.chromeLeg} position={[s * (w / 2 - 0.05), 0.02, 0]}><boxGeometry args={[0.04, 0.03, d * 0.9]} /></mesh>
        </group>
      ))}
      <mesh position={[0.02, h + 0.002, 0.02]}><boxGeometry args={[w * 0.4, 0.002, d * 0.5]} /><meshStandardMaterial color="#fafafa" /></mesh>
      <group position={[0, 0, d / 2 + 0.35]}>
        <mesh material={m.stoolGreen} position={[0, 0.42, 0]} castShadow><boxGeometry args={[0.32, 0.04, 0.32]} /></mesh>
        {([[-1, -1], [-1, 1], [1, -1], [1, 1]] as const).map(([a, b]) => <mesh key={`${a}${b}`} material={m.stoolGreen} position={[a * 0.13, 0.2, b * 0.13]}><boxGeometry args={[0.04, 0.4, 0.04]} /></mesh>)}
      </group>
    </group>
  )
}

// ---------- 건물 ----------
/** 기둥: 흰색, 아래 1m 회색 (사진 3) */
export function Pillar({ size, m }: { size: number; m: Mats }) {
  return (
    <group>
      <mesh material={m.pillarWhite} position={[0, 2.1, 0]} castShadow receiveShadow><boxGeometry args={[size, 2.2, size]} /></mesh>
      <mesh material={m.wallGrey} position={[0, 0.5, 0]} castShadow receiveShadow><boxGeometry args={[size + 0.01, 1.0, size + 0.01]} /></mesh>
    </group>
  )
}

/** 벽: 안쪽 면만 보이게(밖에서 카메라가 볼 때 가리지 않음). 아래 1.1m 회색, 위 흰색 (사진 28) */
export function Wall({ from, to, inward, m, sign }: { from: [number, number]; to: [number, number]; inward: [number, number]; m: Mats; sign?: boolean }) {
  const [x1, z1] = from, [x2, z2] = to
  const len = Math.hypot(x2 - x1, z2 - z1)
  const ang = Math.atan2(inward[0], inward[1]) // 평면 법선(+z)을 안쪽으로
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2
  return (
    <group position={[cx, 0, cz]} rotation-y={ang}>
      <mesh material={m.wallGrey} position={[0, 0.55, 0]} receiveShadow><planeGeometry args={[len, 1.1]} /></mesh>
      <mesh material={m.wallWhite} position={[0, 2.25, 0]} receiveShadow><planeGeometry args={[len, 2.3]} /></mesh>
      {sign && <mesh material={m.sign} position={[len * 0.15, 1.9, 0.01]}><planeGeometry args={[0.5, 0.62]} /></mesh>}
    </group>
  )
}

// ---------- 사람 ----------
/** 작업복 사람: 몸(캡슐)·머리·안전모. 학생 = 파란 작업복, NPC 교관 = 남색 작업복 + 형광 조끼 */
export function Person({ suit, vest, helmet }: { suit: string; vest?: string; helmet: string }) {
  return (
    <group>
      <mesh position={[0, 0.85, 0]} castShadow><capsuleGeometry args={[0.2, 0.75, 6, 12]} /><meshStandardMaterial color={suit} roughness={0.8} /></mesh>
      {vest && <mesh position={[0, 1.0, 0]}><cylinderGeometry args={[0.215, 0.215, 0.42, 16, 1, true]} /><meshStandardMaterial color={vest} roughness={0.6} emissive={vest} emissiveIntensity={0.15} side={THREE.DoubleSide} /></mesh>}
      <mesh position={[0, 1.5, 0]} castShadow><sphereGeometry args={[0.15, 16, 16]} /><meshStandardMaterial color="#f1c9a5" roughness={0.7} /></mesh>
      <mesh position={[0, 1.6, 0]}><sphereGeometry args={[0.165, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={helmet} roughness={0.35} /></mesh>
    </group>
  )
}

/** 선택·다음 단계 장비 표시: 바닥 사각 테두리 */
export function FootprintFrame({ w, d, color }: { w: number; d: number; color: string }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape()
    const W = w / 2 + 0.12, D = d / 2 + 0.12, t = 0.07
    s.moveTo(-W, -D); s.lineTo(W, -D); s.lineTo(W, D); s.lineTo(-W, D); s.lineTo(-W, -D)
    const hole = new THREE.Path()
    hole.moveTo(-W + t, -D + t); hole.lineTo(-W + t, D - t); hole.lineTo(W - t, D - t); hole.lineTo(W - t, -D + t); hole.lineTo(-W + t, -D + t)
    s.holes.push(hole)
    return s
  }, [w, d])
  return <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}><shapeGeometry args={[shape]} /><meshBasicMaterial color={color} transparent opacity={0.9} /></mesh>
}
