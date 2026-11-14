// 공간 채우기의 그림판 한 장(1024×768): 일반 안전·시설 표지, 시계 판, 게시판, 창 유리, 셔터 살, 실습 패널 앞면, 사물함 문.
// 글은 SIGN_TEXT의 일반 안전·시설 표지(설계 2026-11-14 §4 허용 목록)만 쓴다. 게시판 종이와 패널 앞면은 읽을 수 없는 줄·점뿐이고 계기에 숫자가 없다(정비 요령·기준 없음).
// 같은 칸 배치를 절반 크기로 줄인 빛나는 그림(비상구 유도등·창 유리만 밝다)을 함께 만든다. 처음 쓸 때 한 번 만들어 재사용한다.
import * as THREE from 'three'
import type { UvRect } from './partKit'

/** 그림판 크기(픽셀). 빛나는 그림은 가로·세로 GLOW_SCALE배 */
const AW = 1024, AH = 768, GLOW_SCALE = 0.5
/** 늘어나는 그림 크기(그림 메모리 추정용 — tests/spaceFill.test.ts) */
export const FILL_TEXTURES = [{ name: 'atlas', w: AW, h: AH }, { name: 'glow', w: AW * GLOW_SCALE, h: AH * GLOW_SCALE }] as const
/** 표지 글: 일반 안전·시설 표지만(학습 단서 없음). 그림판에 그리는 글은 이것뿐이다 */
export const SIGN_TEXT = { exit: '비상구', extinguisher: '소화기', goggles: '보안경 착용', tidy: '정리 정돈', safety: '안전제일' } as const
type Px = [number, number, number, number]
/** 칸 자리(그림판 픽셀: 왼쪽 위 x, y, 너비, 높이) */
const CELLS = {
  glass: [0, 0, 128, 256],
  shutter: [128, 0, 128, 256],
  panelA: [256, 0, 256, 160],
  panelB: [512, 0, 256, 160],
  board: [768, 0, 256, 176],
  exit: [0, 256, 256, 96],
  extSign: [256, 256, 96, 128],
  goggles: [352, 256, 128, 160],
  tidy: [480, 256, 128, 160],
  safety: [608, 256, 128, 160],
  clock: [736, 256, 128, 128],
  shock: [864, 256, 96, 88],
  extCab: [960, 256, 64, 112],
  cork: [0, 512, 256, 160],
  lockers: [256, 512, 256, 256],
  breaker: [512, 512, 128, 160],
  drawers: [640, 512, 128, 160],
  cabinet: [768, 512, 128, 160],
  doorLeaf: [896, 512, 64, 160],
} satisfies Record<string, Px>
export type AtlasCell = keyof typeof CELLS

export function atlasUv(cell: AtlasCell): UvRect {
  const [x, y, w, h] = CELLS[cell]
  // 그림판은 위아래를 뒤집어 올린다(three.js 기본): 그림 맨 위 줄이 v = 1
  return { u0: x / AW, u1: (x + w) / AW, v0: 1 - (y + h) / AH, v1: 1 - y / AH }
}

/** 결정적 의사 난수(매번 같은 무늬) */
function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }

function inCell(g: CanvasRenderingContext2D, cell: AtlasCell, draw: (w: number, h: number) => void) {
  const [x, y, w, h] = CELLS[cell]
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); draw(w, h); g.restore()
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
}

/** 사람 모양(달리는 자세) — 비상구 표지용. 크기 s, 가운데 아래 발 자리 (x, y) */
function runner(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.lineCap = 'round'; g.lineWidth = s * 0.13
  g.beginPath(); g.arc(x + s * 0.12, y - s * 0.92, s * 0.1, 0, Math.PI * 2); g.fill()
  g.beginPath(); g.moveTo(x + s * 0.06, y - s * 0.75); g.lineTo(x - s * 0.06, y - s * 0.4) // 몸
  g.moveTo(x - s * 0.06, y - s * 0.4); g.lineTo(x + s * 0.18, y - s * 0.18); g.lineTo(x + s * 0.12, y) // 앞다리
  g.moveTo(x - s * 0.06, y - s * 0.4); g.lineTo(x - s * 0.22, y - s * 0.2); g.lineTo(x - s * 0.38, y - s * 0.24) // 뒷다리
  g.moveTo(x + s * 0.04, y - s * 0.7); g.lineTo(x + s * 0.26, y - s * 0.55) // 앞팔
  g.moveTo(x + s * 0.04, y - s * 0.7); g.lineTo(x - s * 0.18, y - s * 0.62); g.lineTo(x - s * 0.26, y - s * 0.48) // 뒷팔
  g.stroke()
}

function drawColor(g: CanvasRenderingContext2D) {
  g.fillStyle = '#808080'; g.fillRect(0, 0, AW, AH)
  const r = rng(7)
  // 뿌연 유리: 위가 조금 밝은 띠 몇 줄과 옅은 얼룩
  inCell(g, 'glass', (w, h) => {
    for (let y = 0; y < h; y += 8) { const t = y / h; const c = Math.round(222 - t * 22); g.fillStyle = `rgb(${c - 6},${c},${c + 6})`; g.fillRect(0, y, w, 8) }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.06})`; g.fillRect(r() * w, r() * h, 10 + r() * 30, 4 + r() * 10) }
  })
  // 셔터 살: 가로 줄(살 하나 약 7.5 cm)
  inCell(g, 'shutter', (w, h) => {
    g.fillStyle = '#c4c8ca'; g.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 6.4) { g.fillStyle = '#9ea4a8'; g.fillRect(0, y + 4.4, w, 1.4); g.fillStyle = '#d8dcdd'; g.fillRect(0, y, w, 1.2) }
  })
  // 실습 패널 앞면: 읽을 수 없는 칸·둥근 계기(눈금만)·단자 점
  const panel = (cell: AtlasCell, seed: number) => inCell(g, cell, (w, h) => {
    const q = rng(seed)
    g.fillStyle = '#a9aeab'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#6c7570'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6)
    g.fillStyle = '#56636e'; g.fillRect(10, 10, w - 20, 16)
    for (let i = 0; i < 3; i++) {
      const cx = 40 + i * 72, cy = 62
      // 둥근 계기: 판을 패널 색에 가깝게, 테·바늘은 옅게(멀리서 튀지 않게, 숫자 없음)
      g.fillStyle = '#b4b6b0'; g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.fill()
      g.strokeStyle = '#7d8380'; g.lineWidth = 2; g.stroke()
      g.strokeStyle = '#7e5a54'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(-2 + q() * 1.4) * 17, cy + Math.sin(-2 + q() * 1.4) * 17); g.stroke()
    }
    g.strokeStyle = '#6e7772'; g.lineWidth = 2
    for (let i = 0; i < 4; i++) { const y = 100 + q() * 30; g.beginPath(); g.moveTo(14, y); g.lineTo(w - 14, y + (q() - 0.5) * 8); g.stroke() }
    const jacks = ['#b8483e', '#2f3437', '#c9a33a', '#3f6e9a']
    for (let i = 0; i < 12; i++) { g.fillStyle = jacks[i % 4]!; g.beginPath(); g.arc(22 + i * 19, h - 22, 5, 0, Math.PI * 2); g.fill() }
  })
  panel('panelA', 3); panel('panelB', 19)
  // 큰 배선 실습판: 칸 나눈 회색 판에 부품 상자와 선
  inCell(g, 'board', (w, h) => {
    const q = rng(41)
    g.fillStyle = '#a7aca8'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#6b746f'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4)
    for (let i = 0; i < 9; i++) { g.fillStyle = ['#6b7783', '#8a8f86', '#3e4549'][i % 3]!; g.fillRect(16 + (i % 3) * 80, 18 + Math.floor(i / 3) * 50, 40 + q() * 20, 22 + q() * 8) }
    g.strokeStyle = '#8b4b40'; g.lineWidth = 2
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(20 + q() * 200, 30 + q() * 120); g.lineTo(20 + q() * 200, 30 + q() * 120); g.stroke() }
  })
  // 비상구 유도등(초록 바탕, 흰 사람과 문)
  inCell(g, 'exit', (w, h) => {
    g.fillStyle = '#1f9a55'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#f4fff6'; g.fillRect(14, 12, 44, h - 24)
    g.fillStyle = '#1f9a55'; g.fillRect(20, 18, 32, h - 30)
    g.fillStyle = '#f4fff6'; g.strokeStyle = '#f4fff6'; runner(g, 92, h - 14, 66)
    g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(SIGN_TEXT.exit, 186, h / 2 + 2)
  })
  // 소화기 표지(빨강 바탕, 흰 소화기 모양 + 글)
  inCell(g, 'extSign', (w, h) => {
    g.fillStyle = '#c8322b'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#fff'; roundRect(g, 34, 22, 28, 62, 8); g.fill(); g.fillRect(42, 12, 12, 12); g.fillRect(50, 12, 22, 6)
    g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(SIGN_TEXT.extinguisher, w / 2, 106)
  })
  // 지시 표지(파랑 원 + 글), 안내 표지(초록)
  const notice = (cell: AtlasCell, ring: string, text: string, icon: (cx: number, cy: number) => void) => inCell(g, cell, (w, h) => {
    g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#3a3f44'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4)
    g.fillStyle = ring; g.beginPath(); g.arc(w / 2, 62, 44, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; icon(w / 2, 62)
    g.fillStyle = '#1d2226'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 134)
  })
  notice('goggles', '#1f5fa8', SIGN_TEXT.goggles, (cx, cy) => {
    g.lineWidth = 6; g.beginPath(); g.ellipse(cx - 15, cy, 13, 10, 0, 0, Math.PI * 2); g.stroke()
    g.beginPath(); g.ellipse(cx + 15, cy, 13, 10, 0, 0, Math.PI * 2); g.stroke()
    g.beginPath(); g.moveTo(cx - 28, cy - 2); g.lineTo(cx - 38, cy - 6); g.moveTo(cx + 28, cy - 2); g.lineTo(cx + 38, cy - 6); g.stroke()
  })
  notice('tidy', '#2a8a52', SIGN_TEXT.tidy, (cx, cy) => {
    for (let i = 0; i < 3; i++) g.fillRect(cx - 24, cy - 20 + i * 15, 48, 9)
  })
  notice('safety', '#2a8a52', SIGN_TEXT.safety, (cx, cy) => { g.fillRect(cx - 7, cy - 26, 14, 52); g.fillRect(cx - 26, cy - 7, 52, 14) })
  // 시계 판: 눈금과 바늘만(숫자 없음). 둘레는 투명(둥근 판)
  inCell(g, 'clock', (w, h) => {
    g.clearRect(0, 0, w, h)
    const cx = w / 2, cy = h / 2
    g.fillStyle = '#2b2f33'; g.beginPath(); g.arc(cx, cy, 63, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#f7f6f0'; g.beginPath(); g.arc(cx, cy, 56, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#2b2f33'
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.lineWidth = i % 3 === 0 ? 5 : 3; g.beginPath(); g.moveTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44); g.lineTo(cx + Math.cos(a) * 52, cy + Math.sin(a) * 52); g.stroke() }
    g.lineCap = 'round'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(-2.3) * 28, cy + Math.sin(-2.3) * 28); g.stroke()
    g.lineWidth = 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(-0.4) * 44, cy + Math.sin(-0.4) * 44); g.stroke()
    g.fillStyle = '#b8483e'; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill()
  })
  // 감전 주의(노란 세모, 번개 모양 — 글 없음). 둘레 투명
  inCell(g, 'shock', (w, h) => {
    g.clearRect(0, 0, w, h)
    g.fillStyle = '#1d1d1d'; g.beginPath(); g.moveTo(w / 2, 4); g.lineTo(w - 4, h - 4); g.lineTo(4, h - 4); g.closePath(); g.fill()
    g.fillStyle = '#f0c419'; g.beginPath(); g.moveTo(w / 2, 16); g.lineTo(w - 14, h - 10); g.lineTo(14, h - 10); g.closePath(); g.fill()
    g.fillStyle = '#1d1d1d'; g.beginPath(); g.moveTo(w / 2 + 4, 30); g.lineTo(w / 2 - 12, 56); g.lineTo(w / 2, 56); g.lineTo(w / 2 - 6, 76); g.lineTo(w / 2 + 12, 48); g.lineTo(w / 2, 48); g.closePath(); g.fill()
  })
  // 소화기함 앞면: 빨간 테 + 유리창 너머 소화기
  inCell(g, 'extCab', (w, h) => {
    g.fillStyle = '#b8302a'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#d9dcdc'; g.fillRect(8, 8, w - 16, h - 30)
    g.fillStyle = '#c23a30'; roundRect(g, 20, 22, 24, 54, 7); g.fill(); g.fillStyle = '#2b2b2b'; g.fillRect(28, 14, 8, 10)
    g.fillStyle = '#f2f2f2'; g.fillRect(14, h - 17, w - 28, 8)
  })
  // 게시판: 코르크 판에 읽을 수 없는 종이 다섯 장과 압정
  inCell(g, 'cork', (w, h) => {
    const q = rng(23)
    g.fillStyle = '#9f8460'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${q() < 0.5 ? '70,50,30' : '200,170,130'},0.25)`; g.fillRect(q() * w, q() * h, 2, 2) }
    g.strokeStyle = '#b9bcbc'; g.lineWidth = 8; g.strokeRect(0, 0, w, h)
    const sheets: Array<[number, number, number, number, string]> = [[18, 16, 46, 64, '#f4f2ea'], [74, 22, 46, 64, '#f6f3e6'], [134, 14, 64, 46, '#eef1f2'], [206, 20, 36, 52, '#f3e9c8'], [40, 92, 46, 60, '#f4f2ea'], [104, 90, 70, 48, '#f1f1ef'], [190, 86, 46, 62, '#e7eef3']]
    sheets.forEach(([x, y, sw, sh, c], i) => {
      g.fillStyle = 'rgba(40,30,20,0.25)'; g.fillRect(x + 2, y + 3, sw, sh)
      g.fillStyle = c; g.fillRect(x, y, sw, sh)
      g.fillStyle = 'rgba(80,90,100,0.45)'; g.fillRect(x + 5, y + 6, sw * 0.6, 4)
      for (let ly = y + 16; ly < y + sh - 6; ly += 6) g.fillRect(x + 5, ly, (sw - 10) * (0.5 + q() * 0.5), 2)
      g.fillStyle = ['#c0392b', '#2e6da4', '#2a8a52', '#c9a33a'][i % 4]!; g.beginPath(); g.arc(x + sw / 2, y + 4, 3.5, 0, Math.PI * 2); g.fill()
    })
  })
  // 사물함 문 네 칸(회백색 — 정점 색으로 물들인다): 숨구멍 줄, 손잡이, 이름표 자리(빈칸)
  inCell(g, 'lockers', (w, h) => {
    g.fillStyle = '#e4e6e6'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 4; i++) {
      const x = i * 64
      g.fillStyle = '#9ea2a3'; g.fillRect(x, 0, 2, h); g.fillRect(x + 62, 0, 2, h)
      for (let k = 0; k < 6; k++) { g.fillStyle = '#7d8183'; g.fillRect(x + 18, 14 + k * 7, 28, 3) }
      g.fillStyle = '#5d6163'; g.fillRect(x + 48, 118, 6, 26)
      g.fillStyle = '#f7f7f4'; g.fillRect(x + 16, 70, 32, 14); g.strokeStyle = '#9ea2a3'; g.lineWidth = 1; g.strokeRect(x + 16, 70, 32, 14)
    }
    g.fillStyle = '#9ea2a3'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3)
  })
  // 분전반 문(회색): 테두리·손잡이·빈 이름표
  inCell(g, 'breaker', (w, h) => {
    g.fillStyle = '#d4d6d4'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#8c908e'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12)
    g.fillStyle = '#6a6e6c'; g.fillRect(w - 26, h / 2 - 16, 8, 32)
    g.fillStyle = '#f2f2ee'; g.fillRect(24, 22, 60, 16)
  })
  // 공구함 서랍(회백 — 정점 색으로 물들인다)
  inCell(g, 'drawers', (w, h) => {
    g.fillStyle = '#e2e2e0'; g.fillRect(0, 0, w, h)
    const rows = [0, 18, 36, 54, 72, 96, 124, 160]
    for (let i = 0; i < rows.length - 1; i++) { const y = rows[i]!; g.fillStyle = '#8f9190'; g.fillRect(0, y, w, 2); g.fillStyle = '#b9bbba'; g.fillRect(24, y + 6, w - 48, 3) }
  })
  // 두 문짜리 장(회백 — 정점 색으로 물들인다)
  inCell(g, 'cabinet', (w, h) => {
    g.fillStyle = '#e2e2e0'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#8f9190'; g.fillRect(w / 2 - 1, 0, 2, h); g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3)
    g.fillStyle = '#6d6f6e'; g.fillRect(w / 2 - 10, h / 2 - 14, 4, 28); g.fillRect(w / 2 + 6, h / 2 - 14, 4, 28)
    for (let k = 0; k < 4; k++) { g.fillStyle = '#a9abaa'; g.fillRect(12, 12 + k * 6, w / 2 - 24, 2); g.fillRect(w / 2 + 12, 12 + k * 6, w / 2 - 24, 2) }
  })
  // 철문(회백 — 정점 색으로 물들인다): 위쪽 작은 창, 아래 발판
  inCell(g, 'doorLeaf', (w, h) => {
    g.fillStyle = '#e2e2e0'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#b5c3cc'; g.fillRect(16, 16, w - 32, 34); g.strokeStyle = '#7d8183'; g.lineWidth = 2; g.strokeRect(16, 16, w - 32, 34)
    g.fillStyle = '#a5a7a6'; g.fillRect(0, h - 18, w, 18)
  })
}

/** 빛나는 그림(색 그림의 GLOW_SCALE배 크기, 같은 칸 배치): 비상구 유도등은 밝게, 창 유리는 바깥 빛처럼 조금, 나머지는 검정 */
function drawGlow(g: CanvasRenderingContext2D, color: HTMLCanvasElement) {
  const k = GLOW_SCALE
  g.fillStyle = '#000'; g.fillRect(0, 0, AW * k, AH * k)
  const copy = (x: number, y: number, w: number, h: number, alpha: number) => { g.globalAlpha = alpha; g.drawImage(color, x, y, w, h, x * k, y * k, w * k, h * k); g.globalAlpha = 1 }
  copy(...CELLS.exit, 1)
  copy(...CELLS.glass, 0.55)
  const [dx, dy] = CELLS.doorLeaf
  copy(dx + 16, dy + 16, 32, 34, 0.35)
}

let made: { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } | null = null
/** 색 그림과 빛나는 그림(같은 칸 배치). 한 번 만들어 함께 쓴다 */
export function fillAtlas(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  if (made) return made
  const c = document.createElement('canvas'); c.width = AW; c.height = AH
  drawColor(c.getContext('2d')!)
  const e = document.createElement('canvas'); e.width = AW * GLOW_SCALE; e.height = AH * GLOW_SCALE
  drawGlow(e.getContext('2d')!, c)
  const tex = (cv: HTMLCanvasElement, anisotropy: number) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy; return t }
  made = { map: tex(c, 4), glow: tex(e, 1) }
  return made
}
