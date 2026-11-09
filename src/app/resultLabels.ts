// 화면에 보이는 이름(Codex 교차 검토 2026-11-06 A2). 기록(payload)의 키·값은 바꾸지 않고 표시만 한글로 한다.

/** 답안 항목 */
export const ITEM_LABEL: Record<string, string> = {
  left: '좌 제동력', right: '우 제동력', axleWeight: '축중', deviation: '편차(%)', sum: '합(%)', vehicleCondition: '판정',
  leftAngle: '좌측 바퀴 조향각', rightAngle: '우측 바퀴 조향각', radius: '최소회전반경(m)',
}

/** 오류 유형(taskEngine countBlocked·submitResponse 키)과 안전 조건 */
const COUNT_LABEL: Record<string, string> = {
  order: '작업 순서', format: '입력 형식', reading: '판독값', calc: '계산', verdict: '판정',
  's-ppe': '보호구', 's-engine': '시동 OFF 확인', 's-lift': '리프트 주변 확인', 's-motor': '롤러 구동 전 확인', 's-accel': '가속 페달 조작', 's-exit': '차량 빼기 전 정지 확인',
}

const TIME_LABEL: Record<string, string> = { continuous: '끊김 없음', resumed: '중간에 이어서 함', uncertain: '시각 불확실' }

export const itemLabel = (id: string): string => ITEM_LABEL[id] ?? id
export const verdictLabel = (v: string | null): string => (v === 'pass' ? '양호' : v === 'fail' ? '불량' : v ?? '판정 불가')
export const timeQualityLabel = (q: string): string => TIME_LABEL[q] ?? q
export const countsText = (m: Record<string, number>): string => Object.entries(m).map(([k, v]) => `${COUNT_LABEL[k] ?? k} ${v}`).join(', ') || '없음'

/** 저장 시각(UTC ISO)을 한국 시각 'YYYY. M. D. HH:MM'으로. 학교 기기 시간대 설정과 관계없이 +9시간. 읽을 수 없으면 그대로 */
export function kstDateTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const k = new Date(t + 9 * 3600_000)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}. ${p2(k.getUTCHours())}:${p2(k.getUTCMinutes())}`
}
