// 품질 높음 화면 효과: 구석 그늘(AO) · 색 보정(ACES) · 계단 현상 줄이기 · 가장자리 어둡게.
// 첫 화면 내려받기를 줄이려고 따로 나눠 품질 높음일 때만 불러온다(태블릿 품질 낮음은 내려받지 않음).
import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'

export default function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO halfRes aoRadius={0.8} intensity={2.2} distanceFalloff={0.8} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
      <Vignette offset={0.32} darkness={0.42} />
    </EffectComposer>
  )
}
