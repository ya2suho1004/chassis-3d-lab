// 실습장 반사광(설계 2026-11-11 §4.3): 정비소 사진 대신, 실습장 가운데에서 건물 껍데기(천장·조명판·벽·바닥)만 한 번 그려 쓴다.
// 두 품질이 같은 반사광을 쓰고 내려받는 파일이 없다. 장비와 사람은 넣지 않는다.
import { Environment, Lightformer } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { memo, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { SceneLayout } from '../layoutModel'
import { CEILING_H, hallBounds, lightPanels } from '../Surroundings'
import { LOOK } from './lookConfig'
import { glowTexture } from './lookTextures'

/** 반사광을 그리는 자리: 주 구역 가운데, 높이 1.4 m */
export function probePoint(layout: Pick<SceneLayout, 'mainZone'>): THREE.Vector3 {
  const mz = layout.mainZone
  return new THREE.Vector3((mz.xMin + mz.xMax) / 2, 1.4, (mz.zMin + mz.zMax) / 2)
}

/** 반사광 속 면의 밝기(선형 RGB). 실습장 바닥은 채도를 낮춘다 — 그대로 두면 크롬 부품이 초록으로 물든다 */
export const ENV_SHELL = {
  ceiling: [0.55, 0.54, 0.51], wall: [0.74, 0.72, 0.68], wallFar: [0.36, 0.35, 0.33], hallFloor: [0.22, 0.21, 0.2], labFloor: [0.05, 0.12, 0.085],
} as const

/**
 * drei의 Environment는 넘겨받은 내용(children)이 새 것으로 바뀔 때마다 여섯 면을 다시 그리고 반사용 그림도 다시 만든다.
 * 부모(LabScene)는 학생이 걷는 동안 초당 네 번쯤 다시 그려지므로, 내용이 그대로면 같은 것을 넘기도록 묶어 둔다(memo + useMemo).
 * 다시 그리는 때는 배치나 해상도(품질)가 바뀔 때, 그리고 그래픽 장치 연결이 끊겼다 돌아온 때뿐이다 — 촬영 도구의 walk·ctx 검사가 본다.
 */
export const WorkshopEnv = memo(function WorkshopEnv({ layout, resolution }: { layout: SceneLayout; resolution: number }) {
  const b = useMemo(() => hallBounds(layout), [layout])
  const p = useMemo(() => probePoint(layout), [layout])
  const panels = useMemo(() => lightPanels(b), [b])
  const glow = useMemo(() => glowTexture('rgb'), [])
  const mats = useMemo(() => {
    const m = (c: readonly [number, number, number]) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(c[0], c[1], c[2]), side: THREE.DoubleSide, toneMapped: false })
    return { ceiling: m(ENV_SHELL.ceiling), wall: m(ENV_SHELL.wall), wallFar: m(ENV_SHELL.wallFar), hallFloor: m(ENV_SHELL.hallFloor), labFloor: m(ENV_SHELL.labFloor) }
  }, [])
  const shell = useMemo(() => {
    const mz = layout.mainZone
    const w = b.xMax - b.xMin, d = b.zMax - b.zMin, cx = (b.xMin + b.xMax) / 2, cz = (b.zMin + b.zMax) / 2
    // 실제 좌표로 놓고 통째로 옮겨, 그리는 자리(p)가 원점에 오게 한다
    return (
      <group position={[-p.x, -p.y, -p.z]}>
        <mesh material={mats.ceiling} rotation-x={Math.PI / 2} position={[cx, CEILING_H, cz]}><planeGeometry args={[w, d]} /></mesh>
        <mesh material={mats.hallFloor} rotation-x={-Math.PI / 2} position={[cx, -0.01, cz]}><planeGeometry args={[w, d]} /></mesh>
        <mesh material={mats.labFloor} rotation-x={-Math.PI / 2} position={[(mz.xMin + mz.xMax) / 2, 0, (mz.zMin + mz.zMax) / 2]}><planeGeometry args={[mz.xMax - mz.xMin, mz.zMax - mz.zMin]} /></mesh>
        {/* 벽: 북·동(실습장 쪽, 밝게), 서·남(건물 먼 쪽, 어둡게) */}
        <mesh material={mats.wall} position={[cx, CEILING_H / 2, b.zMin]}><planeGeometry args={[w, CEILING_H]} /></mesh>
        <mesh material={mats.wall} rotation-y={Math.PI / 2} position={[b.xMax, CEILING_H / 2, cz]}><planeGeometry args={[d, CEILING_H]} /></mesh>
        <mesh material={mats.wallFar} rotation-y={Math.PI / 2} position={[b.xMin, CEILING_H / 2, cz]}><planeGeometry args={[d, CEILING_H]} /></mesh>
        <mesh material={mats.wallFar} position={[cx, CEILING_H / 2, b.zMax]}><planeGeometry args={[w, CEILING_H]} /></mesh>
        {panels.map(([x, z]) => <Lightformer key={`${x},${z}`} form="rect" map={glow} intensity={LOOK.envPanel} color="#fffaf0" position={[x, CEILING_H - 0.02, z]} rotation-x={Math.PI / 2} scale={[2.3, 0.95, 1]} />)}
      </group>
    )
  }, [layout, b, p, panels, glow, mats])
  // 그래픽 장치 연결이 끊겼다 돌아오면(기기 메모리가 모자랄 때 등) 그려 둔 반사광이 비어 있다. 새로 붙여 다시 그리게 한다
  const gl = useThree((s) => s.gl)
  const [restored, setRestored] = useState(0)
  useEffect(() => {
    const el = gl.domElement, again = () => setRestored((n) => n + 1)
    el.addEventListener('webglcontextrestored', again)
    return () => el.removeEventListener('webglcontextrestored', again)
  }, [gl])
  return <Environment key={restored} resolution={resolution} frames={1} near={0.1} far={200} environmentIntensity={LOOK.env}>{shell}</Environment>
})
