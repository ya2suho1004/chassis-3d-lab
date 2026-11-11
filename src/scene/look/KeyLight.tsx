// 주된 빛 하나(설계 2026-11-11 §4.3): 남서쪽 위에서 드는 옅은 따뜻한 빛. 그림자 범위를 실습장 전체에 맞춘다.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
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
  // 실시간 그림자를 끄면(품질 낮음으로 바뀜) 그림자 그림(2048² 한 장)을 내려놓는다 — three.js는 꺼도 쥐고 있고, 다시 켜면 새로 만든다
  useEffect(() => {
    const l = ref.current
    if (l && !castShadow && l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null }
  }, [castShadow])
  return <directionalLight ref={ref} color={PALETTE.key} intensity={LOOK.key} castShadow={castShadow} />
}
