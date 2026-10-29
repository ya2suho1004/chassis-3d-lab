// 공용 조작부 계기 화면(3D) 표시값. 과제 패널의 숫자식 계기와 같은 값을 붉은 점 표시창 글자로 바꾼다.
// 연출 전용: 판독 정답·기록과 무관하고, 할 일을 알려 주는 문구(예: "페달을 밟으세요")는 넣지 않는다(안내 없음 조건).

export interface PanelReadout {
  /** 축중(차량이 올라온 뒤), 없으면 null */
  axle: number | null
  /** 좌·우 제동력. 모터가 돌면 0부터, 페달을 밟으면 최대값까지 올라감. 모터가 멈춰 있고 측정 전이면 null */
  left: number | null
  right: number | null
  /** 최대값 고정 */
  hold: boolean
  unit: string
}

const num = (v: number | null, width = 4) => (v === null ? '-'.repeat(3) : String(Math.round(v))).padStart(width, ' ')

/** 표시창 세 줄: 축중 · 좌우 제동력 · 최대값 고정 */
export function readoutLines(r: PanelReadout): [string, string, string] {
  return [
    `AXLE ${num(r.axle)} ${r.unit}`,
    `L${num(r.left)}  R${num(r.right)}`,
    r.hold ? 'MAX HOLD' : '',
  ]
}
