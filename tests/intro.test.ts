// 인트로·로딩 화면(설계 docs/superpowers/specs/2026-11-03-intro-loading-design.md)
import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { PRELOAD_MODELS, introPlan, parseIntroPrefs, preloadPlan, tipsFor } from '../src/app/intro'

describe('인트로 계획', () => {
  test('교사가 끄거나 움직임 줄이기면 없음', () => {
    expect(introPlan({ seen: false, off: true }, false)).toBe('none')
    expect(introPlan({ seen: false, off: false }, true)).toBe('none')
  })
  test('처음이면 로고부터, 본 적 있으면 타이틀부터', () => {
    expect(introPlan({ seen: false, off: false }, false)).toBe('full')
    expect(introPlan({ seen: true, off: false }, false)).toBe('short')
  })
  test('저장값 검사: 깨진 값·모르는 값은 기본', () => {
    expect(parseIntroPrefs(null)).toEqual({ seen: false, off: false })
    expect(parseIntroPrefs('{')).toEqual({ seen: false, off: false })
    expect(parseIntroPrefs('{"seen":"yes","off":1}')).toEqual({ seen: false, off: false })
    expect(parseIntroPrefs('{"seen":true,"off":true}')).toEqual({ seen: true, off: true })
  })
})

describe('미리 받기', () => {
  test('public/assets/models의 glb를 모두 미리 받는다', () => {
    const files = readdirSync(new URL('../public/assets/models', import.meta.url)).filter((f) => f.endsWith('.glb')).sort()
    expect([...PRELOAD_MODELS].sort()).toEqual(files)
  })
  test('품질 높음(PC)은 화면 효과 코드도 처음부터 받는다(실습장 진입 대기 줄이기)', () => {
    expect(preloadPlan(false).effects).toBe(true)
  })
  test('품질 낮음(태블릿)은 쓰지 않는 효과 코드를 받지 않는다(태블릿 내려받기 보호)', () => {
    expect(preloadPlan(true).effects).toBe(false)
  })
  test('정비소 HDRI는 더 받지 않는다 — 반사광은 실습장 자체로 만든다(2026-11-11)', () => {
    expect(Object.keys(preloadPlan(false)).sort()).toEqual(['effects', 'models'])
    expect(existsSync(new URL('../public/assets/hdri', import.meta.url))).toBe(false)
  })
  test('모델은 품질과 상관없이 같은 목록', () => {
    expect(preloadPlan(true).models).toEqual(preloadPlan(false).models)
    expect(preloadPlan(true).models).toEqual(PRELOAD_MODELS.map((f) => `models/${f}`))
  })
})

describe('로딩 팁', () => {
  test('안내 없음에서는 작업 순서·장비 조작을 알려 주는 팁이 없다(다음 단계 비공개)', () => {
    const t = tipsFor({ guided: false, aiAvailable: true }).join(' ')
    for (const w of ['보호구', '시동', '바깥쪽 바퀴', '페달', '리프트', 'MOTOR']) expect(t).not.toContain(w)
  })
  test('안내 있음에서는 순서·안전 팁이 더해진다', () => {
    expect(tipsFor({ guided: true, aiAvailable: true }).join(' ')).toContain('보호구')
  })
  test('AI 교관이 없으면(비기록) AI 팁을 빼낸다', () => {
    expect(tipsFor({ guided: true, aiAvailable: false }).join(' ')).not.toContain('AI 교관')
    expect(tipsFor({ guided: true, aiAvailable: true }).join(' ')).toContain('AI 교관')
  })
})
