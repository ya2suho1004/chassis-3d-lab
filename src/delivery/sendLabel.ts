// 교사 화면 '전송 결과' 한 줄 — 상태와, 끊김·재시도 대기일 때는 교사가 할 일까지(Wi-Fi 끊김 점검 2026-11-03)
import type { OutboxItemResult } from './outbox'

const OUTCOME_LABEL: Record<OutboxItemResult['outcome'], string> = { acknowledged: '서버 접수 확인됨', rejected: '거절(제출자료 확인 필요)', conflict: '기록 충돌', pending: '대기(잠시 뒤 재시도)', confirmationPending: '접수 확인 필요(같은 ID로 재전송)', skipped: '건너뜀', saveFailed: '이 기기 저장 실패' }

export function sendResultLabel(r: OutboxItemResult): string {
  const code = r.code && r.outcome !== 'acknowledged' ? ` (${r.code})` : ''
  if (r.code === 'RATE_LIMITED') return `신규 접수 상한 도달 — 교사 설정 확인(자동 회복 없음)${code}`
  if (r.code === 'TIMEOUT') return `서버 응답이 없음(30초) — 기록은 이 기기에 그대로 있습니다. 잠시 뒤 ‘강제 재전송’을 누르세요${code}`
  if (r.code === 'NETWORK_ERROR') return `인터넷 연결 안 됨 — 기록은 이 기기에 그대로 있습니다. 연결된 뒤 ‘강제 재전송’을 누르세요${code}`
  if (r.outcome === 'skipped' && r.code === 'RETRY_LATER') return `재시도 대기 중이라 건너뜀 — 인터넷이 돌아왔으면 ‘강제 재전송’을 누르세요${code}`
  return `${OUTCOME_LABEL[r.outcome]}${code}`
}
