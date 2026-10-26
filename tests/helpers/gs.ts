// Apps Script(.gs) 파일을 Node에서 평가하는 도우미 — 전역 서비스(SpreadsheetApp 등)는 테스트가 주입한다.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

export function loadGs(files: string[], globals: Record<string, unknown> = {}): Record<string, any> {
  const src = files.map((f) => readFileSync(resolve(process.cwd(), 'server/apps-script', f), 'utf8')).join('\n')
  const names = Object.keys(globals)
  // 함수 선언을 밖으로 꺼내기 위해 마지막에 수집한다. .gs는 전역 함수 선언 스타일이므로 이름 목록을 정규식으로 뽑는다.
  const fnNames = Array.from(src.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)).map((m) => m[1])
  const varNames = Array.from(src.matchAll(/^var\s+([A-Za-z_$][\w$]*)\s*=/gm)).map((m) => m[1])
  const body = src + '\nreturn {' + [...fnNames, ...varNames].map((n) => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(',') + '};'
  const fn = new Function(...names, body)
  return fn(...names.map((n) => globals[n]))
}

/** Utilities 최소 모의: computeDigest(SHA_256, string, UTF_8) → byte[] (부호 있는 8비트, Apps Script와 동일) */
export const fakeUtilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  computeDigest(_algo: string, value: string, _charset?: string) {
    const buf = createHash('sha256').update(Buffer.from(value, 'utf8')).digest()
    return Array.from(buf).map((b: number) => (b > 127 ? b - 256 : b))
  },
  newBlob(value: string) { return { getBytes: () => Array.from(Buffer.from(value, 'utf8')).map((b: number) => (b > 127 ? b - 256 : b)) } },
  getUuid() { return '11111111-2222-4333-8444-555555555555' },
}
