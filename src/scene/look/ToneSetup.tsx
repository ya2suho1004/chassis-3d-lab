// 렌더러에 색 보정 곡선을 건다(설계 2026-11-11 §4.2). 품질 높음에서는 화면 효과가 렌더러 쪽 보정을 끄고 같은 곡선을 맨 끝에 건다.
import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { installToneCurve } from './toneCurve'

export function ToneSetup() {
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => { gl.toneMapping = installToneCurve(); gl.toneMappingExposure = 1 }, [gl])
  return null
}
