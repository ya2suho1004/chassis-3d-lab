// 회전반경 측정판 눈금(앞바퀴 아래 빨간 측정판 위). 연출·판독용 — 각도 값은 과제 사례에서 오고 기록과 무관.
// 바퀴 바깥쪽에 0°를 두고 앞뒤로 45°까지 1° 눈금(5°마다 긴 눈금, 10°마다 숫자). 바늘은 바퀴와 함께 돈다.
// 실제 장비 눈금판의 모양을 본뜬 것이 아니라(실측 아님) 읽기 쉽게 그린 것이다.
import { useMemo } from 'react'
import * as THREE from 'three'

/** 눈금 반지름(m): 타이어 반폭(약 0.11)보다 바깥, 측정판 반변(0.25)보다 안 */
const R_IN = 0.165, R_TICK = 0.2, R_NUM = 0.228, SIZE = 0.5
const PX = 1024

function dialTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const cv = document.createElement('canvas')
  cv.width = cv.height = PX
  const g = cv.getContext('2d')
  if (!g) return null
  const c = PX / 2, k = PX / SIZE
  // 바탕: 연노랑 부채꼴(−52°~52°)
  g.fillStyle = 'rgba(255,248,214,0.96)'
  g.beginPath(); g.arc(c, c, 0.247 * k, -52 * Math.PI / 180, 52 * Math.PI / 180); g.arc(c, c, 0.15 * k, 52 * Math.PI / 180, -52 * Math.PI / 180, true); g.closePath(); g.fill()
  g.strokeStyle = '#1b1b1b'; g.fillStyle = '#1b1b1b'; g.lineCap = 'butt'
  for (let a = -45; a <= 45; a++) {
    const t = (a * Math.PI) / 180
    const long = a % 5 === 0
    const r0 = (long ? R_IN : R_TICK - 0.018) * k, r1 = R_TICK * k
    g.lineWidth = long ? 5 : 2.5
    g.beginPath(); g.moveTo(c + r0 * Math.cos(t), c + r0 * Math.sin(t)); g.lineTo(c + r1 * Math.cos(t), c + r1 * Math.sin(t)); g.stroke()
    if (a % 10 === 0) {
      const x = c + R_NUM * k * Math.cos(t), y = c + R_NUM * k * Math.sin(t)
      g.save(); g.translate(x, y); g.rotate(t - Math.PI / 2) // 글자 위쪽이 중심(안쪽)을 향함 — 바퀴 바깥에 서서 보면 바로 읽힘
      g.font = 'bold 46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(String(Math.abs(a)), 0, 0); g.restore()
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * 한 바퀴의 눈금판. 위치는 바퀴 중심 바로 아래 측정판 윗면, outward = +1(모델 +x 쪽이 바깥) / −1.
 * angleRef: 현재 바퀴 조향각(rad, + = 왼쪽)을 매 프레임 읽는 바늘 그룹을 부모가 돌린다(pointerRef).
 */
export function TurntableDial({ x, z, outward, pointerRef }: { x: number; z: number; outward: 1 | -1; pointerRef: React.Ref<THREE.Group> }) {
  const tex = useMemo(dialTexture, [])
  return (
    <group position={[x, 0.066, z]}>{/* 측정판 손잡이(높이 약 0.06) 위로 — 0° 눈금을 가리지 않게 */}
      <group rotation-y={outward === 1 ? 0 : Math.PI}>
        {tex && (
          <mesh rotation-x={-Math.PI / 2} renderOrder={2}>
            <planeGeometry args={[SIZE, SIZE]} />
            <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        )}
      </group>
      {/* 바늘: 바퀴와 함께 도는 그룹 안에서 바깥 방향으로 */}
      <group ref={pointerRef}>
        <group rotation-y={outward === 1 ? 0 : Math.PI}>
          <mesh position={[(0.02 + R_TICK + 0.004) / 2, 0.004, 0]}>
            <boxGeometry args={[R_TICK + 0.004 - 0.02, 0.004, 0.008]} />
            <meshBasicMaterial color="#d50000" toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
