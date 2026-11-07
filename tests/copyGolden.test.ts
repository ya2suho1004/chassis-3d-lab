// tests/copyGolden.test.ts — 과제별 문구 한 곳 모으기(2026-11-07) 전후로 화면 문구가 한 글자도 바뀌지 않음을 고정한다
import { describe, expect, it } from 'vitest'
import { npcLines, panelWorkOrder } from '../src/screens/NpcDialog'
import { NOD_LINE, requestCopy } from '../src/app/requests'

describe('과제별 문구 고정(문구를 바꾸면 MOON 검토 뒤 이 시험도 함께 고친다)', () => {
  it('교관 첫 대사 — 최소회전반경', () => {
    expect(npcLines({ near: true, running: false, taskTitle: 'T', taskId: 'min-turning-radius', nickname: '든든한 스패너' })).toEqual([
      '어서 와, 든든한 스패너. 오늘은 회전반경 측정판으로 최소회전반경을 측정해 볼 거야.',
      '손님 차량이 좁은 길에서 잘 안 돈다고 했어. 앞바퀴 최대 조향각을 읽어 최소회전반경을 산출하고, 차량 상태를 판정해 줘.',
      '오늘 과제는 「T」야. 준비됐으면 과제를 받아.',
    ])
  })
  it('교관 첫 대사 — 제동력(과제 ID 없음·모르는 ID도 제동력)', () => {
    const want = [
      '어서 와. 오늘은 제동력 시험기로 뒤축 제동력을 측정해 볼 거야.',
      '손님 차량이 제동할 때 한쪽으로 쏠린다고 했어. 좌·우 제동력을 재서 편차와 합을 계산하고, 차량 상태를 판정해 줘.',
      '오늘 과제는 「T」야. 준비됐으면 과제를 받아.',
    ]
    expect(npcLines({ near: true, running: false, taskTitle: 'T', taskId: 'braking-force' })).toEqual(want)
    expect(npcLines({ near: true, running: false, taskTitle: 'T' })).toEqual(want)
    expect(npcLines({ near: true, running: false, taskTitle: 'T', taskId: 'unknown' })).toEqual(want)
  })
  it('기본 화면 작업지시', () => {
    expect(panelWorkOrder('min-turning-radius')).toBe('손님 차량 입고, 좁은 길에서 잘 돌지 않는다는 호소. 앞바퀴 최대 조향각을 읽어 최소회전반경을 산출하고 차량 상태를 판정하세요.')
    expect(panelWorkOrder('braking-force')).toBe('손님 차량 입고, 제동 시 한쪽으로 쏠린다는 호소. 뒤축 제동력을 측정해 편차와 합을 계산하고 차량 상태를 판정하세요.')
    expect(panelWorkOrder(undefined)).toBe(panelWorkOrder('braking-force'))
  })
  it('손님 사연·교관 한마디(MOON 검토 완료 2026-11-07)', () => {
    expect(requestCopy('min-turning-radius')).toMatchObject({ complaint: '좁은 길에서 잘 안 돌아요', closing: '앞바퀴 각도를 직접 읽고 판단까지 마쳤구나. 의뢰 끝!' })
    expect(requestCopy('braking-force')).toMatchObject({ complaint: '브레이크 점검 받으러 왔어요', closing: '제동력을 직접 재고 판단까지 마쳤구나. 의뢰 끝!' })
  })
  it('검사 통과 끄덕임 한마디', () => {
    expect(NOD_LINE).toBe('좋아, 검사 통과야. 수고했어!')
  })
})
