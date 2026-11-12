// src/scene/feel/TapRing.tsx
// 누름 고리(설계 2026-11-12 §4.3). 고리 하나를 만들어 두고 누를 때마다 자리와 크기만 바꿔 다시 쓴다 —
// 실습장 장면은 학생이 걷는 동안 1초에 네 번쯤 다시 계산되므로, 여기서 무언가를 새로 만들면 태블릿이 버벅인다.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { advanceRing, ringAt, ringRunFrom, type TapPulse } from './tapPulse'

export function TapRing({ pulse }: { pulse: TapPulse | null }) {
  const mesh = useRef<THREE.Mesh>(null)
  // 흰색: 주황은 선택, 노랑은 가까이 있음, 파랑은 목적지라는 뜻을 이미 갖고 있다. 색 보정·깊이 기록에서 뺀다
  const parts = useMemo(() => ({
    geo: new THREE.RingGeometry(0.955, 1, 48),
    mat: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
  }), [])
  useEffect(() => () => { parts.geo.dispose(); parts.mat.dispose() }, [parts])
  // 진행 상태는 이 부품이 장면에 붙을 때 한 번 만든다. 그때의 누름 번호는 이미 지난 것으로 친다(ringRunFrom) —
  // 화면을 바꿨다 돌아오거나 품질을 바꿔 장면이 다시 붙어도, 누르지 않은 고리가 다시 뜨지 않는다
  const [run] = useState(() => ringRunFrom(pulse))
  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m) return
    const k = advanceRing(run, pulse, clock.elapsedTime)
    if (k === null || !pulse) { if (m.visible) m.visible = false; return }
    const a = ringAt(pulse.r, k)
    m.position.set(pulse.x, 0.016, pulse.z)
    m.scale.set(a.radius, a.radius, 1)
    parts.mat.opacity = a.opacity
    m.visible = true
  })
  return <mesh ref={mesh} name="tapRing" rotation-x={-Math.PI / 2} visible={false} geometry={parts.geo} material={parts.mat} renderOrder={3} />
}
