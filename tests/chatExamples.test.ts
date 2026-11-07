// 질문 창 예시 질문이 과제에 맞는지(2026-11-07 시연 리허설)
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { chatExamples } from '../src/chat/chatClient'

describe('AI 교관 질문 창 예시', () => {
  it('최소회전반경 과제는 측정판·최소회전반경 예시, 제동력 낱말 없음', () => {
    const ex = chatExamples('min-turning-radius')
    expect(ex).toEqual(['측정판 눈금은 어떻게 읽어요?', '최소회전반경은 무엇을 재는 거예요?'])
    expect(ex.join(' ')).not.toMatch(/편차|롤러|제동/)
  })
  it('제동력 과제·과제 없음은 제동력 예시', () => {
    for (const id of [null, undefined, 'brake-force']) expect(chatExamples(id)).toEqual(['편차는 어떻게 계산해요?', '롤러에 차를 올릴 때 뭘 조심해요?'])
  })
  it('예시는 다음 단계·정답 숫자를 담지 않는다', () => {
    for (const q of [...chatExamples('min-turning-radius'), ...chatExamples(null)]) {
      expect(q).not.toMatch(/\d/)
      expect(q).not.toMatch(/다음|순서/)
    }
  })
  it('ChatPanel은 고정 예시 대신 chatExamples(taskId)를 쓴다', () => {
    const src = fs.readFileSync('src/chat/ChatPanel.tsx', 'utf8')
    expect(src).toContain('chatExamples(taskId)')
    expect(src).not.toContain('"편차는 어떻게 계산해요?"')
  })
})
