// src/scene/feel/TapRing.tsx
// 누름 고리(설계 2026-11-12 §4.3). 고리 하나를 만들어 두고 누를 때마다 자리와 크기만 바꿔 다시 쓴다 —
// 실습장 장면은 학생이 걷는 동안 1초에 네 번쯤 다시 계산되므로, 여기서 무언가를 새로 만들면 태블릿이 버벅인다.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ringAt, TAP_RING_SECONDS, type TapPulse } from './tapPulse'

export function TapRing({ pulse }: { pulse: TapPulse | null }) {
  const mesh = useRef<THREE.Mesh>(null)
  // 흰색: 주황은 선택, 노랑은 가까이 있음, 파랑은 목적지라는 뜻을 이미 갖고 있다. 색 보정·깊이 기록에서 뺀다
  const parts = useMemo(() => ({
    geo: new THREE.RingGeometry(0.955, 1, 48),
    mat: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
  }), [])
  useEffect(() => () => { parts.geo.dispose(); parts.mat.dispose() }, [parts])
  /** 시작 시각(초). null이면 쉬는 중, 음수면 다음 화면에서 시작 */
  const startedAt = useRef<number | null>(null)
  const seq = pulse?.seq ?? 0
  useEffect(() => { if (seq > 0) startedAt.current = -1 }, [seq])
  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m || !pulse || startedAt.current === null) return
    if (startedAt.current < 0) {
      startedAt.current = clock.elapsedTime
      m.position.set(pulse.x, 0.016, pulse.z)
      m.visible = true
    }
    const k = (clock.elapsedTime - startedAt.current) / TAP_RING_SECONDS
    if (k >= 1) { m.visible = false; startedAt.current = null; return }
    const a = ringAt(pulse.r, k)
    m.scale.set(a.radius, a.radius, 1)
    parts.mat.opacity = a.opacity
  })
  return <mesh ref={mesh} name="tapRing" rotation-x={-Math.PI / 2} visible={false} geometry={parts.geo} material={parts.mat} renderOrder={3} />
}
