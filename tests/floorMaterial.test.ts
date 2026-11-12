// 광택 에폭시 바닥(설계 2026-11-11 §4.5): three.js 반사 조각의 두 줄을 바꿔 끼운다 — 끼울 줄이 있는지, 끼운 결과가 맞는지
import { describe, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { BOX_PROJECT, FLOOR_ANCHORS, makeFloorMaterial, patchedEnvChunk } from '../src/scene/look/floorMaterial'
import { LOOK_DEFAULTS } from '../src/scene/look/lookConfig'
import { EPOXY_ROUGH_MID } from '../src/scene/look/lookTextures'

const count = (s: string, part: string) => s.split(part).length - 1

describe('바닥 반사 조각 고치기', () => {
  const stock = THREE.ShaderChunk.envmap_physical_pars_fragment
  test('설치된 three.js에 끼울 두 줄이 한 번씩 있다(없으면 three.js가 바뀐 것 — floorMaterial.ts를 고친다)', () => {
    expect(count(stock, FLOOR_ANCHORS.reflect)).toBe(1)
    expect(count(stock, FLOOR_ANCHORS.radiance)).toBe(1)
  })
  test('두 줄만 바뀐다: 반사 방향 줄 뒤에 상자 맞춤 식이 붙고, 반사 밝기 줄에 반사 배수가 곱해진다', () => {
    const out = patchedEnvChunk(stock)!
    expect(out).toBe(stock.replace(FLOOR_ANCHORS.reflect, FLOOR_ANCHORS.reflect + BOX_PROJECT).replace(FLOOR_ANCHORS.radiance, 'return envMapColor.rgb * envMapIntensity * lookReflect;'))
    // 퍼진 빛(바닥 색을 밝히는 쪽) 줄은 그대로다
    expect(out).toContain('return PI * envMapColor.rgb * envMapIntensity;')
  })
  test('상자 맞춤 식: 축마다 두 면 가운데 먼 쪽, 세 축 가운데 가까운 쪽에서 상자와 만나고, 반사광을 그린 자리에서 그 점을 본다', () => {
    expect(BOX_PROJECT).toContain('vec3 t1 = ( lookBoxMax - vLookWorldPos ) / rd;')
    expect(BOX_PROJECT).toContain('vec3 t2 = ( lookBoxMin - vLookWorldPos ) / rd;')
    expect(BOX_PROJECT).toContain('vec3 tm = max( t1, t2 );')
    expect(BOX_PROJECT).toContain('float tt = min( min( tm.x, tm.y ), tm.z );')
    expect(BOX_PROJECT).toContain('reflectVec = normalize( vLookWorldPos + rd * tt - lookProbe );')
  })
  test('끼울 줄이 하나라도 없으면 고치지 않는다(null)', () => {
    expect(patchedEnvChunk('void main() {}')).toBeNull()
    expect(patchedEnvChunk(stock.replace(FLOOR_ANCHORS.radiance, ''))).toBeNull()
    expect(patchedEnvChunk(stock.replace(FLOOR_ANCHORS.reflect, ''))).toBeNull()
  })
})

describe('바닥 재질', () => {
  const box = { min: new THREE.Vector3(-10, 0, 0), max: new THREE.Vector3(18, 4.2, 30) }
  const mat = makeFloorMaterial(box, new THREE.Vector3(9, 1.4, 7), [4, 3])
  test('색 그림과 광택 그림을 쓰고, 실제 거칠기가 값 표의 바닥 거칠기가 되게 맞춘다', () => {
    expect(mat.map).toBeTruthy(); expect(mat.roughnessMap).toBeTruthy()
    expect(mat.roughness * (EPOXY_ROUGH_MID / 255)).toBeCloseTo(LOOK_DEFAULTS.floorRoughness, 6)
    expect(mat.metalness).toBe(0)
    expect(mat.customProgramCacheKey()).toBe('look-floor')
  })
  test('three.js 표준 재질 셰이더에 끼우면 상자·반사 배수 값이 들어간다', () => {
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader }
    mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer)
    expect(shader.vertexShader).toContain('varying vec3 vLookWorldPos;')
    expect(shader.vertexShader).toContain('vLookWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;')
    expect(shader.fragmentShader).not.toContain('#include <envmap_physical_pars_fragment>')
    expect(shader.fragmentShader).toContain('uniform float lookReflect;')
    expect(shader.fragmentShader).toContain('lookBoxMax - vLookWorldPos')
    expect((shader.uniforms.lookBoxMin!.value as THREE.Vector3).x).toBe(-10)
    expect((shader.uniforms.lookBoxMax!.value as THREE.Vector3).y).toBe(4.2)
    expect((shader.uniforms.lookProbe!.value as THREE.Vector3).y).toBe(1.4)
    expect(shader.uniforms.lookReflect!.value).toBe(LOOK_DEFAULTS.floorReflect)
  })
  test('끼울 줄이 없으면 한 번 경고하고, 셰이더를 고치지 않은 재질을 돌려준다(그림과 거칠기는 그대로)', () => {
    const saved = THREE.ShaderChunk.envmap_physical_pars_fragment
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      THREE.ShaderChunk.envmap_physical_pars_fragment = saved.replace(FLOOR_ANCHORS.reflect, '')
      const plain = makeFloorMaterial(box, new THREE.Vector3(9, 1.4, 7), [4, 3])
      expect(warn).toHaveBeenCalledTimes(1)
      expect(Object.hasOwn(plain, 'onBeforeCompile')).toBe(false)
      expect(plain.customProgramCacheKey()).not.toBe('look-floor')
      expect(plain.map).toBeTruthy(); expect(plain.roughness).toBe(mat.roughness)
    } finally { THREE.ShaderChunk.envmap_physical_pars_fragment = saved; warn.mockRestore() }
  })
})
