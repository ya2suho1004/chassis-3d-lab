// 수신 규칙 코어 생성 — archive/apps-script의 검증된 .gs 소스(Codex 검토 A~I 통과)를 손대지 않고 묶어 ES 모듈로 만든다.
// 출력: supabase/functions/_shared/receiverCore.generated.js (Deno Edge Function과 Node 시험이 같은 파일을 쓴다)
// Apps Script 전용 전역(Utilities)은 node:crypto·TextEncoder 심으로 바꾼다. 시트·잠금(Code.gs의 doPost/acceptInLock_)은 쓰지 않고 submitCore.ts가 대신한다.
// 사용: node scripts/build-receiver-core.mjs   (tests/receiverCoreFresh.test.ts가 최신인지 검사)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SRC = ['Jcs.gs', 'JsonStrict.gs', 'Validate.gs', 'Schemas.gs', 'DemoSnapshots.gs', 'Code.gs']
const EXPORTS = [
  'parseJsonStrict', 'validateRequestEnvelope', 'validateAgainst', 'validateRecordSemantics_', 'validateStepEvents_',
  'jcsCanonicalize', 'jcsSha256Hex', 'utf8ByteLength_', 'isValidUtcDateTime_', 'sessionAllowed_',
  'RECORD_SCHEMAS', 'ALLOWED_SNAPSHOTS', 'UUID_RE', 'HEX64_RE', 'PROTOCOL_VERSION', 'SUPPORTED_RECORD_VERSIONS',
  'REQUEST_MAX_BYTES', 'CANONICAL_MAX_BYTES', 'MAX_STEP_EVENTS',
]
const PREAMBLE = `// 자동 생성: node scripts/build-receiver-core.mjs — 직접 고치지 말 것. 원본: archive/apps-script/${SRC.join(', ')}
// @ts-nocheck
import { createHash } from 'node:crypto'
var Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
  computeDigest: function (_a, value) { return Array.from(createHash('sha256').update(value, 'utf8').digest()).map(function (b) { return b > 127 ? b - 256 : b }) },
  newBlob: function (value) { return { getBytes: function () { return Array.from(new TextEncoder().encode(value)) } } },
}
`

export function buildCore(root = new URL('..', import.meta.url)) {
  const parts = SRC.map((f) => `\n// ===== ${f} =====\n` + readFileSync(new URL(`archive/apps-script/${f}`, root), 'utf8'))
  return PREAMBLE + parts.join('\n') + `\nexport { ${EXPORTS.join(', ')} }\n`
}

export function buildDts() {
  return '// 자동 생성: node scripts/build-receiver-core.mjs — 원본 .gs가 ES5라 타입은 any로 둔다.\n' + EXPORTS.map((n) => `export declare const ${n}: any`).join('\n') + '\n'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = new URL('../supabase/functions/_shared/receiverCore.generated.js', import.meta.url)
  writeFileSync(out, buildCore())
  writeFileSync(new URL('../supabase/functions/_shared/receiverCore.generated.d.ts', import.meta.url), buildDts())
  console.log('written', out.pathname)
}
