// 광택 에폭시 바닥(설계 2026-11-11 §4.5): three.js 반사 조각의 두 줄을 바꿔 끼운다 — 끼울 줄이 있는지, 끼운 결과가 맞는지
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { FLOOR_ANCHORS, makeFloorMaterial, patchedEnvChunk } from '../src/scene/look/floorMaterial'
import { LOOK_DEFAULTS } from '../src/scene/look/lookConfig'

const count = (s: string, part: string) => s.split(part).length - 1

describe('바닥 반사 조각 고치기', () => {
  const stock = THREE.ShaderChunk.envmap_physical_pars_fragment
  test('설치된 three.js에 끼울 두 줄이 한 번씩 있다(없으면 three.js가 바뀐 것 — floorMaterial.ts를 고친다)', () => {
    expect(count(stock, FLOOR_ANCHORS.reflect)).toBe(1)
    expect(count(stock, FLOOR_ANCHORS.radiance)).toBe(1)
  })
  test('반사 방향을 건물 상자에 맞추는 줄과 반사 배수를 넣는다', () => {
    const out = patchedEnvChunk(stock)!
    expect(out).toContain('lookBoxMax - vLookWorldPos')
    expect(out).toContain('- lookProbe')
    expect(out).toContain('return envMapColor.rgb * envMapIntensity * lookReflect;')
    expect(out.indexOf(FLOOR_ANCHORS.reflect)).toBeLessThan(out.indexOf('lookBoxMax - vLookWorldPos'))
    expect(out).toContain('return PI * envMapColor.rgb * envMapIntensity;')
  })
  test('끼울 줄이 없으면 고치지 않는다(null)', () => {
    expect(patchedEnvChunk('void main() {}')).toBeNull()
    expect(patchedEnvChunk(stock.replace(FLOOR_ANCHORS.radiance, ''))).toBeNull()
  })
})

describe('바닥 재질', () => {
  const box = { min: new THREE.Vector3(-10, 0, 0), max: new THREE.Vector3(18, 4.2, 30) }
  const mat = makeFloorMaterial(box, new THREE.Vector3(9, 1.4, 7), [4, 3])
  test('색 그림과 광택 그림을 쓰고, 실제 거칠기가 값 표의 바닥 거칠기가 되게 맞춘다', () => {
    expect(mat.map).toBeTruthy(); expect(mat.roughnessMap).toBeTruthy()
    expect(mat.roughness * (118 / 255)).toBeCloseTo(LOOK_DEFAULTS.floorRoughness, 6)
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
})
