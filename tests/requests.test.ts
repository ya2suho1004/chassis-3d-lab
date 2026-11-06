// tests/requests.test.ts — 손님 사연 문구(설계 2026-11-06 §10-1)
import { describe, expect, it } from 'vitest'
import { requestCopy } from '../src/app/requests'

describe('requestCopy — 과제별 손님 사연', () => {
  it('최소회전반경·제동력 사연', () => {
    expect(requestCopy('min-turning-radius').complaint).toBe('좁은 길에서 잘 안 돌아요')
    expect(requestCopy('braking-force').complaint).toBe('브레이크를 밟으면 한쪽으로 쏠려요')
  })
  it('모르는 과제는 제동력 문구(서버·패널 작업지시와 같은 기본값)', () => {
    expect(requestCopy('unknown')).toEqual(requestCopy('braking-force'))
  })
  it('판정을 암시하는 낱말이 없다(사연·한마디 모두)', () => {
    for (const id of ['min-turning-radius', 'braking-force']) {
      const c = requestCopy(id)
      for (const t of [c.complaint, c.closing]) expect(t).not.toMatch(/양호|불량|정상|고장|이상 없/)
    }
  })
})
