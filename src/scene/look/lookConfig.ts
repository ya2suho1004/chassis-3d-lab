// 실습장 빛·재질 값(설계 docs/superpowers/specs/2026-11-11-light-and-material-design.md §4). 값은 이 파일 한 곳에만 둔다.
// 채점·기록과 무관한 겉모습 값이고, 과제 진행에 따라 바뀌는 값은 없다(안내 없음 원칙).
import * as THREE from 'three'
import type { SceneLayout } from '../layoutModel'

export interface Bounds { xMin: number; xMax: number; zMin: number; zMax: number }

/** 숫자 값. 개발 서버에서는 주소 인자 ?look=이름:값,이름:값 으로 덮어써 볼 수 있다(운영 묶음에는 없음) */
export const LOOK_DEFAULTS = {
  /** 주된 빛: 세기, 바닥에서 올려다본 각(도), 남쪽에서 동쪽으로 잰 방위(도 — 음수는 서쪽으로 돌아감) */
  key: 3.7, keyElevationDeg: 50, keyAzimuthDeg: -22,
  /** 반구광 세기와 품질 낮음 배수(구석 그늘이 없는 만큼 조금 밝게) */
  hemi: 0.55, hemiLowBoost: 1.15,
  /** 실습장 반사광 세기, 반사광 속 조명판 밝기 */
  env: 0.32, envPanel: 11,
  /** 바닥 거칠기, 바닥 반사 배수 */
  floorRoughness: 0.3, floorReflect: 1,
  /** 구운 그림자 세기: 주된 빛 그림자, 닿는 그늘(낮음·높음 — 높음은 실시간 그림자와 겹쳐 약하게), 빛의 퍼짐 각(도) */
  sunShadow: 0.6, contactShadow: 0.5, contactShadowHigh: 0.4, shadowSoftDeg: 4.5,
  /** 실시간 그림자(품질 높음) */
  shadowRadius: 2.6, shadowBias: -0.0006, shadowNormalBias: 0.06,
  /** 조명판 둘레 빛 판 세기(낮음·높음 — 높음은 화면 효과 빛 번짐이 더해져 약하게) */
  haloLow: 0.3, haloHigh: 0.18,
  /** 화면 효과(품질 높음) */
  aoRadius: 1, aoIntensity: 2.6, bloomThreshold: 1.2, bloom: 0.5, vignetteOffset: 0.3, vignette: 0.45,
}
export type LookValues = typeof LOOK_DEFAULTS

/** "이름:값,이름:값"에서 아는 이름·숫자 값만 받아 덮어쓴 새 값 표를 돌려준다 */
export function withOverrides(base: LookValues, spec: string | null): LookValues {
  if (!spec) return base
  const out: LookValues = { ...base }
  for (const part of spec.split(',')) {
    const [k, raw] = part.split(':')
    const n = Number(raw)
    if (k && k in base && raw !== undefined && raw.trim() !== '' && Number.isFinite(n)) out[k as keyof LookValues] = n
  }
  return out
}

export const LOOK: LookValues = import.meta.env.DEV && typeof location !== 'undefined' ? withOverrides(LOOK_DEFAULTS, new URLSearchParams(location.search).get('look')) : LOOK_DEFAULTS

export const PALETTE = {
  key: '#fff1e0', sky: '#e8f0ff', ground: '#3f5a46',
  floor: '#22774c', line: '#2f9e68',
  wallUp: '#eeebe4', wallLow: '#8e9a96', hallWall: '#d5cfc5', hallWallLow: '#9a9288', hallFloor: '#b5afa6',
  ceiling: '#d6d1c8', halo: '#fff6e6', background: '#c9c1b5', shadow: '#07180f', aoTint: '#0a1711',
} as const
/** 조명판 색(밝기 1을 넘는 선형 값 — 품질 높음에서 빛 번짐이 걸린다) */
export const PANEL_RGB = [2.6, 2.45, 2.2] as const
export const FOG = { near: 20, far: 62 } as const
export const SHADOW_MAP_SIZE = 2048
/** 구운 바닥 그림자: 그림 크기, 드리우는 물체 최고 높이(m), 닿는 그늘을 보는 높이(m), 가장자리 폭 범위(m), 굽기 전 기다림(ms).
 *  처음은 로딩 화면이 걷히기 전(불러오기 끝 + 0.4초, LabScreen)에 굽도록 짧게, 다시 굽기는 리프트·차량 움직임이 끝나도록 길게 */
export const BAKE = { size: 1024, depthSize: 2048, contactSize: 512, casterHeight: 4.4, contactFar: 2.2, minPenumbra: 0.02, maxPenumbra: 0.5, firstDelayMs: 150, rebakeDelayMs: 2500 } as const

export interface TierLook { realtimeShadows: boolean; postEffects: boolean; envResolution: number; hemi: number; halo: number; sunShadow: number; contactShadow: number }

/** 품질별 구성(설계 §4.1). 낮음에는 실시간 그림자·화면 효과가 없고, 주된 빛 그림자를 구워서 깐다 */
export function lookFor(lowSpec: boolean, v: LookValues = LOOK): TierLook {
  return lowSpec
    ? { realtimeShadows: false, postEffects: false, envResolution: 128, hemi: v.hemi * v.hemiLowBoost, halo: v.haloLow, sunShadow: v.sunShadow, contactShadow: v.contactShadow }
    : { realtimeShadows: true, postEffects: true, envResolution: 256, hemi: v.hemi, halo: v.haloHigh, sunShadow: 0, contactShadow: v.contactShadowHigh }
}

/** 주된 빛이 있는 쪽을 가리키는 단위 벡터(x = 동, y = 위, z = 남) */
export function keyDirection(v: LookValues = LOOK): THREE.Vector3 {
  const el = (v.keyElevationDeg * Math.PI) / 180, az = (v.keyAzimuthDeg * Math.PI) / 180
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize()
}

/** 실습장 구역들(주 구역, 있으면 ABS 구역) */
export function labZones(layout: Pick<SceneLayout, 'mainZone' | 'absProtrusion'>): Bounds[] {
  return [layout.mainZone, ...(layout.absProtrusion ? [layout.absProtrusion] : [])].map((z) => ({ xMin: z.xMin, xMax: z.xMax, zMin: z.zMin, zMax: z.zMax }))
}

/** 그림자가 닿아야 하는 바닥 범위: 주 구역과 ABS 구역을 함께 담는 직사각형 */
export function labBounds(layout: Pick<SceneLayout, 'mainZone' | 'absProtrusion'>): Bounds {
  const zones = labZones(layout)
  return { xMin: Math.min(...zones.map((z) => z.xMin)), xMax: Math.max(...zones.map((z) => z.xMax)), zMin: Math.min(...zones.map((z) => z.zMin)), zMax: Math.max(...zones.map((z) => z.zMax)) }
}

export interface ShadowFrustum { position: [number, number, number]; target: [number, number, number]; left: number; right: number; bottom: number; top: number; near: number; far: number }

/**
 * 빛 쪽(dir)에서 본 직교 카메라가 범위 상자(바닥 범위 × 높이 0~height)를 딱 담게 맞춘다.
 * three.js 카메라와 같은 규칙: 카메라는 -z를 보고, 위는 +y. dir이 수직이면 안 된다.
 */
export function fitShadowFrustum(bounds: Bounds, height: number, dir: THREE.Vector3, distance = 40, margin = 0.5): ShadowFrustum {
  const target = new THREE.Vector3((bounds.xMin + bounds.xMax) / 2, 0, (bounds.zMin + bounds.zMax) / 2)
  const position = target.clone().addScaledVector(dir, distance)
  const view = new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0)).setPosition(position).invert()
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const x of [bounds.xMin, bounds.xMax]) for (const z of [bounds.zMin, bounds.zMax]) for (const y of [0, height]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(view)
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z)
  }
  return { position: [position.x, position.y, position.z], target: [target.x, target.y, target.z], left: x0 - margin, right: x1 + margin, bottom: y0 - margin, top: y1 + margin, near: Math.max(0.5, -z1 - 1), far: -z0 + 1 }
}
