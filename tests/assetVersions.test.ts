// 3D 자료 버전 꼬리표(2026-11-03): /assets/* 는 1년 immutable 캐시 → 내용이 바뀐 파일만 새로 받게 ?v=내용해시를 붙인다.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { computeAssetVersions } from '../scripts/build-asset-versions.mjs'
import versions from '../src/data/assetVersions.json'
import { assetUrl } from '../src/app/assetUrl'

describe('자료 버전 꼬리표', () => {
  test('저장된 꼬리표가 지금 파일 내용과 같다(모델을 바꾸면 npm run build 또는 node scripts/build-asset-versions.mjs)', () => {
    expect(versions).toEqual(computeAssetVersions())
  })
  test('모델·HDRI 주소에 내용 해시 꼬리표가 붙는다', () => {
    expect(assetUrl('models/k3.glb')).toMatch(/assets\/models\/k3\.glb\?v=[0-9a-f]{10}$/)
    expect(assetUrl('hdri/autoshop_01_1k.hdr')).toMatch(/\?v=[0-9a-f]{10}$/)
    expect(assetUrl('models/없는파일.glb')).toMatch(/assets\/models\/없는파일\.glb$/)
  })
  test('소스에 꼬리표 없는 자료 주소(BASE_URL}assets/)가 남아 있지 않다', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []))
    const bad = walk('src').filter((f) => !f.endsWith('assetUrl.ts') && readFileSync(f, 'utf8').includes('BASE_URL}assets/'))
    expect(bad).toEqual([])
  })
})
