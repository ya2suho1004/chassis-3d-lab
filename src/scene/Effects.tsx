// 품질 높음 화면 효과(설계 2026-11-11 §4.7): 구석 그늘(AO) · 빛 번짐(밝기 1.2를 넘는 광원·강한 반사만) · 색 보정 곡선 · 계단 현상 줄이기 · 가장자리 어둡게.
// 첫 화면 내려받기를 줄이려고 따로 나눠 품질 높음일 때만 불러온다(태블릿 품질 낮음은 내려받지 않음). postprocessing을 들여오는 파일은 이것 하나여야 한다.
import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from '@react-three/postprocessing'
import { Effect } from 'postprocessing'
import { useMemo } from 'react'
import { LOOK, PALETTE } from './look/lookConfig'
import { SOFT_CLIP_GLSL } from './look/toneCurve'

/** 렌더러의 사용자 정의 색 보정과 같은 식(toneCurve.ts). 화면 효과를 쓰면 렌더러 쪽 보정이 꺼지므로 맨 끝에서 한 번 건다 */
class SoftClipEffect extends Effect {
  constructor() {
    super('SoftClipEffect', /* glsl */`
vec3 lookSoftClip( vec3 color ) {${SOFT_CLIP_GLSL}
}
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) { outputColor = vec4( lookSoftClip( max( inputColor.rgb, vec3( 0.0 ) ) ), inputColor.a ); }`)
  }
}

export default function Effects() {
  // 이 효과는 GPU 자원을 따로 쥐지 않는다(셰이더는 효과 묶음이 갖는다). dispose={null}은 R3F가 이 객체를 건드리지 않게 하는 표시다
  const softClip = useMemo(() => new SoftClipEffect(), [])
  return (
    <EffectComposer multisampling={0}>
      <N8AO halfRes aoRadius={LOOK.aoRadius} intensity={LOOK.aoIntensity} distanceFalloff={0.9} color={PALETTE.aoTint} />
      <Bloom mipmapBlur luminanceThreshold={LOOK.bloomThreshold} luminanceSmoothing={0.2} intensity={LOOK.bloom} radius={0.72} />
      <primitive object={softClip} dispose={null} />
      <SMAA />
      <Vignette offset={LOOK.vignetteOffset} darkness={LOOK.vignette} />
    </EffectComposer>
  )
}
