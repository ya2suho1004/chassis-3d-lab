// 공간 채우기 소품 모양(코드 도형). 각 함수는 지역 좌표(바닥 가운데 = 원점, 앞면 = 지역 +z)에 그리고, 놓을 자리는 부르는 쪽이 kit.at으로 정한다.
// 이웃 구역 소품은 실습장 안 과제 장비보다 채도·명도를 낮춘 색(NB)만 쓴다 — 누를 수 있는 장비로 보이지 않게.
// 치수는 일반적인 정비 실습장 물건의 대략값(가정, 실측 아님). 상표·글자 없음.
import { atlasUv, type AtlasCell } from './fillAtlas'
import type { PartKit } from './partKit'

/** 이웃 구역 색(낮은 채도·명도) */
export const NB = {
  iron: '#767b7c', ironDark: '#575c5f', alu: '#9b9e9b', pan: '#4b4f52', rust: '#6e625a',
  standRed: '#85605a', standBlue: '#5e6b77', standGreen: '#66746a',
  crane: '#978b63', steel: '#7c8387', steelDark: '#555b60', rubber: '#2f3336',
  benchTop: '#8d8a80', wood: '#8a7861', cartRed: '#8a5a54', cartBlue: '#5f6d7a',
  trainerFrame: '#6d767d', trainerTop: '#8e9089', trainerBoard: '#49525a',
  seat: '#3f4448', partition: '#b5b8b2', partitionLow: '#8f9493', locker: '#8f9ba3', cabinet: '#8b958f',
  box: ['#a08b6b', '#8f7f66', '#6c7b86', '#7f8a6c', '#9a9a92', '#7b6f63'],
} as const

export interface Kits { solid: PartKit; decal: PartKit }

/** 두 kit(덩어리·그림 판)에 같은 지역 좌표계를 함께 연다 */
export function at(kits: Kits, x: number, z: number, rotY: number, fn: () => void): void {
  kits.solid.at(x, z, rotY, () => kits.decal.at(x, z, rotY, fn))
}

/** 결정적 의사 난수(매번 같은 배치) */
export function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }

/** 엔진 스탠드에 올린 엔진(길이 축 = 지역 x). 바닥 약 1.1 × 0.9 m, 높이 약 1.4 m */
export function engineStand({ solid: k }: Kits, stand: string, cover: string): void {
  k.foot(1.15, 0.95, 0.42, 0.05, 0)
  // 스탠드: 기둥·팔·물림판, 바닥 T자 다리와 바퀴
  k.block(0.08, 0.98, 0.08, [-0.58, 0.05, 0], stand)
  k.box(0.22, 0.07, 0.07, [-0.47, 0.92, 0], stand)
  k.cyl(0.2, 0.04, [-0.36, 0.92, 0], stand, 'x', 12)
  k.block(0.08, 0.06, 0.95, [-0.58, 0.02, 0], stand)
  k.block(1.0, 0.06, 0.08, [-0.1, 0.02, 0], stand)
  for (const [x, z] of [[-0.58, 0.44], [-0.58, -0.44], [0.38, 0]] as const) k.cyl(0.035, 0.03, [x, 0.035, z], NB.rubber, 'z', 8)
  // 엔진: 블록·헤드·덮개·기름통·흡기·배기·풀리
  k.box(0.62, 0.42, 0.46, [0.0, 0.92, 0], NB.iron)
  k.box(0.6, 0.14, 0.4, [0.0, 1.2, 0], NB.alu)
  k.box(0.56, 0.08, 0.3, [0.0, 1.31, 0], cover)
  k.box(0.5, 0.15, 0.34, [0.02, 0.64, 0], NB.pan)
  k.box(0.52, 0.1, 0.12, [0.0, 1.16, 0.27], NB.alu)
  for (let i = 0; i < 4; i++) k.box(0.05, 0.12, 0.08, [-0.2 + i * 0.13, 1.08, 0.3], NB.alu)
  k.box(0.5, 0.08, 0.1, [0.0, 1.06, -0.27], NB.rust)
  k.cyl(0.1, 0.05, [0.34, 0.8, 0], NB.ironDark, 'x', 12)
  k.cyl(0.065, 0.05, [0.34, 1.08, 0.1], NB.ironDark, 'x', 10)
  k.cyl(0.05, 0.05, [0.34, 1.02, -0.12], NB.ironDark, 'x', 10)
  // 기름 받이
  k.block(0.62, 0.03, 0.46, [0.02, 0, 0], '#3c4043')
}

/** 엔진 크레인(접이식): 다리 = 지역 +x 쪽, 붐도 +x로. 바닥 약 1.4 × 0.85 m, 높이 약 1.9 m */
export function engineCrane({ solid: k }: Kits): void {
  k.foot(1.45, 0.9, 0.35, 0.5, 0)
  const c = NB.crane
  k.block(0.1, 0.08, 0.86, [-0.15, 0.04, 0], c)
  for (const z of [-0.36, 0.36]) {
    k.block(1.3, 0.07, 0.07, [0.5, 0.04, z], c)
    k.cyl(0.04, 0.035, [1.12, 0.04, z], NB.rubber, 'z', 8)
    k.cyl(0.04, 0.035, [-0.15, 0.04, z], NB.rubber, 'z', 8)
  }
  k.block(0.1, 1.5, 0.1, [-0.1, 0.12, 0], c)
  // 붐(조금 들어 올림)과 유압 실린더
  k.box(1.35, 0.09, 0.09, [0.45, 1.68, 0], c, { rotZ: 0.18 })
  k.box(0.07, 0.95, 0.07, [0.18, 1.12, 0], NB.steelDark, { rotZ: -0.42 })
  k.box(0.02, 0.38, 0.02, [1.08, 1.6, 0], NB.steelDark)
  k.box(0.08, 0.06, 0.03, [1.08, 1.39, 0], NB.steelDark)
  k.box(0.04, 0.5, 0.04, [-0.22, 0.95, 0], NB.steelDark, { rotZ: 0.5 })
}

/** 바퀴 달린 공구함(서랍 앞면 = 지역 +z). 0.7 × 0.46 × 0.95 m */
export function toolCart({ solid: k, decal: t }: Kits, color: string): void {
  k.foot(0.72, 0.5, 0.42)
  k.block(0.68, 0.84, 0.46, [0, 0.1, 0], color)
  k.block(0.72, 0.03, 0.5, [0, 0.94, 0], NB.steelDark)
  k.box(0.04, 0.04, 0.5, [0.38, 0.86, 0], NB.steelDark)
  for (const [x, z] of [[-0.28, -0.18], [0.28, -0.18], [-0.28, 0.18], [0.28, 0.18]] as const) k.cyl(0.045, 0.04, [x, 0.05, z], NB.rubber, 'z', 8)
  t.quad(0.62, 0.78, [0, 0.52, 0.232], atlasUv('drawers'), undefined, color)
}

/** 작업대(앞 = 지역 +z): 철 다리, 상판, 아래 선반. 바이스 하나 */
export function workbench({ solid: k }: Kits, w: number, d: number, vise = true): void {
  k.foot(w, d, 0.4)
  const h = 0.9
  k.block(w, 0.05, d, [0, h - 0.05, 0], NB.benchTop)
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.block(0.05, h - 0.05, 0.05, [x * (w / 2 - 0.04), 0, z * (d / 2 - 0.04)], NB.steel)
  k.block(w - 0.06, 0.03, d - 0.06, [0, 0.18, 0], NB.steelDark)
  k.block(w - 0.1, 0.06, 0.04, [0, h - 0.13, d / 2 - 0.04], NB.steel)
  if (vise) { k.block(0.2, 0.12, 0.16, [-w / 2 + 0.25, h, d / 2 - 0.12], NB.standBlue); k.box(0.03, 0.03, 0.18, [-w / 2 + 0.25, h + 0.06, d / 2 + 0.02], NB.steelDark) }
}

/** 철 선반(앞 = 지역 +z). 칸마다 상자를 조금씩 다르게 놓는다 */
export function shelfUnit({ solid: k }: Kits, w: number, d: number, h: number, levels: number, seed: number): void {
  k.foot(w, d, 0.3)
  const r = rng(seed)
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.block(0.04, h, 0.04, [x * (w / 2 - 0.02), 0, z * (d / 2 - 0.02)], NB.steel)
  for (let i = 0; i < levels; i++) {
    const y = 0.08 + (i * (h - 0.2)) / (levels - 1)
    k.block(w, 0.03, d, [0, y, 0], NB.steelDark)
    if (i === levels - 1) continue
    let x = -w / 2 + 0.06
    const room = (h - 0.2) / (levels - 1) - 0.08
    while (x < w / 2 - 0.2) {
      const bw = 0.18 + r() * 0.3, bh = room * (0.45 + r() * 0.5), bd = d * (0.6 + r() * 0.3)
      if (x + bw > w / 2 - 0.04) break
      if (r() > 0.15) k.block(bw, bh, bd, [x + bw / 2, y + 0.03, (d - bd) / 2 - 0.02], NB.box[Math.floor(r() * NB.box.length)]!)
      x += bw + 0.03 + r() * 0.06
    }
  }
}

/** 전기 실습대: 탁자 위에 세운 실습 패널(앞 = 지역 +z — 학생이 앉는 쪽). 1.6 × 0.75 m, 패널 꼭대기 약 1.8 m */
export function electricTrainer({ solid: k, decal: t }: Kits, face: AtlasCell): void {
  k.foot(1.6, 0.75, 0.38)
  const h = 0.78
  k.block(1.6, 0.04, 0.75, [0, h - 0.04, 0], NB.trainerTop)
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.block(0.05, h - 0.04, 0.05, [x * 0.76, 0, z * 0.33], NB.trainerFrame)
  k.block(1.5, 0.03, 0.62, [0, 0.16, 0], NB.trainerFrame)
  // 패널: 기둥 둘 + 판(조금 뒤로 기울임) + 앞면 그림
  for (const x of [-0.74, 0.74]) k.block(0.05, 1.0, 0.05, [x, h, -0.2], NB.trainerFrame)
  k.box(1.5, 0.9, 0.04, [0, h + 0.55, -0.2], NB.trainerBoard, { rotX: -0.12 })
  t.quad(1.42, 0.82, [0, h + 0.55, -0.177], atlasUv(face), { rotX: -0.12 })
  k.block(0.36, 0.14, 0.24, [0.5, h, 0.12], NB.steelDark)
}

/** 큰 배선 실습판(바퀴 달린 A자 다리, 앞 = 지역 +z). 폭 2.0, 높이 약 1.9 m */
export function wiringBoard({ solid: k, decal: t }: Kits): void {
  k.foot(2.1, 0.7, 0.32)
  for (const x of [-0.95, 0.95]) {
    k.block(0.06, 1.85, 0.06, [x, 0.06, 0], NB.trainerFrame)
    k.block(0.06, 0.05, 0.7, [x, 0.03, 0], NB.trainerFrame)
    for (const z of [-0.3, 0.3]) k.cyl(0.035, 0.03, [x, 0.035, z], NB.rubber, 'x', 8)
  }
  k.box(2.0, 1.25, 0.04, [0, 1.25, 0], NB.trainerBoard)
  t.quad(1.92, 1.17, [0, 1.25, 0.022], atlasUv('board'))
  k.block(1.9, 0.04, 0.22, [0, 0.62, 0.08], NB.trainerTop)
}

/** 등받이 없는 둥근 의자 */
export function stool({ solid: k }: Kits): void {
  k.foot(0.4, 0.4, 0.3)
  k.cyl(0.17, 0.05, [0, 0.6, 0], NB.seat, 'y', 12)
  k.cyl(0.025, 0.55, [0, 0.31, 0], NB.steel, 'y', 6)
  k.cyl(0.2, 0.03, [0, 0.03, 0], NB.steelDark, 'y', 10)
}

/** 충전기 수레(손잡이 = 지역 -x) */
export function chargerCart({ solid: k }: Kits): void {
  k.foot(0.7, 0.5, 0.38)
  k.block(0.6, 0.03, 0.42, [0, 0.15, 0], NB.steelDark)
  k.block(0.6, 0.03, 0.42, [0, 0.62, 0], NB.steelDark)
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.block(0.03, 0.5, 0.03, [x * 0.28, 0.12, z * 0.19], NB.steel)
  k.block(0.42, 0.34, 0.3, [0.04, 0.65, 0], NB.cartBlue)
  k.box(0.18, 0.08, 0.01, [0.04, 0.9, 0.152], '#3a4a40')
  k.block(0.03, 0.42, 0.42, [-0.32, 0.62, 0], NB.steel)
  for (const [x, z] of [[-0.24, -0.16], [0.24, -0.16], [-0.24, 0.16], [0.24, 0.16]] as const) k.cyl(0.05, 0.04, [x, 0.05, z], NB.rubber, 'z', 8)
  k.block(0.22, 0.18, 0.16, [0.1, 0.18, 0], '#3f4447')
}

/** 사물함 네 칸 한 줄(앞 = 지역 +z). 1.6 × 0.45 × 1.8 m */
export function lockerBank({ solid: k, decal: t }: Kits): void {
  k.foot(1.6, 0.45, 0.3)
  k.block(1.6, 1.8, 0.45, [0, 0.08, 0], NB.locker)
  k.block(1.6, 0.08, 0.4, [0, 0, -0.02], NB.steelDark)
  t.quad(1.58, 1.76, [0, 0.98, 0.228], atlasUv('lockers'), undefined, NB.locker)
}

/** 두 문짜리 장(앞 = 지역 +z) */
export function cabinet({ solid: k, decal: t }: Kits, w: number, h: number, color: string): void {
  k.foot(w, 0.5, 0.3)
  k.block(w, h, 0.5, [0, 0, 0], color)
  t.quad(w - 0.04, h - 0.1, [0, h / 2 + 0.03, 0.253], atlasUv('cabinet'), undefined, color)
}

/** 기름통(드럼) */
export function drum({ solid: k }: Kits, color: string): void {
  k.foot(0.6, 0.6, 0.35)
  k.cyl(0.29, 0.88, [0, 0.44, 0], color, 'y', 14)
  for (const y of [0.3, 0.6]) k.cyl(0.3, 0.03, [0, y, 0], color, 'y', 14)
}

/** 칸막이 벽 한 줄(길이 = 지역 x, 두께 0.08, 높이 h): 기둥 간격 1.2 m, 아래 띠 진하게 */
export function partition({ solid: k }: Kits, len: number, h: number): void {
  k.foot(len, 0.14, 0.25)
  k.block(len, 0.12, 0.09, [0, 0, 0], NB.partitionLow)
  k.block(len, h - 0.2, 0.06, [0, 0.12, 0], NB.partition)
  k.block(len, 0.08, 0.09, [0, h - 0.08, 0], NB.steel)
  const n = Math.round(len / 1.2)
  for (let i = 0; i <= n; i++) k.block(0.05, h - 0.1, 0.09, [-len / 2 + (i * len) / n, 0.02, 0], NB.steel)
}
