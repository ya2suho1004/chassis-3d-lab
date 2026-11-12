// 색 보정 곡선 '부드러운 꺾임'(설계 2026-11-11 §4.2): 꺾임 값까지는 색을 그대로 내보내고, 그보다 밝은 부분만 흰색 쪽으로 눌러 준다.
// 계측부와 화면 색 토큰이 원본대로 보이게 하려는 것이다. 식은 Khronos 중립 곡선의 꺾임 부분과 같고, 어두운 색을 깎는 앞부분이 없다.
// 품질 낮음은 렌더러의 사용자 정의 색 보정으로, 품질 높음은 화면 효과(Effects.tsx)로 같은 식을 쓴다. GLSL 글과 시험용 JS 함수를 같은 상수에서 만든다.
// 렌더러 쪽은 곡선 앞에서 노출 값(toneMappingExposure)을 곱하므로, 두 품질이 같은 색을 내려면 노출이 1이어야 한다(ToneSetup이 1로 둔다).
import * as THREE from 'three'

/** 이 밝기(선형 값)까지는 그대로 내보낸다. 0보다 크고 1보다 작아야 한다. GLSL 글에는 소수 넷째 자리까지 적히므로 그보다 잘게 정하지 않는다 */
export const TONE_KNEE = 0.88
/** 눌린 밝은 색이 흰색 쪽으로 섞이는 세기(GLSL 글에는 소수 넷째 자리까지 적힌다) */
export const TONE_DESATURATION = 0.15

export type Rgb = [number, number, number]

/** GLSL과 같은 식(선형 RGB) */
export function softClip(c: Rgb): Rgb {
  const peak = Math.max(c[0], c[1], c[2])
  if (peak <= TONE_KNEE) return [c[0], c[1], c[2]]
  const d = 1 - TONE_KNEE
  const np = 1 - (d * d) / (peak + d - TONE_KNEE)
  const k = np / peak
  const g = 1 - 1 / (TONE_DESATURATION * (peak - np) + 1)
  const mix = (x: number) => x * k + (np - x * k) * g
  return [mix(c[0]), mix(c[1]), mix(c[2])]
}

/** vec3 color를 받아 돌려주는 GLSL 함수의 몸통(중괄호 없음) */
export const SOFT_CLIP_GLSL = `
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak <= ${TONE_KNEE.toFixed(4)} ) return color;
  float d = ${(1 - TONE_KNEE).toFixed(4)};
  float np = 1.0 - d * d / ( peak + d - ${TONE_KNEE.toFixed(4)} );
  color *= np / peak;
  float g = 1.0 - 1.0 / ( ${TONE_DESATURATION.toFixed(4)} * ( peak - np ) + 1.0 );
  return mix( color, vec3( np ), g );`

/** three.js 셰이더 조각에 있는 빈 사용자 정의 함수. 이 줄을 곡선으로 바꿔 끼운다 */
export const TONE_ANCHOR = 'vec3 CustomToneMapping( vec3 color ) { return color; }'
/** 끼운 뒤의 함수 글 */
const TONE_PATCHED = `vec3 CustomToneMapping( vec3 color ) {\n  color *= toneMappingExposure;${SOFT_CLIP_GLSL}\n}`

let installed: THREE.ToneMapping | null = null

/** 곡선을 한 번만 끼우고, renderer.toneMapping에 넣을 값을 돌려준다. 끼울 줄이 없으면(three.js가 바뀜) 경고하고 three.js의 중립 곡선으로 돌린다 */
export function installToneCurve(): THREE.ToneMapping {
  if (installed !== null) return installed
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment
  // 이 모듈만 다시 불린 경우(개발 서버에서 이 파일을 다시 읽을 때 등): three.js에는 이미 끼워져 있으니 그대로 쓴다
  if (chunk.includes(TONE_PATCHED)) { installed = THREE.CustomToneMapping; return installed }
  if (!chunk.includes(TONE_ANCHOR)) {
    console.warn('[look] 색 보정 곡선을 끼울 자리를 찾지 못해 three.js 중립 곡선으로 돌립니다')
    installed = THREE.NeutralToneMapping
    return installed
  }
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(TONE_ANCHOR, () => TONE_PATCHED)
  installed = THREE.CustomToneMapping
  return installed
}
