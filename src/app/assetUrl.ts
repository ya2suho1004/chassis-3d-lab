// 3D 자료 주소 + 내용 해시 꼬리표(scripts/build-asset-versions.mjs가 만든 src/data/assetVersions.json).
// /assets/* 는 1년 캐시라, 꼬리표가 바뀐 파일만 기기가 새로 받는다. 목록에 없는 파일은 꼬리표 없이 쓴다.
import versions from '../data/assetVersions.json'

const V = versions as Record<string, string>

/** rel 예: 'models/k3.glb', 'hdri/autoshop_01_1k.hdr' */
export function assetUrl(rel: string): string {
  const v = V[rel]
  return `${import.meta.env.BASE_URL}assets/${rel}${v ? `?v=${v}` : ''}`
}
