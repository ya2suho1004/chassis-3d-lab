// 시험 배포용 Config.gs 생성 — 스크립트 속성 대신 코드 상수로 설정을 넣는다(Git 제외). 사용: node scripts/write-apps-script-config.mjs <SHEET_ID> <ACCEPT_UNTIL …Z> <MAX_NEW_ROWS>
import { writeFileSync } from 'node:fs'
const [sheetId, acceptUntil, maxRows] = process.argv.slice(2)
if (!sheetId || !acceptUntil || !maxRows) { console.error('usage: node scripts/write-apps-script-config.mjs <SHEET_ID> <ACCEPT_UNTIL> <MAX_NEW_ROWS>'); process.exit(1) }
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(acceptUntil)) { console.error('ACCEPT_UNTIL은 UTC …Z 형식'); process.exit(1) }
const cfg = { SHEET_ID: sheetId, TAB_NAME: 'canonical', ACCEPT_UNTIL: acceptUntil, MAX_NEW_ROWS: String(maxRows), LOCK_WAIT_MS: '10000' }
writeFileSync(new URL('../server/apps-script/Config.gs', import.meta.url), `// 자동 생성(배포용, Git 제외). 스크립트 속성이 비어 있을 때 Code.gs가 읽는다.\nvar CONFIG = ${JSON.stringify(cfg)};\n`)
console.log('Config.gs written')
