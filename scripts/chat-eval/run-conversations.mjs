// 실제 조건 AI 시험(E1). 사용: node scripts/chat-eval/run-conversations.mjs <gemini|anthropic> [--run] [--only=conv]
// --run이 없으면 호출 계획만 보여 준다(키를 읽지 않고 아무것도 보내지 않음). 결과: docs/chat-eval/<날짜>_e1_<모델>_<프롬프트>.md
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { CONVERSATIONS } from './conversations.mjs'
import { SUITE } from './questions-turning.mjs'
import { renderSheet, runConversation, suiteAsConversations } from './conversation-run.mjs'
import { PROMPT_VERSION } from './prompt.mjs'

const KEY_ENV = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' } // 서버 chat 함수의 KEY_ENV와 같게
const PAUSE_MS = 4500 // 무료 등급 분당 한도 보호
const args = process.argv.slice(2)
const provider = args.find((a) => !a.startsWith('--')) ?? 'gemini'
if (!KEY_ENV[provider]) {
  console.error(`${provider}: 서버 연결 코드가 없습니다. docs/ai/2026-11-09_학생용_AI모델_준비표.md의 순서대로 연결 코드부터 넣어 주세요.`)
  process.exit(1)
}
const list = [...CONVERSATIONS, ...(args.includes('--only=conv') ? [] : suiteAsConversations(SUITE))]
const calls = list.reduce((n, c) => n + c.turns.length, 0)

if (!args.includes('--run')) {
  console.log(`[계획] ${provider} · 대화 ${list.length}개 · 호출 ${calls}번 · 약 ${Math.ceil((calls * PAUSE_MS) / 60000)}분 이상`)
  console.log('실제 호출하지 않았습니다. 합성 질문을 AI 회사로 보내려면 --run을 붙이세요(기존 20개를 빼려면 --only=conv).')
  process.exit(0)
}

await import('./env.mjs')
const { DEFAULTS } = await import('./providers.mjs')
const { callModel } = await import('../../supabase/functions/_shared/chat/providers.ts')
const apiKey = process.env[KEY_ENV[provider]]
if (!apiKey) {
  console.error(`${KEY_ENV[provider]}가 없습니다. .env.local에 적어 주세요.`)
  process.exit(1)
}
const model = DEFAULTS[provider]
const context = JSON.parse(readFileSync(new URL('../../supabase/functions/_shared/chat/taskContext.generated.json', import.meta.url), 'utf8'))
const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
const results = []
for (const conv of list) {
  const r = await runConversation(conv, { callModel, provider, model, apiKey, context, pause })
  results.push(r)
  console.log(`${conv.id} ${r.turns.map((t) => (t.error ? 'E' : t.truncated ? 'T' : t.refused ? 'R' : t.leaks.length ? 'L' : '.')).join('')}`)
}
const ranAt = new Date().toISOString()
const base = `../../docs/chat-eval/${ranAt.slice(0, 10)}_e1_${provider}_${model}_${PROMPT_VERSION}`
let out = new URL(`${base}.md`, import.meta.url)
for (let n = 2; existsSync(out); n++) out = new URL(`${base}_${n}.md`, import.meta.url) // 앞선 결과를 덮어쓰지 않는다
writeFileSync(out, renderSheet(results, { provider, model, promptVersion: PROMPT_VERSION, ranAt }, context))
console.log('written', decodeURIComponent(out.pathname))
