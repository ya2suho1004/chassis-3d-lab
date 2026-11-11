// 색 보정 곡선 '부드러운 꺾임'(설계 2026-11-11 §4.2): 꺾임 값까지는 그대로, 그 위만 눌러 준다 — 계측부·색 토큰이 원본대로 보이게
import { describe, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { SOFT_CLIP_GLSL, TONE_ANCHOR, TONE_DESATURATION, TONE_KNEE, installToneCurve, softClip, type Rgb } from '../src/scene/look/toneCurve'

const srgbToLinear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const to8 = (c: number) => Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255)
/** 끼우기 전의 three.js 조각(이 파일의 어떤 시험보다 먼저 잡아 둔다) */
const PRISTINE = THREE.ShaderChunk.tonemapping_pars_fragment
/** 끼운 뒤에 있어야 할 함수 글 */
const PATCHED_FN = `vec3 CustomToneMapping( vec3 color ) {\n  color *= toneMappingExposure;${SOFT_CLIP_GLSL}\n}`

describe('부드러운 꺾임 곡선', () => {
  test('꺾임 값 이하의 색은 그대로 나온다', () => {
    for (const c of [[0, 0, 0], [0.2, 0.5, 0.1], [TONE_KNEE, 0.3, 0.3], [0.01, 0.02, TONE_KNEE]] as Rgb[]) expect(softClip(c)).toEqual(c)
  })
  test('계기 화면 숫자 색(#ff4a3a)은 화면 값 (248, 76, 62)로 나온다 — 원본과 채널마다 10 이내(설계 §5·§10)', () => {
    const out = softClip([srgbToLinear(255), srgbToLinear(74), srgbToLinear(58)]).map(to8)
    expect(out).toEqual([248, 76, 62])
    ;[255, 74, 58].forEach((v, i) => expect(Math.abs(out[i]! - v)).toBeLessThanOrEqual(10))
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
  test('꺾이는 점에서 끊기지 않는다(위로도 아래로도)', () => {
    const below = softClip([TONE_KNEE, 0, 0])[0], above = softClip([TONE_KNEE + 1e-6, 0, 0])[0]
    expect(Math.abs(above - below)).toBeLessThan(1e-5)
  })
  test('GLSL 글은 같은 상수로 만든다', () => {
    expect(SOFT_CLIP_GLSL).toContain(TONE_KNEE.toFixed(4))
    expect(SOFT_CLIP_GLSL).toContain(TONE_DESATURATION.toFixed(4))
    expect(SOFT_CLIP_GLSL).toContain((1 - TONE_KNEE).toFixed(4))
  })
  test('GLSL 글을 글자 치환으로 JS로 옮겨 돌리면 JS 함수와 같은 값이 나온다(화면에 나가는 식을 지킨다)', () => {
    const body = SOFT_CLIP_GLSL
      .replace(/float /g, 'let ').replace(/max\(/g, 'Math.max(')
      .replace(/color\.([rgb])/g, (_m, ch: string) => `color[${'rgb'.indexOf(ch)}]`)
      .replace(/color \*= ([^;]+);/, 'color = color.map((v) => v * ($1));')
      .replace(/return mix\( color, vec3\( (\w+) \), (\w+) \);/, 'return color.map((v) => v * (1 - $2) + $1 * $2);')
    const glsl = new Function('color', body) as (c: number[]) => number[]
    for (let p = 0; p <= 4; p += 0.01) {
      for (const c of [[p, p, p], [p, 0.3 * p, 0.1 * p], [0.2 * p, p, 0.6 * p]] as Rgb[]) {
        const a = glsl([...c]), b = softClip(c)
        for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i]!, 12)
      }
    }
  })
})

describe('렌더러에 끼우기', () => {
  test('설치된 three.js에 끼울 줄이 꼭 한 번 있고, 곡선이 쓰는 노출 값 선언이 그 앞에 있다(아니면 three.js가 바뀐 것 — toneCurve.ts를 고친다)', () => {
    expect(PRISTINE.split(TONE_ANCHOR).length - 1).toBe(1)
    const exposure = PRISTINE.indexOf('uniform float toneMappingExposure;')
    expect(exposure).toBeGreaterThanOrEqual(0)
    expect(exposure).toBeLessThan(PRISTINE.indexOf(TONE_ANCHOR))
  })
  test('한 번 끼우면 빈 함수 줄만 곡선 함수로 바뀌고, 다시 불러도 그대로다', () => {
    expect(installToneCurve()).toBe(THREE.CustomToneMapping)
    const chunk = THREE.ShaderChunk.tonemapping_pars_fragment
    expect(chunk).toBe(PRISTINE.replace(TONE_ANCHOR, PATCHED_FN))
    expect(installToneCurve()).toBe(THREE.CustomToneMapping)
    expect(THREE.ShaderChunk.tonemapping_pars_fragment).toBe(chunk)
  })
  test('이 모듈만 다시 불려도(three.js에는 이미 끼워져 있음) 경고 없이 곡선을 그대로 쓴다', async () => {
    installToneCurve()
    const chunk = THREE.ShaderChunk.tonemapping_pars_fragment
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      vi.resetModules()
      const fresh = await import('../src/scene/look/toneCurve')
      // 전제: 모듈을 다시 불러도 three.js는 같은 것이다(다르면 이 시험이 뜻이 없다)
      expect((await import('three')).ShaderChunk).toBe(THREE.ShaderChunk)
      expect(fresh.installToneCurve()).toBe(THREE.CustomToneMapping)
      expect(warn).not.toHaveBeenCalled()
      expect(THREE.ShaderChunk.tonemapping_pars_fragment).toBe(chunk)
    } finally { warn.mockRestore() }
  })
  test('끼울 줄이 없으면 한 번 경고하고 three.js 중립 곡선으로 돈다', async () => {
    const saved = THREE.ShaderChunk.tonemapping_pars_fragment
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      THREE.ShaderChunk.tonemapping_pars_fragment = PRISTINE.replace(TONE_ANCHOR, 'vec3 CustomToneMapping( vec3 color ) {\n\treturn color;\n}')
      vi.resetModules()
      const fresh = await import('../src/scene/look/toneCurve')
      expect(fresh.installToneCurve()).toBe(THREE.NeutralToneMapping)
      expect(fresh.installToneCurve()).toBe(THREE.NeutralToneMapping)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(THREE.ShaderChunk.tonemapping_pars_fragment).not.toContain(SOFT_CLIP_GLSL)
    } finally { THREE.ShaderChunk.tonemapping_pars_fragment = saved; warn.mockRestore() }
  })
})
