// 3D 자료 버전 꼬리표 생성(2026-11-03): public/assets/{models,hdri}의 파일마다 내용 해시(앞 10자)를 src/data/assetVersions.json에 쓴다.
// 공개 주소는 /assets/* 를 1년 immutable로 캐시하므로(vercel.json), 앱은 `?v=해시`를 붙여 내용이 바뀐 파일만 새로 받게 한다.
// npm run build 전에 prebuild로 자동 실행된다. tests/assetVersions.test.ts가 저장된 값이 최신인지 검사한다.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('../public/assets/', import.meta.url)
export function computeAssetVersions() {
  const out = {}
  for (const dir of ['models', 'hdri']) {
    for (const f of readdirSync(new URL(dir + '/', ROOT)).filter((n) => !n.startsWith('.')).sort()) {
      out[`${dir}/${f}`] = createHash('sha256').update(readFileSync(new URL(`${dir}/${f}`, ROOT))).digest('hex').slice(0, 10)
    }
  }
  return out
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const v = computeAssetVersions()
  writeFileSync(new URL('../src/data/assetVersions.json', import.meta.url), JSON.stringify(v, null, 2) + '\n')
  console.log('asset versions', Object.keys(v).length)
}
