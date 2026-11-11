// docs/design/contracts/record.schema.json(1.1.0)을 Apps Script용 Schemas.gs로 내보낸다. 수정은 계약 파일에서만.
import { readFileSync, writeFileSync } from 'node:fs'
const schema = JSON.parse(readFileSync(new URL('../docs/design/contracts/record.schema.json', import.meta.url), 'utf8'))
const v120 = JSON.parse(readFileSync(new URL('../docs/design/contracts/record.schema.v1.2.0.json', import.meta.url), 'utf8'))
const legacy = JSON.parse(readFileSync(new URL('../docs/design/contracts/legacy/1.0.0/record.schema.json', import.meta.url), 'utf8'))
const v130 = JSON.parse(readFileSync(new URL('../docs/design/contracts/record.schema.v1.3.0.json', import.meta.url), 'utf8'))
const out = `// 자동 생성: npm run build:gs-schema (원본 docs/design/contracts/record.schema.json, $id ${schema.$id}). 직접 고치지 말 것.
var RECORD_SCHEMAS = { '1.0.0': ${JSON.stringify(legacy)}, '1.1.0': ${JSON.stringify(schema)}, '1.2.0': ${JSON.stringify(v120)}, '1.3.0': ${JSON.stringify(v130)} };
`
writeFileSync(new URL('../archive/apps-script/Schemas.gs', import.meta.url), out)
console.log('Schemas.gs written', legacy.$id, schema.$id, v120.$id, v130.$id)
