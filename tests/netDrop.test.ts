// Wi-Fi 끊김 점검(2026-11-03)에서 나온 두 가지: 끊겨서 실패한 AI 질문은 입력란에 되살리고, 교사 전송 결과는 할 일을 알려 준다
import { describe, expect, test } from 'vitest'
import { keepQuestionAfter } from '../src/chat/chatClient'
import { sendResultLabel } from '../src/delivery/sendLabel'

describe('AI 질문 — 인터넷이 끊겨 실패하면 쓴 질문을 되살린다', () => {
  test('다시 보내면 될 수 있는 실패만 되살린다(AI 꺼짐·횟수 다 씀은 다시 보내도 같으므로 되살리지 않음)', () => {
    expect(keepQuestionAfter({ ok: false, code: 'NETWORK', retryable: true })).toBe(true)
    expect(keepQuestionAfter({ ok: false, code: 'UPSTREAM_BUSY', retryable: true })).toBe(true)
    expect(keepQuestionAfter({ ok: false, code: 'CHAT_DISABLED', retryable: false })).toBe(false)
    expect(keepQuestionAfter({ ok: false, code: 'LIMIT_STUDENT', retryable: false, remaining: 0 })).toBe(false)
    expect(keepQuestionAfter({ ok: true, answer: 'a', remaining: 3, logged: true, masked: [], chatId: 'c', refused: false })).toBe(false)
  })
})

describe('교사 전송 결과 문구', () => {
  const r = (outcome: Parameters<typeof sendResultLabel>[0]['outcome'], code: string | null) => sendResultLabel({ recordId: 'abc', outcome, code })
  test('끊긴 채 보냈으면: 연결 안 됨, 기록은 기기에 그대로, 연결 뒤 강제 재전송', () => {
    const t = r('confirmationPending', 'NETWORK_ERROR')
    expect(t).toMatch(/인터넷 연결/); expect(t).toMatch(/이 기기에 그대로/); expect(t).toMatch(/강제 재전송/)
  })
  test('재시도 대기 시각 전이라 건너뛰었으면: 왜 건너뛰었는지와 강제 재전송을 알려 준다', () => {
    const t = r('skipped', 'RETRY_LATER')
    expect(t).toMatch(/재시도 대기/); expect(t).toMatch(/강제 재전송/)
  })
  test('그 밖에는 예전 문구 + 코드', () => {
    expect(r('acknowledged', null)).toBe('서버 접수 확인됨')
    expect(r('rejected', 'SESSION_NOT_ALLOWED')).toBe('거절(제출자료 확인 필요) (SESSION_NOT_ALLOWED)')
    expect(r('pending', 'RATE_LIMITED')).toBe('신규 접수 상한 도달 — 교사 설정 확인(자동 회복 없음) (RATE_LIMITED)')
  })
})
