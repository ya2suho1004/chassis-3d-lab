// 주된 빛 하나(설계 2026-11-11 §4.3): 남서쪽 위에서 드는 옅은 따뜻한 빛. 그림자 범위를 실습장 전체에 맞춘다.
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BAKE, LOOK, PALETTE, SHADOW_MAP_SIZE, fitShadowFrustum, keyDirection, type Bounds } from './lookConfig'

export function KeyLight({ bounds, castShadow }: { bounds: Bounds; castShadow: boolean }) {
  const ref = useRef<THREE.DirectionalLight>(null)
  const fit = useMemo(() => fitShadowFrustum(bounds, BAKE.casterHeight, keyDirection()), [bounds])
  useLayoutEffect(() => {
    const l = ref.current
    if (!l) return
    l.position.set(...fit.position)
    l.target.position.set(...fit.target)
    l.target.updateMatrixWorld()
    const cam = l.shadow.camera
    cam.left = fit.left; cam.right = fit.right; cam.bottom = fit.bottom; cam.top = fit.top; cam.near = fit.near; cam.far = fit.far
    cam.updateProjectionMatrix()
    l.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
    l.shadow.radius = LOOK.shadowRadius
    l.shadow.bias = LOOK.shadowBias
    l.shadow.normalBias = LOOK.shadowNormalBias
    l.shadow.needsUpdate = true
  }, [fit])
  return <directionalLight ref={ref} color={PALETTE.key} intensity={LOOK.key} castShadow={castShadow} />
}
