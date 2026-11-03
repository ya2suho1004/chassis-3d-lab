// AI 교관: 최소회전반경 과제 문맥(기준·순서만, 사례 값 없음)과 요청의 taskId
import { describe, expect, it } from 'vitest'
import context from '../supabase/functions/_shared/chat/taskContext.generated.json'
import { buildSystemPrompt } from '../supabase/functions/_shared/chat/prompt'
import { parseChatRequest } from '../supabase/functions/_shared/chat/chatCore'
import { buildChatBody } from '../src/chat/chatClient'

const base = { protocolVersion: 'chat-1', sessionCode: 'DEMO-ONLY', anonymousStudentCode: 'D-01', recordId: null, stepId: 'read', difficultyMode: 'unguided', question: '바깥쪽 바퀴가 뭐예요?', history: [], turnIndex: 0 }

describe('최소회전반경 AI 교관 문맥', () => {
  it('문맥에는 기준 12 m·자릿수·8단계만 있고 사례 각도·축거·정답은 없다', () => {
    const t = (context as any).turning
    expect(t.ruleset).toEqual({ radiusMaxM: 12, decisionPrecision: { digits: 1 } })
    expect(t.steps.map((s: any) => s.stepId)).toEqual(['ppe', 'engineOff', 'turntable', 'direction', 'steer', 'read', 'return', 'record'])
    const raw = JSON.stringify(t)
    for (const leak of ['35', '36', '32', '2.7', '5.5', '5.1', 'leftAngleDeg', 'turnDirection']) expect(raw).not.toContain(leak)
  })
  it('taskId가 min-turning-radius면 최소회전반경 프롬프트, 없으면 제동력 프롬프트', () => {
    const turning = buildSystemPrompt(context as any, { mode: 'unguided', stepId: 'read', taskId: 'min-turning-radius' })
    expect(turning).toContain('최소회전반경')
    expect(turning).toContain('12 m 이하')
    expect(turning).toContain('바깥쪽 앞바퀴')
    expect(turning).not.toContain('편차')
    expect(turning).toContain('좌·우 바퀴 측정판의 최대 조향각')   // 현재 단계
    const brake = buildSystemPrompt(context as any, { mode: 'unguided', stepId: null })
    expect(brake).toContain('편차')
    expect(brake).not.toContain('최소회전반경')
  })
  it('요청: taskId 없음·null·두 과제는 받고, 다른 값은 거절', () => {
    const req = (extra: object) => parseChatRequest('text/plain', JSON.stringify({ ...base, ...extra }))
    expect(req({})).not.toBeNull()
    expect(req({ taskId: null })).not.toBeNull()
    expect(req({ taskId: 'min-turning-radius' })?.taskId).toBe('min-turning-radius')
    expect(req({ taskId: 'other' })).toBeNull()
  })
  it('앱은 제동력일 때 taskId를 보내지 않는다(이전 서버와 같은 요청 모양)', () => {
    const a = { ...base, difficultyMode: 'guided' as const }
    expect(JSON.parse(buildChatBody({ ...a, taskId: null }))).not.toHaveProperty('taskId')
    expect(JSON.parse(buildChatBody({ ...a, taskId: 'min-turning-radius' })).taskId).toBe('min-turning-radius')
  })
  it('안내 없음에서는 두 과제 모두 다음 단계·작업 순서를 알려 주지 않는다는 규칙이 있고, 안내 있음에는 없다(v0.4)', () => {
    for (const taskId of ['min-turning-radius', null]) {
      const u = buildSystemPrompt(context as any, { mode: 'unguided', stepId: 'read', taskId })
      const g = buildSystemPrompt(context as any, { mode: 'guided', stepId: 'read', taskId })
      expect(u).toContain('다음에 할 단계나 작업 순서를 알려 주지 않는다')
      expect(u).toContain('안전 판단 근거로만')
      expect(g).not.toContain('다음에 할 단계나 작업 순서를 알려 주지 않는다')
      // 안전 예외는 남아 있다
      expect(u).toContain('안전에 관한 질문에는 단계와 관계없이 바로 분명하게 답한다')
    }
  })
})
