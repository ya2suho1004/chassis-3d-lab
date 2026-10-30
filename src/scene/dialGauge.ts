// 다이얼 게이지 계산(0.01 mm 눈금, 큰 바늘 1바퀴 = 1 mm = 100눈금, 회전계 바늘 1칸 = 1 mm).
// 측정축이 밀려 들어간 양(mm)이 바늘 각도가 된다. 베젤을 돌리면 눈금판 0의 자리만 바뀐다(바늘은 그대로).
// 런아웃 = 한 바퀴 돌리는 동안 읽은 값의 최대 − 최소(전체 흔들림, TIR). 백래시 = 흔들 때 바늘이 오간 폭.

export const DIAL = {
  /** 눈금 1칸(mm) */
  division: 0.01,
  /** 큰 바늘 1바퀴(mm) */
  perRev: 1,
  /** 측정 범위(mm) */
  range: 10,
} as const

/** 큰 바늘 각도(rad, 앞에서 볼 때 시계 방향 +). 0 = 12시 */
export function needleAngle(travelMm: number): number {
  return (2 * Math.PI * travelMm) / DIAL.perRev
}

/** 회전계 바늘 각도(rad): 1 mm마다 1칸(10칸 = 1바퀴) */
export function counterAngle(travelMm: number): number {
  return (2 * Math.PI * travelMm) / (DIAL.perRev * 10)
}

/** 베젤을 bezelDiv 칸 돌려 0을 맞춘 뒤 큰 바늘이 가리키는 눈금(0~99.x, 0.01 mm 단위) */
export function dialDivision(travelMm: number, bezelDiv = 0): number {
  const div = (travelMm / DIAL.division - bezelDiv) % 100
  return div < 0 ? div + 100 : div
}

/** 영점(측정 시작) 뒤 읽음값(mm, 0.01 단위로 반올림) */
export function reading(travelMm: number, zeroMm: number): number {
  return Math.round((travelMm - zeroMm) / DIAL.division) * DIAL.division
}

/** 런아웃(TIR) = 최대 − 최소. 값이 없으면 null */
export function runout(readingsMm: number[]): number | null {
  if (!readingsMm.length) return null
  return Math.round((Math.max(...readingsMm) - Math.min(...readingsMm)) / DIAL.division) * DIAL.division
}

/**
 * 연습용 디스크 면 흔들림 모형: 디스크를 angle(rad)만큼 돌렸을 때 측정축 위치(mm).
 * preload = 미리 눌러 둔 양, tir = 전체 흔들림(최대−최소), phase = 가장 높은 곳 각도. (실측 아님 — 과제 값은 교사 확인 뒤 정한다)
 */
export function discTravel(angle: number, preload: number, tir: number, phase = 0): number {
  return preload + (tir / 2) * (1 + Math.cos(angle - phase))
}
