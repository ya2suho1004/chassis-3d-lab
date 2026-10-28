// 코드로 그리는 질감(외부 그림 파일 없음 → 라이선스 문제 없음, 용량 거의 0). 실습장 사진 14·27·28·3·21을 참고한 색·무늬.
// 모두 브라우저에서 처음 쓸 때 한 번 만들어 재사용한다.
import * as THREE from 'three'

const cache = new Map<string, THREE.Texture>()

function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1], srgb = true): THREE.Texture {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  draw(g)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = 4
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  cache.set(key, t)
  return t
}

/** 결정적 의사 난수(매번 같은 무늬) */
function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }

/** 초록 에폭시 바닥: 매끈한 광택 바탕에 아주 옅은 얼룩·긁힘 (사진 21·27) */
export function epoxyFloorTexture(repeat: [number, number]): THREE.Texture {
  return canvasTexture(`epoxy-${repeat.join('x')}`, 512, 512, (g) => {
    g.fillStyle = '#1e7d4b'; g.fillRect(0, 0, 512, 512)
    const r = rng(7)
    for (let i = 0; i < 140; i++) {
      const a = 0.012 + r() * 0.025
      g.fillStyle = r() < 0.6 ? `rgba(0,30,10,${a})` : `rgba(255,255,255,${a})`
      g.beginPath(); g.ellipse(r() * 512, r() * 512, 20 + r() * 90, 10 + r() * 40, r() * Math.PI, 0, Math.PI * 2); g.fill()
    }
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1
    for (let i = 0; i < 25; i++) { const x = r() * 512, y = r() * 512; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 12); g.stroke() }
  }, repeat)
}

/** 줄무늬(체크) 철판: 마름모 돌기 (사진 27 왼쪽 아래, 3 리프트 발판) */
export function checkerPlateTexture(base: string, repeat: [number, number]): THREE.Texture {
  return canvasTexture(`checker-${base}-${repeat.join('x')}`, 256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256)
    const step = 32
    for (let y = 0; y < 256; y += step) for (let x = 0; x < 256; x += step) {
      const odd = ((x + y) / step) % 2 === 0
      g.save(); g.translate(x + step / 2, y + step / 2); g.rotate(odd ? Math.PI / 4 : -Math.PI / 4)
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(-11, -3, 22, 6)
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(-11, 2, 22, 2)
      g.restore()
    }
  }, repeat)
}

/** 고무 롤러 표면: 축 방향 홈 (사진 27) */
export function rollerTexture(): THREE.Texture {
  return canvasTexture('roller', 256, 64, (g) => {
    g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, 256, 64)
    for (let x = 0; x < 256; x += 16) { g.fillStyle = '#0a0a0a'; g.fillRect(x, 0, 5, 64); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 6, 0, 2, 64) }
  }, [3, 1])
}

/** 노란 ABS TESTER 앞면: 검은 점 표시창 + 버튼 7개 이름 (사진 14) */
export function absTesterFaceTexture(): THREE.Texture {
  return canvasTexture('abs-face', 512, 288, (g) => {
    g.fillStyle = '#f2d21b'; g.fillRect(0, 0, 512, 288)
    g.strokeStyle = '#6b5a00'; g.lineWidth = 2; g.strokeRect(10, 10, 492, 268)
    g.fillStyle = '#1a1a1a'; g.font = 'bold 22px serif'; g.textAlign = 'center'; g.fillText('ABS TESTER', 220, 42)
    g.fillStyle = '#121212'; g.fillRect(60, 64, 300, 160)
    for (let y = 70; y < 220; y += 6) for (let x = 66; x < 356; x += 6) { g.fillStyle = 'rgba(255,80,60,0.18)'; g.fillRect(x, y, 2, 2) }
    const labels = ['ESC', 'SIDE SLIP', 'BRAKE', 'SPEED', 'AXLE Load', 'LIFT UpDn', 'MOTOR']
    g.textAlign = 'left'; g.font = '13px sans-serif'
    labels.forEach((l, i) => {
      const y = 78 + i * 24
      g.fillStyle = '#cfcfcf'; g.beginPath(); g.arc(395, y, 7, 0, Math.PI * 2); g.fill()
      g.strokeStyle = '#555'; g.lineWidth = 1.5; g.stroke()
      g.fillStyle = '#222'; g.fillText(l, 410, y + 4)
    })
    g.font = 'bold 18px serif'; g.fillStyle = '#1a1a1a'; g.textAlign = 'center'; g.fillText('GS-17GA', 420, 258)
  })
}

/** 올리브색 캐비닛 아래 명판 (사진 14) */
export function cabinetPlateTexture(): THREE.Texture {
  return canvasTexture('cabinet-plate', 256, 96, (g) => {
    g.fillStyle = '#1d1d1d'; g.fillRect(0, 0, 256, 96)
    g.strokeStyle = '#ddd'; g.lineWidth = 2; g.strokeRect(14, 24, 120, 44)
    g.fillStyle = '#eee'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillText('DKM-6000', 74, 56)
  })
}

/** 나무 상판 결 (사진 27 책상, 21 작업대) */
export function woodTexture(tone: 'light' | 'dark'): THREE.Texture {
  return canvasTexture(`wood-${tone}`, 256, 256, (g) => {
    g.fillStyle = tone === 'light' ? '#d6b386' : '#6e4426'; g.fillRect(0, 0, 256, 256)
    const r = rng(tone === 'light' ? 3 : 11)
    for (let y = 0; y < 256; y += 3) { g.fillStyle = `rgba(${tone === 'light' ? '120,80,40' : '30,15,5'},${0.05 + r() * 0.1})`; g.fillRect(0, y, 256, 1 + r() * 2) }
  })
}

/** 안전 표지(벽): "위험 뛰지말것" (사진 28) */
export function dangerSignTexture(): THREE.Texture {
  return canvasTexture('danger-sign', 256, 320, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 320)
    g.strokeStyle = '#1f3c8a'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 312)
    g.fillStyle = '#d32f2f'; g.beginPath(); g.ellipse(128, 70, 90, 40, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#fff'; g.font = 'bold 42px sans-serif'; g.textAlign = 'center'; g.fillText('위험', 128, 86)
    g.fillStyle = '#111'; g.font = 'bold 58px sans-serif'; g.fillText('뛰지말것', 128, 220)
  })
}
