// 광택 에폭시 바닥(설계 2026-11-11 §4.5): 색은 고르게, 광택만 조금씩 다르게. 반사는 건물 상자에 맞춰(상자 투영) 천장 조명이 제자리에 비친다.
// three.js 셰이더 조각의 두 줄을 바꿔 끼운다. 끼울 줄이 없으면(three.js가 바뀜) 고치지 않은 반사로 돌고 경고한다.
import * as THREE from 'three'
import { LOOK } from './lookConfig'
import { EPOXY_ROUGH_MID, epoxyColorTexture, epoxyRoughnessTexture } from './lookTextures'

export const FLOOR_ANCHORS = {
  reflect: 'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );',
  radiance: 'return envMapColor.rgb * envMapIntensity;',
} as const

/** 반사 방향 줄 뒤에 붙는 상자 맞춤 식: 바닥의 한 점에서 반사 방향으로 나간 선이 건물 상자와 만나는 점을, 반사광을 그린 자리(lookProbe)에서 본 방향으로 바꾼다 */
export const BOX_PROJECT = /* glsl */`
			{ vec3 rd = reflectVec + vec3( 1e-5 ); vec3 t1 = ( lookBoxMax - vLookWorldPos ) / rd; vec3 t2 = ( lookBoxMin - vLookWorldPos ) / rd; vec3 tm = max( t1, t2 ); float tt = min( min( tm.x, tm.y ), tm.z ); reflectVec = normalize( vLookWorldPos + rd * tt - lookProbe ); }`

/** 고친 조각을 돌려준다. 끼울 줄이 하나라도 없으면 null */
export function patchedEnvChunk(chunk: string): string | null {
  if (!chunk.includes(FLOOR_ANCHORS.reflect) || !chunk.includes(FLOOR_ANCHORS.radiance)) return null
  return chunk.replace(FLOOR_ANCHORS.reflect, FLOOR_ANCHORS.reflect + BOX_PROJECT).replace(FLOOR_ANCHORS.radiance, 'return envMapColor.rgb * envMapIntensity * lookReflect;')
}

/**
 * box: 반사를 맞출 건물 상자(바닥 0 ~ 천장), probe: 반사광을 그린 자리, repeat: 바닥 그림 반복 수.
 * 바닥은 상자 안에 있어야 한다(상자 밖의 점은 반사가 어긋난다). 값은 만들 때 정해지므로 바꾸려면 재질을 새로 만든다 — clone()은 고친 셰이더를 옮기지 않는다.
 * 묶어 그리는 메시(InstancedMesh)에는 쓰지 않는다: 점의 자리를 modelMatrix만으로 구한다.
 */
export function makeFloorMaterial(box: { min: THREE.Vector3; max: THREE.Vector3 }, probe: THREE.Vector3, repeat: [number, number]): THREE.MeshStandardMaterial {
  // 광택 그림의 가운데 값이 EPOXY_ROUGH_MID/255라서, 재질 거칠기를 그만큼 키워 실제 거칠기가 LOOK.floorRoughness가 되게 한다
  const mat = new THREE.MeshStandardMaterial({ map: epoxyColorTexture(repeat), roughnessMap: epoxyRoughnessTexture([repeat[0] * 0.77, repeat[1] * 0.77]), roughness: Math.min(1, LOOK.floorRoughness / (EPOXY_ROUGH_MID / 255)), metalness: 0 })
  const chunk = patchedEnvChunk(THREE.ShaderChunk.envmap_physical_pars_fragment)
  if (!chunk) { console.warn('[look] 바닥 반사를 고칠 자리를 찾지 못해 기본 반사로 돌립니다'); return mat }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.lookBoxMin = { value: box.min.clone() }
    shader.uniforms.lookBoxMax = { value: box.max.clone() }
    shader.uniforms.lookProbe = { value: probe.clone() }
    shader.uniforms.lookReflect = { value: LOOK.floorReflect }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLookWorldPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLookWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLookWorldPos;\nuniform vec3 lookBoxMin;\nuniform vec3 lookBoxMax;\nuniform vec3 lookProbe;\nuniform float lookReflect;')
      .replace('#include <envmap_physical_pars_fragment>', chunk)
  }
  mat.customProgramCacheKey = () => 'look-floor'
  return mat
}
