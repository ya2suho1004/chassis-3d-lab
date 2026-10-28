// NPC 대화 대본: 거리·과제 상태에 따라 대사가 바뀐다(판정·채점과 무관한 대본)
import { describe, expect, it } from 'vitest'
import { npcLines } from '../src/screens/NpcDialog'

describe('NPC 교관 대화 대본', () => {
  it('멀리 있으면 가까이 오라는 한 줄만', () => {
    expect(npcLines({ near: false, running: false, taskTitle: 'T' })).toEqual(['여기야! 가까이 와서 이야기하자.'])
  })
  it('과제 전에는 작업지시(쏠림 호소·편차·합·판정)와 과제 이름을 차례로 말한다', () => {
    const l = npcLines({ near: true, running: false, taskTitle: '제동력 측정 및 판독 — 사례 1' })
    expect(l).toHaveLength(3)
    expect(l[1]).toMatch(/쏠린다/); expect(l[1]).toMatch(/편차와 합/)
    expect(l[2]).toContain('제동력 측정 및 판독 — 사례 1')
  })
  it('과제 중에는 다음 단계를 말하지 않는다(안내 없음 모드와 같은 대사)', () => {
    const l = npcLines({ near: true, running: true, taskTitle: 'T' })
    expect(l.join(' ')).not.toMatch(/보호구|타이어|롤러|MOTOR/)
  })
})
