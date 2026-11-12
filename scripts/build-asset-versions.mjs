// 3D 자료 버전 꼬리표 생성(2026-11-03): public/assets 아래 폴더(지금은 models 하나)의 파일마다 내용 해시(앞 10자)를 src/data/assetVersions.json에 쓴다.
// (정비소 HDRI는 2026-11-11부터 쓰지 않는다 — 반사광을 실습장 자체로 만든다)
// 공개 주소는 /assets/* 를 1년 immutable로 캐시하므로(vercel.json), 앱은 `?v=해시`를 붙여 내용이 바뀐 파일만 새로 받게 한다.
// npm run build 전에 prebuild로 자동 실행된다. tests/assetVersions.test.ts가 저장된 값이 최신인지 검사한다.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('../public/assets/', import.meta.url)
/** root 아래 폴더마다 파일의 내용 해시 앞 10자. 폴더 이름을 적어 두지 않고 있는 폴더를 모두 훑는다 — 새 자료 폴더를 더했을 때 꼬리표 없이 나가 1년 캐시에 묶이는 일을 막는다 */
export function computeAssetVersions(root = ROOT) {
  const out = {}
  const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name).sort()
  for (const dir of dirs) {
    for (const f of readdirSync(new URL(dir + '/', root)).filter((n) => !n.startsWith('.')).sort()) {
      out[`${dir}/${f}`] = createHash('sha256').update(readFileSync(new URL(`${dir}/${f}`, root))).digest('hex').slice(0, 10)
    }
  }
  return out
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const v = computeAssetVersions()
  writeFileSync(new URL('../src/data/assetVersions.json', import.meta.url), JSON.stringify(v, null, 2) + '\n')
  console.log('asset versions', Object.keys(v).length)
}
