// H1(2026-11-08 Codex 회의): 기록의 clientAppVersion에 빌드한 커밋을 넣어, 사용성 평가판·현장 적용판을 기록만으로 구분한다.
// 기록 형식(필드)은 그대로, 값만 정확히. 계약 상한 64자.
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { appVersionString, APP_BASE_VERSION } from '../src/app/buildInfo'
import { APP_VERSION } from '../src/app/session'

describe('앱 판 번호 — 커밋 포함(H1)', () => {
  test('기본 판 + 커밋', () => {
    expect(appVersionString('0.3.0-demo', 'abc1234def56')).toBe('0.3.0-demo+abc1234def56')
  })
  test('커밋을 모르면 조용히 숨기지 않고 unknown으로 드러낸다', () => {
    expect(appVersionString('0.3.0-demo', '')).toBe('0.3.0-demo+unknown')
    expect(appVersionString('0.3.0-demo', undefined)).toBe('0.3.0-demo+unknown')
  })
  test('기록 계약 상한 64자를 넘지 않는다', () => {
    expect(appVersionString('0.3.0-demo', 'x'.repeat(100)).length).toBeLessThanOrEqual(64)
  })
  test('기록에 쓰는 APP_VERSION이 이 형식이다', () => {
    expect(APP_VERSION.startsWith(`${APP_BASE_VERSION}+`)).toBe(true)
    expect(APP_VERSION.length).toBeLessThanOrEqual(64)
  })
  test('빌드 설정이 커밋을 넣는다(Vercel 커밋 변수 먼저, 없으면 git)', () => {
    const cfg = fs.readFileSync('vite.config.ts', 'utf8')
    expect(cfg).toMatch(/__APP_COMMIT__/)
    expect(cfg).toMatch(/VERCEL_GIT_COMMIT_SHA/)
  })
  test('계산기(2026-11-11)부터 기본 판 0.3.2-demo — 계산기 이전 기록과 가른다(0.3.1-demo는 채점 규칙 가)', () => { expect(APP_BASE_VERSION).toBe('0.3.2-demo') })
})
