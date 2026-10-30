// 다이얼 게이지 + 마그네틱 베이스(public/assets/models/dial-gauge.glb) — scripts/blender/build_dial_gauge.py로 만든다.
// 모델에는 눈금·숫자가 없다. 눈금판 그림(100눈금·0~90 숫자·회전계 0~10)은 아래 캔버스 평면으로 베젤에 붙인다(베젤과 함께 돈다).
// 움직이는 노드: Needle(큰 바늘, 지역 z축 회전), CounterNeedle(회전계), Spindle(측정축, 지역 y로 들어감), Bezel(영점 맞춤 회전).
// 앞(눈금판) = 지역 -z. 뿌리 원점 = 마그네틱 베이스 바닥 가운데.
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { counterAngle, needleAngle } from '../dialGauge'

export const DIAL_GAUGE_URL = `${import.meta.env.BASE_URL}assets/models/dial-gauge.glb`
/** 측정축이 옆(+x)을 향한 자세(세워 물린 디스크 면 측정, build_dial_gauge.py pose=h). 노드 이름은 같다 */
export const DIAL_GAUGE_H_URL = `${import.meta.env.BASE_URL}assets/models/dial-gauge-h.glb`

/** build_dial_gauge.py 상수와 같아야 한다(m) */
export const DIAL_GAUGE = {
  dialR: 0.0285, faceR: 0.025, counter: { x: 0, z: 0.0105, r: 0.0058 },
  indicator: { x: 0.16, y: 0.135 },
  base: { w: 0.06, d: 0.05, h: 0.055 },
} as const

let faceTex: THREE.Texture | null = null
/** 눈금판 그림: 바깥 100눈금(5·10칸마다 길게), 0·10·…·90 숫자, 위쪽 회전계(0~10), 0.01 mm 표시 */
function dialFaceTexture(): THREE.Texture {
  if (faceTex) return faceTex
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S
  const g = c.getContext('2d')!
  const cx = S / 2, cy = S / 2, R = S / 2 - 6
  g.clearRect(0, 0, S, S)
  g.strokeStyle = '#111'; g.fillStyle = '#111'; g.lineCap = 'butt'
  for (let i = 0; i < 100; i++) {
    const a = (2 * Math.PI * i) / 100
    const len = i % 10 === 0 ? 70 : i % 5 === 0 ? 52 : 34
    g.lineWidth = i % 10 === 0 ? 6 : 3.5
    g.beginPath(); g.moveTo(cx + (R - 8) * Math.sin(a), cy - (R - 8) * Math.cos(a)); g.lineTo(cx + (R - 8 - len) * Math.sin(a), cy - (R - 8 - len) * Math.cos(a)); g.stroke()
  }
  g.font = 'bold 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  for (let n = 0; n < 100; n += 10) {
    const a = (2 * Math.PI * n) / 100, r = R - 130
    g.fillText(String(n), cx + r * Math.sin(a), cy - r * Math.cos(a))
  }
  // 회전계(1 mm마다 1칸, 0~10): 모델의 회전계 바늘 자리와 같다
  const k = S / 2 / DIAL_GAUGE.faceR
  const ccx = cx + DIAL_GAUGE.counter.x * k, ccy = cy - DIAL_GAUGE.counter.z * k, cr = DIAL_GAUGE.counter.r * k
  g.lineWidth = 3; g.beginPath(); g.arc(ccx, ccy, cr, 0, 2 * Math.PI); g.stroke()
  for (let i = 0; i < 10; i++) {
    const a = (2 * Math.PI * i) / 10
    g.lineWidth = 3; g.beginPath(); g.moveTo(ccx + cr * Math.sin(a), ccy - cr * Math.cos(a)); g.lineTo(ccx + (cr - 22) * Math.sin(a), ccy - (cr - 22) * Math.cos(a)); g.stroke()
  }
  g.font = 'bold 26px Arial, sans-serif'; g.fillText('0', ccx, ccy - cr + 38)
  g.font = 'bold 40px Arial, sans-serif'; g.fillText('0.01 mm', cx, cy + 190)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  faceTex = t
  return t
}

/** travel: 측정축이 들어간 양(mm). travelRef가 있으면 매 프레임 그 값을 읽는다(디스크를 돌릴 때) */
export function DialGaugeModel({ travel = 0, travelRef, bezelDeg = 0, pose = 'v' }: { travel?: number; travelRef?: React.MutableRefObject<number>; bezelDeg?: number; pose?: 'v' | 'h' }) {
  const gltf = useGLTF(pose === 'h' ? DIAL_GAUGE_H_URL : DIAL_GAUGE_URL, false, true)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  const parts = useMemo(() => {
    const get = (n: string) => scene.getObjectByName(n) ?? null
    const spindle = get('Spindle')
    return { needle: get('Needle'), counter: get('CounterNeedle'), spindle, bezel: get('Bezel'), spindleRest: spindle ? spindle.position.y : 0 }
  }, [scene])
  // 눈금판 그림 평면을 베젤에 붙인다(앞 = -z, 흰 판 바로 앞)
  useLayoutEffect(() => {
    scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
    const b = parts.bezel
    if (!b || b.getObjectByName('DialFaceArt')) return
    const plane = new THREE.Mesh(new THREE.CircleGeometry(DIAL_GAUGE.faceR, 64), new THREE.MeshBasicMaterial({ map: dialFaceTexture(), transparent: true, depthWrite: false }))
    plane.name = 'DialFaceArt'
    plane.position.z = -0.00125
    plane.rotation.y = Math.PI
    b.add(plane)
  }, [scene, parts])
  const apply = (t: number) => {
    if (parts.needle) parts.needle.rotation.z = needleAngle(t)
    if (parts.counter) parts.counter.rotation.z = counterAngle(t)
    if (parts.spindle) parts.spindle.position.y = parts.spindleRest + t / 1000
  }
  useLayoutEffect(() => {
    if (!travelRef) apply(travel)
    if (parts.bezel) parts.bezel.rotation.z = (bezelDeg * Math.PI) / 180
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, travel, bezelDeg, travelRef])
  useFrame(() => { if (travelRef) apply(travelRef.current) })
  return <primitive object={scene} />
}
