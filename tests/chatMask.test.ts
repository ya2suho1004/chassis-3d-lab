import { describe, expect, it } from 'vitest'
// @ts-expect-error — 개발 도구의 .mjs 모듈(타입 선언 없음)
import { maskPersonalInfo } from '../scripts/chat-eval/mask.mjs'

describe('챗봇 개인정보 가림', () => {
  it('휴대폰 번호 여러 형식을 가린다', () => {
    for (const s of ['010-1234-5678', '01012345678', '010 1234 5678', '011.123.4567', '+82-10-1234-5678']) {
      const r = maskPersonalInfo(`연락처 ${s} 입니다`)
      expect(r.text).toBe('연락처 [가림] 입니다')
      expect(r.masked).toEqual(['phone'])
    }
  })
  it('이메일과 주민번호 형식을 가린다', () => {
    const r = maskPersonalInfo('메일 kim.ms@school.kr, 번호 080101-3123456')
    expect(r.text).toBe('메일 [가림], 번호 [가림]')
    expect(r.masked.sort()).toEqual(['email', 'rrn'])
  })
  it('학년·반·번호 형식을 가린다', () => {
    const r = maskPersonalInfo('저 2학년 3반 김민수인데요, 1학년 10반 7번이에요')
    expect(r.text).toBe('저 [가림] 김민수인데요, [가림]이에요')
    expect(r.masked).toEqual(['classroom', 'classroom'])
  })
  it('제동력 숫자·계산식은 건드리지 않는다', () => {
    const s = '좌 240, 우 200, 축중 600이면 (240-200)/600*100 = 6.6%'
    expect(maskPersonalInfo(s)).toEqual({ text: s, masked: [] })
  })
})
