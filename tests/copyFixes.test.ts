// 시연 뒤 문구 수정(2026-11-07 MOON 결정) — 결과 화면 수업 시점 이름을 차시 이름과 맞추고, 이어서 하기 저장 시각을 한국 시각으로
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LESSON_LABEL, LESSON_SHORT } from '../src/app/lesson'
import { kstDateTime } from '../src/app/resultLabels'

describe('결과 화면 수업 시점 이름', () => {
  it('차시 고르기 화면과 같은 이름(앞부분)을 쓴다', () => {
    expect(LESSON_SHORT).toEqual({ preview: '1~2차시 연습', review: '5차시 정리', other: '그 밖의 사용' })
    for (const k of ['preview', 'review', 'other'] as const) expect(LESSON_LABEL[k].startsWith(LESSON_SHORT[k])).toBe(true)
  })
  it('결과 화면에 옛 이름(대기 중 예습·실습 후 복습)이 남지 않는다', () => {
    const src = fs.readFileSync('src/screens/ResultScreen.tsx', 'utf8')
    expect(src).not.toMatch(/대기 중 예습|실습 후 복습/)
    expect(src).toMatch(/LESSON_SHORT\[session\.usagePhase\]/)
  })
})

describe('이어서 하기 저장 시각', () => {
  it('UTC 저장값을 한국 시각으로 보인다(날짜가 넘어가는 경우 포함)', () => {
    expect(kstDateTime('2026-11-08T05:07:09.000Z')).toBe('2026. 11. 8. 14:07')
    expect(kstDateTime('2026-11-08T15:30:00.000Z')).toBe('2026. 11. 9. 00:30')
  })
  it('읽을 수 없는 값은 그대로 보인다', () => {
    expect(kstDateTime('없음')).toBe('없음')
  })
  it('이어서 하기 화면이 한국 시각을 쓴다', () => {
    const src = fs.readFileSync('src/screens/ResumeScreen.tsx', 'utf8')
    expect(src).toMatch(/kstDateTime\(draft\.savedAt\)/)
  })
})
