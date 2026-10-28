// 개발 전용 가짜 수신점 — Apps Script 코드(archive/apps-script/*.gs)를 그대로 Node에서 돌려 메모리 시트에 쓴다.
// 운영 배포에 포함하지 않는다(설계 15 §8 D07 "시험 장치는 운영 배포에 포함하지 않음"). vite dev 서버의 /__fake-submit 에만 붙는다.
// 제어: GET /__fake-submit/control?mode=normal|html|badhash|drop|lockbusy  (다음 POST 1회에 적용)
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

type Mode = 'normal' | 'html' | 'badhash' | 'drop' | 'lockbusy'

export function createFakeSubmitServer(root: string) {
  const rows: unknown[][] = [['recordId', 'receiptId', 'acceptedAt', 'payloadHash', 'payloadJson']]
  let nextMode: Mode = 'normal'
  let seq = 0
  const props: Record<string, string> = { SHEET_ID: 'FAKE', TAB_NAME: 'canonical', ACCEPT_UNTIL: '2027-12-31T00:00:00Z', MAX_NEW_ROWS: '500', LOCK_WAIT_MS: '100' } // 허용 스냅샷은 DemoSnapshots.gs
  const sheet = {
    getLastRow: () => rows.length,
    getRange(r: number, c: number, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? '')),
        setValues(vals: unknown[][]) { for (let i = 0; i < nr; i++) { rows[r - 1 + i] = rows[r - 1 + i] ?? []; for (let j = 0; j < nc; j++) rows[r - 1 + i]![c - 1 + j] = vals[i]![j] } },
        setNumberFormat() { return this },
      }
    },
  }
  const toSigned = (b: number) => (b > 127 ? b - 256 : b)
  const globals: Record<string, unknown> = {
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush: () => {} },
    LockService: { getScriptLock: () => ({ tryLock: () => nextMode !== 'lockbusy', releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (t: string) => ({ text: t, setMimeType() { return this } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_a: string, v: string) => Array.from(createHash('sha256').update(Buffer.from(v, 'utf8')).digest()).map(toSigned),
      newBlob: (v: string) => ({ getBytes: () => Array.from(Buffer.from(v, 'utf8')).map(toSigned) }),
      getUuid: () => `fake-receipt-${String(++seq).padStart(4, '0')}`,
    },
    Logger: { log: () => {} },
  }
  const src = ['Jcs.gs', 'JsonStrict.gs', 'Validate.gs', 'Schemas.gs', 'DemoSnapshots.gs', 'Code.gs'].map((f) => readFileSync(resolve(root, 'archive/apps-script', f), 'utf8')).join('\n')
  const names = Object.keys(globals)
  const doPost = new Function(...names, src + '\nreturn doPost;')(...names.map((n) => globals[n])) as (e: unknown) => { text: string }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = req.url ?? ''
    if (!url.startsWith('/__fake-submit')) return false
    if (url.startsWith('/__fake-submit/control')) {
      const m = new URL(url, 'http://x').searchParams.get('mode') as Mode | null
      if (m) nextMode = m
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ nextMode, rows: rows.length - 1 })); return true
    }
    if (url.startsWith('/__fake-submit/rows')) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(rows)); return true }
    if (req.method !== 'POST') { res.statusCode = 405; res.end(); return true }
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = Buffer.concat(chunks).toString('utf8')
    const mode = nextMode; nextMode = 'normal'
    const out = doPost({ postData: { contents: body, type: req.headers['content-type'] ?? '', length: body.length } })
    if (mode === 'drop') { res.destroy(); return true } // D04: 저장 뒤 응답 유실
    if (mode === 'html') { res.statusCode = 200; res.setHeader('content-type', 'text/html'); res.end('<html><body>Sign in</body></html>'); return true }
    let text = out.text
    if (mode === 'badhash') { const j = JSON.parse(text); if (j.ok) j.payloadHash = 'f'.repeat(64); text = JSON.stringify(j) }
    res.statusCode = 200; res.setHeader('content-type', 'application/json'); res.end(text); return true
  }
}
