// 화면 품질: 주소 고정(?q=), 터치 기기 기본 낮음, 느리면 한 번 자동 낮춤(올리지는 않음)
import { describe, expect, it } from 'vitest'
import { AUTO_LOW_FPS, initialQuality, shouldAutoLower } from '../src/app/quality'

describe('화면 품질 고르기', () => {
  it('주소 ?q=high|low는 고정', () => {
    expect(initialQuality('?q=high', true)).toEqual({ low: false, locked: true })
    expect(initialQuality('?code=1&q=low', false)).toEqual({ low: true, locked: true })
  })
  it('주소가 없으면 터치 기기는 낮음, 그 밖은 높음', () => {
    expect(initialQuality('', true)).toEqual({ low: true, locked: false })
    expect(initialQuality('', false)).toEqual({ low: false, locked: false })
  })
  it('높음인데 느리면 낮춘다 — 고정·직접 고름·이미 낮음이면 안 함', () => {
    const base = { low: false, locked: false, userChose: false, fps: AUTO_LOW_FPS - 1 }
    expect(shouldAutoLower(base)).toBe(true)
    expect(shouldAutoLower({ ...base, fps: AUTO_LOW_FPS + 1 })).toBe(false)
    expect(shouldAutoLower({ ...base, locked: true })).toBe(false)
    expect(shouldAutoLower({ ...base, userChose: true })).toBe(false)
    expect(shouldAutoLower({ ...base, low: true })).toBe(false)
  })
})
