// Apps Script 서비스 모의 — SpreadsheetApp(메모리 2차원 배열)·LockService·PropertiesService·ContentService
export function fakeSheetServices(opts: { props?: Record<string, string>; lockBusy?: () => boolean; failFlush?: () => boolean } = {}) {
  const rows: unknown[][] = [['recordId', 'receiptId', 'acceptedAt', 'payloadHash', 'payloadJson']]
  let flushes = 0
  const sheet = {
    getName: () => opts.props?.TAB_NAME ?? 'canonical',
    getLastRow: () => rows.length,
    getLastColumn: () => 5,
    getRange(r: number, c: number, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? '')),
        setValues(vals: unknown[][]) { for (let i = 0; i < nr; i++) { rows[r - 1 + i] = rows[r - 1 + i] ?? []; for (let j = 0; j < nc; j++) rows[r - 1 + i]![c - 1 + j] = vals[i]![j] } },
        setNumberFormat() { return this },
      }
    },
  }
  const spreadsheet = { getSheetByName: (n: string) => (n === (opts.props?.TAB_NAME ?? 'canonical') ? sheet : null) }
  const SpreadsheetApp = { openById: (id: string) => { if (id !== (opts.props?.SHEET_ID ?? 'SHEET-TEST')) throw new Error('not found'); return spreadsheet }, flush: () => { flushes++; if (opts.failFlush?.()) throw new Error('flush failed') } }
  const lock = { acquired: 0, released: 0, tryLock: (_ms: number) => { if (opts.lockBusy?.()) return false; lock.acquired++; return true }, waitLock: (_ms: number) => { if (opts.lockBusy?.()) throw new Error('busy'); lock.acquired++ }, releaseLock: () => { lock.released++ }, hasLock: () => lock.acquired > lock.released }
  const LockService = { getScriptLock: () => lock }
  const PropertiesService = { getScriptProperties: () => ({ getProperty: (k: string) => opts.props?.[k] ?? null, getProperties: () => ({ ...(opts.props ?? {}) }) }) }
  const outputs: Array<{ text: string; mime: string }> = []
  const ContentService = { MimeType: { JSON: 'application/json' }, createTextOutput: (t: string) => { const o = { text: t, mime: '', setMimeType(m: string) { o.mime = m; outputs.push({ text: t, mime: m }); return o } }; return o } }
  const Logger = { log: () => {} }
  return { SpreadsheetApp, LockService, PropertiesService, ContentService, Logger, rows, lock, outputs, flushes: () => flushes }
}
