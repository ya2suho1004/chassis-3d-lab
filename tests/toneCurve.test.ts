// 색 보정 곡선 '부드러운 꺾임'(설계 2026-11-11 §4.2): 꺾임 값까지는 그대로, 그 위만 눌러 준다 — 계측부·색 토큰이 원본대로 보이게
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { SOFT_CLIP_GLSL, TONE_ANCHOR, TONE_DESATURATION, TONE_KNEE, installToneCurve, softClip, type Rgb } from '../src/scene/look/toneCurve'

const srgbToLinear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }

describe('부드러운 꺾임 곡선', () => {
  test('꺾임 값 이하의 색은 그대로 나온다', () => {
    for (const c of [[0, 0, 0], [0.2, 0.5, 0.1], [TONE_KNEE, 0.3, 0.3], [0.01, 0.02, TONE_KNEE]] as Rgb[]) expect(softClip(c)).toEqual(c)
  })
  test('계기 화면 숫자 색(#ff4a3a)은 가장 밝은 채널만 조금 눌리고 색 비율이 유지된다', () => {
    const red: Rgb = [srgbToLinear(255), srgbToLinear(74), srgbToLinear(58)]
    const out = softClip(red)
    expect(out[0]).toBeGreaterThan(0.93); expect(out[0]).toBeLessThan(1)
    expect(out[1] / out[0]).toBeCloseTo(red[1] / red[0], 1)
    expect(out[2] / out[0]).toBeCloseTo(red[2] / red[0], 1)
  })
  test('밝아질수록 커지되 1을 넘지 않는다', () => {
    let prev = 0
    for (let p = 0; p <= 40; p += 0.05) {
      const y = softClip([p, p, p])[0]
      expect(y).toBeGreaterThanOrEqual(prev)
      expect(y).toBeLessThan(1)
      prev = y
    }
    expect(softClip([40, 40, 40])[0]).toBeGreaterThan(0.99)
  })
  test('꺾이는 점에서 끊기지 않는다', () => {
    const below = softClip([TONE_KNEE, 0, 0])[0], above = softClip([TONE_KNEE + 1e-6, 0, 0])[0]
    expect(above - below).toBeLessThan(1e-5)
  })
  test('GLSL 글은 같은 상수로 만든다', () => {
    expect(SOFT_CLIP_GLSL).toContain(TONE_KNEE.toFixed(4))
    expect(SOFT_CLIP_GLSL).toContain(TONE_DESATURATION.toFixed(4))
    expect(SOFT_CLIP_GLSL).toContain((1 - TONE_KNEE).toFixed(4))
  })
})

describe('렌더러에 끼우기', () => {
  test('설치된 three.js에 끼울 줄이 있다(없으면 three.js가 바뀐 것 — toneCurve.ts를 고친다)', () => {
    expect(TONE_ANCHOR).toBe('vec3 CustomToneMapping( vec3 color ) { return color; }')
  })
  test('한 번 끼우면 사용자 정의 색 보정이 곡선으로 바뀌고, 다시 불러도 그대로다', () => {
    expect(installToneCurve()).toBe(THREE.CustomToneMapping)
    const chunk = THREE.ShaderChunk.tonemapping_pars_fragment
    expect(chunk).not.toContain(TONE_ANCHOR)
    expect(chunk).toContain('color *= toneMappingExposure;')
    expect(chunk).toContain(SOFT_CLIP_GLSL)
    expect(installToneCurve()).toBe(THREE.CustomToneMapping)
    expect(THREE.ShaderChunk.tonemapping_pars_fragment).toBe(chunk)
  })
})
