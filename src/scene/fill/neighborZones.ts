// 이웃 구역(건물 껍데기 안, 걸을 수 없는 곳) 채우기: 서쪽 "엔진 실습 구역", 남쪽 "전기 실습 구역".
// 자리는 배치 자료의 주 구역·ABS 구역과 건물 범위(hallBounds)에서 잰다. 모든 물건은 실습장 구역에서 0.5 m 넘게 떨어진다(바닥 그늘 자리로 검사할 수 있다).
// ABS 돌출 구역과 그 남쪽은 건드리지 않는다.
import type { SceneLayout } from '../layoutModel'
import type { HallBounds } from '../Surroundings'
import { NB, at, cabinet, chargerCart, drum, electricTrainer, engineCrane, engineStand, lockerBank, partition, shelfUnit, stool, toolCart, wiringBoard, workbench, type Kits } from './fillProps'

export interface PaintRect { xMin: number; xMax: number; zMin: number; zMax: number }
/** 이웃 구역 바닥 칠(색 면 + 노란 구획선) */
export interface ZonePaint { rect: PaintRect; color: string }

export const ZONE_PAINT = { engine: '#8d9699', electric: '#a1998b', line: '#c2a748', lineWidth: 0.1 } as const

/** 구역 바닥 칠 자리: 서쪽 엔진 구역, 남쪽 전기 구역(벽 쪽 0.9~1.0 m는 칠하지 않고 선반·장을 둔다) */
export function neighborZoneRects(b: HallBounds, layout: Pick<SceneLayout, 'mainZone' | 'absProtrusion'>): { engine: PaintRect; electric: PaintRect } {
  const mz = layout.mainZone
  const absX = layout.absProtrusion ? layout.absProtrusion.xMin : mz.xMax
  return {
    engine: { xMin: b.xMin + 1.0, xMax: mz.xMin - 0.8, zMin: mz.zMin + 0.9, zMax: mz.zMax - 0.5 },
    electric: { xMin: b.xMin + 1.0, xMax: absX - 0.75, zMin: mz.zMax + 0.8, zMax: mz.zMax + 9.8 },
  }
}

const HALF = Math.PI / 2

/** 이웃 구역 물건을 kits에 그리고 바닥 칠 자리를 돌려준다 */
export function buildNeighborZones(kits: Kits, b: HallBounds, layout: Pick<SceneLayout, 'mainZone' | 'absProtrusion'>): ZonePaint[] {
  const { engine: E, electric: L } = neighborZoneRects(b, layout)

  // ---- 서쪽 엔진 실습 구역 ----
  // 엔진 스탠드 두 줄 × 세 대(긴 옆면이 실습장 쪽을 본다)
  const colX = [E.xMin + 2.4, E.xMax - 2.6]
  const rowZ = [E.zMin + 1.9, E.zMin + 5.7, E.zMin + 9.5]
  const stands = [NB.standRed, NB.standBlue, NB.standGreen]
  const covers = ['#6e5a56', '#5a6672', '#6b6b5d']
  colX.forEach((x, ci) => rowZ.forEach((z, ri) => at(kits, x, z, HALF, () => engineStand(kits, stands[(ci + ri) % 3]!, covers[(ci * 2 + ri) % 3]!))))

  // ---- 남쪽 전기 실습 구역 ----
  // 실습대 세 줄 × 다섯 대(패널 앞면이 북쪽 = 실습장 쪽), 서쪽에는 큰 배선 실습판 두 줄 × 세 대
  const trX = [1.6, 4.1, 6.6, 9.1, 11.6].filter((x) => x + 0.8 < L.xMax)
  const trZ = [L.zMin + 1.5, L.zMin + 4.1, L.zMin + 6.7]
  trZ.forEach((z, ri) => trX.forEach((x, i) => at(kits, x, z, Math.PI, () => electricTrainer(kits, (i + ri) % 2 ? 'panelB' : 'panelA'))))
  const boX = [L.xMin + 1.8, L.xMin + 4.4, L.xMin + 7.0]
  const boZ = [L.zMin + 2.3, L.zMin + 5.7]
  boZ.forEach((z) => boX.forEach((x) => at(kits, x, z, Math.PI, () => wiringBoard(kits))))

  // 엔진 구역 소품: 공구함·부품 탁자·크레인·벽 작업대(기존 공구 정리판 아래)·북쪽 벽 선반·기름통
  at(kits, colX[0]! + 1.6, rowZ[0]!, HALF, () => toolCart(kits, NB.cartRed))
  at(kits, colX[0]! + 1.6, rowZ[2]!, HALF, () => toolCart(kits, NB.cartBlue))
  at(kits, colX[1]! + 1.5, rowZ[1]!, -HALF, () => toolCart(kits, NB.cartRed))
  at(kits, colX[0]! + 1.6, rowZ[1]!, HALF, () => workbench(kits, 1.2, 0.7, false))
  at(kits, E.xMin + 0.7, E.zMax - 1.0, 0, () => engineCrane(kits))
  at(kits, b.xMin + 0.43, (layout.mainZone.zMin + layout.mainZone.zMax) / 2 - 2, HALF, () => workbench(kits, 2.4, 0.7))
  ;[0, 1, 2].forEach((i) => at(kits, b.xMin + 1.4 + i * 1.3, b.zMin + 0.28, 0, () => shelfUnit(kits, 1.2, 0.45, 2.0, 5, 11 + i)))
  ;[0, 1].forEach((i) => at(kits, b.xMin + 0.4, E.zMax - 0.35 - i * 0.66, 0, () => drum(kits, i ? '#5f6c74' : '#6c6a5c')))

  // 전기 구역 소품: 의자(실습대·배선판 앞), 충전기 수레, 서쪽 벽 장·선반
  trZ.forEach((z) => trX.forEach((x, i) => at(kits, x + (i % 2 ? 0.25 : -0.2), z - 0.78, 0, () => stool(kits))))
  boZ.forEach((z) => boX.forEach((x, i) => at(kits, x + (i % 2 ? 0.4 : -0.3), z - 0.85, 0, () => stool(kits))))
  at(kits, L.xMax - 0.4, L.zMin + 0.4, -HALF, () => chargerCart(kits))
  at(kits, L.xMin + 8.4, L.zMax - 1.0, 0.3, () => chargerCart(kits))
  ;[0, 1, 2].forEach((i) => at(kits, b.xMin + 0.27, L.zMin + 0.7 + i * 1.05, HALF, () => cabinet(kits, 1.0, 1.85, NB.cabinet)))
  ;[0, 1].forEach((i) => at(kits, b.xMin + 0.25, L.zMin + 4.2 + i * 1.3, HALF, () => shelfUnit(kits, 1.2, 0.45, 2.0, 5, 31 + i)))

  // 뒤쪽 칸막이(높이 2.3 m — 1인칭 눈높이에서 너머의 빈 바닥을 가린다). 서쪽 끝은 열어 두어 휴식 코너가 보이게 한다
  const pz = L.zMax + 0.7, px0 = b.xMin + 4.4, px1 = L.xMax
  at(kits, (px0 + px1) / 2, pz, 0, () => partition(kits, px1 - px0, 2.3))
  // 칸막이 앞(북쪽 면): 사물함 여섯 줄(서쪽 셋·가운데 셋), 선반 둘, 장 둘
  const front = pz - 0.05 - 0.25
  ;[0, 1, 2].forEach((i) => at(kits, 1.2 + i * 1.62, front + 0.02, Math.PI, () => lockerBank(kits)))
  ;[0, 1].forEach((i) => at(kits, 6.3 + i * 1.3, front + 0.02, Math.PI, () => shelfUnit(kits, 1.2, 0.45, 2.0, 5, 51 + i)))
  ;[0, 1].forEach((i) => at(kits, 9.2 + i * 1.08, front - 0.03, Math.PI, () => cabinet(kits, 1.0, 1.85, NB.cabinet)))
  ;[0, 1, 2].forEach((i) => at(kits, -4.4 + i * 1.62, front + 0.02, Math.PI, () => lockerBank(kits)))
  return [{ rect: E, color: ZONE_PAINT.engine }, { rect: L, color: ZONE_PAINT.electric }]
}
