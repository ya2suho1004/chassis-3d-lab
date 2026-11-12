// 화면 품질 고르기: 주소의 ?q=high|low가 있으면 그것(시험·시연용), 없으면 터치 기기는 낮음·그 밖은 높음으로 시작.
// 자동 낮춤: 사용자가 직접 고르지 않았고 높음인데 처음 4초 평균이 30 fps 미만이면 한 번만 낮춘다(올리지는 않음 — 태블릿 내려받기 보호).

export type QualityPick = { low: boolean; locked: boolean }

export function initialQuality(search: string, coarsePointer: boolean): QualityPick {
  const q = new URLSearchParams(search).get('q')
  if (q === 'high') return { low: false, locked: true }
  if (q === 'low') return { low: true, locked: true }
  return { low: coarsePointer, locked: false }
}

export const AUTO_LOW_FPS = 30

export function shouldAutoLower(p: { low: boolean; locked: boolean; userChose: boolean; fps: number }): boolean {
  return !p.low && !p.locked && !p.userChose && p.fps < AUTO_LOW_FPS
}

/** 주소의 ?aa=1: 품질 낮음에서도 계단 줄이기(안티에일리어싱)를 켠다. 학교 태블릿에서 켠 것과 끈 것을 비교하려는 것이고 기본은 끔(설계 2026-11-11 §4.11) */
export function antialiasRequested(search: string): boolean {
  return new URLSearchParams(search).get('aa') === '1'
}
