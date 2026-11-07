// tests/requests.test.ts — 손님 사연 문구(설계 2026-11-06 §10-1)
import { describe, expect, it } from 'vitest'
import { requestCopy } from '../src/app/requests'

describe('requestCopy — 과제별 손님 사연', () => {
  it('최소회전반경·제동력 사연', () => {
    expect(requestCopy('min-turning-radius').complaint).toBe('좁은 길에서 잘 안 돌아요')
    expect(requestCopy('braking-force').complaint).toBe('브레이크 점검 받으러 왔어요')
  })
  it('모르는 과제는 제동력 문구(서버·패널 작업지시와 같은 기본값)', () => {
    expect(requestCopy('unknown')).toEqual(requestCopy('braking-force'))
    expect(requestCopy(undefined)).toEqual(requestCopy('braking-force'))
  })
  it('판정을 암시하는 낱말이 없다(사연·한마디·교관 대사·작업지시 모두)', () => {
    for (const id of ['min-turning-radius', 'braking-force']) {
      const c = requestCopy(id)
      for (const t of Object.values(c)) expect(t).not.toMatch(/양호|불량|정상|고장|이상 없/)
    }
  })
  it('제동력 손님 사연은 증상(쏠림)을 말하지 않는다 — 판정 암시 방지(독립 검토 5번, MOON 2026-11-07)', () => {
    expect(requestCopy('braking-force').complaint).not.toMatch(/쏠|한쪽/)
  })
})
