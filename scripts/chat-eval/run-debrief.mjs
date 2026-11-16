// AI 정리 평가(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2-5). 사용: node scripts/chat-eval/run-debrief.mjs <gemini|anthropic> [--run]
// --run이 없으면 호출 계획만 보여 준다(키를 읽지 않고 아무것도 보내지 않음). 결과: docs/chat-eval/<날짜>_debrief_<공급자>_<모델>_<지시문 판>.md
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { DEBRIEF_CASES } from './debrief-cases.mjs'

const KEY_ENV = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' } // 서버 chat 함수의 KEY_ENV와 같게
const PAUSE_MS = 4500 // 무료 등급 분당 한도 보호
const args = process.argv.slice(2)
const provider = args.find((a) => !a.startsWith('--')) ?? 'gemini'
if (!KEY_ENV[provider]) {
  console.error(`${provider}: 서버 연결 코드가 없습니다. docs/ai/2026-11-09_학생용_AI모델_준비표.md의 순서대로 연결 코드부터 넣어 주세요.`)
  process.exit(1)
}

if (!args.includes('--run')) {
  console.log(`[계획] ${provider} · 합성 수행 요약 ${DEBRIEF_CASES.length}개 · 호출 ${DEBRIEF_CASES.length}번(429면 1번 더) · 약 ${Math.ceil((DEBRIEF_CASES.length * PAUSE_MS) / 60000)}분 이상`)
  for (const c of DEBRIEF_CASES) console.log(`- ${c.id} ${c.title} (${c.mode === 'guided' ? '안내 있음' : '안내 없음'})`)
  console.log('실제 호출하지 않았습니다. 합성 수행 요약을 AI 회사로 보내려면 --run을 붙이세요.')
  process.exit(0)
}

await import('./env.mjs')
const { DEFAULTS } = await import('./providers.mjs')
const { callModel } = await import('../../supabase/functions/_shared/chat/providers.ts')
const { DEBRIEF_PROMPT_VERSION } = await import('../../supabase/functions/_shared/chat/debriefPrompt.ts')
const { renderDebriefSheet, runDebriefCase } = await import('./debrief-run.mjs')
const apiKey = process.env[KEY_ENV[provider]]
if (!apiKey) {
  console.error(`${KEY_ENV[provider]}가 없습니다. .env.local에 적어 주세요.`)
  process.exit(1)
}
const model = DEFAULTS[provider]
const read = (p) => JSON.parse(readFileSync(new URL(`../../supabase/functions/_shared/chat/${p}`, import.meta.url), 'utf8'))
const context = read('taskContext.generated.json')
const labels = read('debriefContext.generated.json')
const results = []
for (const c of DEBRIEF_CASES) {
  const r = await runDebriefCase(c, { callModel, provider, model, apiKey, context, labels })
  results.push(r)
  console.log(`${c.id} ${r.res.ok ? '통과' : `걸림(${r.reason})`} ${r.elapsedMs}ms`)
  await new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
}
const ranAt = new Date().toISOString()
const base = `../../docs/chat-eval/${ranAt.slice(0, 10)}_debrief_${provider}_${model}_${DEBRIEF_PROMPT_VERSION}`
let out = new URL(`${base}.md`, import.meta.url)
for (let n = 2; existsSync(out); n++) out = new URL(`${base}_${n}.md`, import.meta.url) // 앞선 결과를 덮어쓰지 않는다
writeFileSync(out, renderDebriefSheet(results, { provider, model, promptVersion: DEBRIEF_PROMPT_VERSION, ranAt }))
console.log('written', decodeURIComponent(out.pathname))
