// 3D 자료 버전 꼬리표(2026-11-03): /assets/* 는 1년 immutable 캐시 → 내용이 바뀐 파일만 새로 받게 ?v=내용해시를 붙인다.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'
import { computeAssetVersions } from '../scripts/build-asset-versions.mjs'
import versions from '../src/data/assetVersions.json'
import { assetUrl } from '../src/app/assetUrl'

describe('자료 버전 꼬리표', () => {
  test('저장된 꼬리표가 지금 파일 내용과 같다(모델을 바꾸면 npm run build 또는 node scripts/build-asset-versions.mjs)', () => {
    expect(versions).toEqual(computeAssetVersions())
  })
  test('모델 주소에 내용 해시 꼬리표가 붙는다(정비소 HDRI 꼬리표는 없다)', () => {
    expect(assetUrl('models/k3.glb')).toMatch(/assets\/models\/k3\.glb\?v=[0-9a-f]{10}$/)
    expect(Object.keys(versions).some((k) => k.startsWith('hdri/'))).toBe(false)
    expect(assetUrl('models/없는파일.glb')).toMatch(/assets\/models\/없는파일\.glb$/)
  })
  test('자료 폴더를 이름으로 적어 두지 않고 있는 대로 훑는다(새 폴더를 더해도 꼬리표가 빠지지 않는다)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'asset-versions-'))
    try {
      for (const d of ['models', 'sounds', '.cache']) mkdirSync(join(dir, d))
      writeFileSync(join(dir, 'models', 'a.glb'), 'A'); writeFileSync(join(dir, 'sounds', 'b.ogg'), 'B')
      // 점으로 시작하는 폴더·파일과 맨 위의 파일은 자료가 아니다
      writeFileSync(join(dir, 'sounds', '.DS_Store'), 'x'); writeFileSync(join(dir, '.cache', 'c.bin'), 'C'); writeFileSync(join(dir, 'README.txt'), 'top')
      const v = computeAssetVersions(pathToFileURL(dir + '/'))
      expect(Object.keys(v)).toEqual(['models/a.glb', 'sounds/b.ogg'])
      expect(v['models/a.glb']).toMatch(/^[0-9a-f]{10}$/)
      expect(v['sounds/b.ogg']).not.toBe(v['models/a.glb'])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  test('소스에 꼬리표 없는 자료 주소(BASE_URL}assets/)가 남아 있지 않다', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []))
    const bad = walk('src').filter((f) => !f.endsWith('assetUrl.ts') && readFileSync(f, 'utf8').includes('BASE_URL}assets/'))
    expect(bad).toEqual([])
  })
})
