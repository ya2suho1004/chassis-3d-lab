// NPC 대화 대본: 거리·과제 상태에 따라 대사가 바뀐다(판정·채점과 무관한 대본)
import { describe, expect, it } from 'vitest'
import { npcLines, panelWorkOrder } from '../src/screens/NpcDialog'

describe('NPC 교관 대화 대본', () => {
  it('멀리 있으면 가까이 오라는 한 줄만', () => {
    expect(npcLines({ near: false, running: false, taskTitle: 'T' })).toEqual(['여기야! 가까이 와서 이야기하자.'])
  })
  it('과제 전에는 작업지시(점검 의뢰·편차·합·판정)와 과제 이름을 차례로 말한다', () => {
    const l = npcLines({ near: true, running: false, taskTitle: '제동력 측정 및 판독 — 사례 1' })
    expect(l).toHaveLength(3)
    expect(l[1]).toMatch(/브레이크 점검/); expect(l[1]).toMatch(/편차와 합/)
    expect(l[2]).toContain('제동력 측정 및 판독 — 사례 1')
  })
  it('과제 중에는 다음 단계를 말하지 않는다(안내 없음 모드와 같은 대사)', () => {
    const l = npcLines({ near: true, running: true, taskTitle: 'T' })
    expect(l.join(' ')).not.toMatch(/보호구|타이어|롤러|MOTOR/)
  })
  it('닉네임이 있으면 첫 인사에서 부른다(캐릭터 만들기)', () => {
    expect(npcLines({ near: true, running: false, taskTitle: 'T', nickname: '꼼꼼한 토크렌치' })[0]).toMatch(/^어서 와, 꼼꼼한 토크렌치\. /)
    expect(npcLines({ near: true, running: false, taskTitle: 'T', taskId: 'min-turning-radius', nickname: '든든한 스패너' })[0]).toMatch(/^어서 와, 든든한 스패너\. /)
    expect(npcLines({ near: true, running: false, taskTitle: 'T' })[0]).toMatch(/^어서 와\. /)
  })
  it('기본 화면(패널)의 작업지시도 과제에 맞는다(최소회전반경 과제에 제동력 문구 금지)', () => {
    const turn = panelWorkOrder('min-turning-radius')
    expect(turn).toMatch(/최소회전반경/); expect(turn).toMatch(/조향각/); expect(turn).not.toMatch(/제동/)
    expect(panelWorkOrder('braking-force')).toMatch(/브레이크 점검 의뢰/)
    expect(panelWorkOrder(undefined)).toMatch(/편차와 합/)
  })
  it('비기록 모드(AI 교관 없음)에서는 AI 교관을 권하지 않는다', () => {
    expect(npcLines({ near: true, running: true, taskTitle: 'T', aiAvailable: false }).join(' ')).not.toContain('AI 교관')
    expect(npcLines({ near: true, running: true, taskTitle: 'T' }).join(' ')).toContain('AI 교관')
  })
})
