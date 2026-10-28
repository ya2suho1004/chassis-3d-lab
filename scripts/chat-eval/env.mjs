// .env.local(git 제외)을 읽어 process.env에 넣는다. 값은 화면·파일에 출력하지 않는다.
import { existsSync, readFileSync } from 'node:fs'
const p = new URL('../../.env.local', import.meta.url)
if (existsSync(p)) {
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
