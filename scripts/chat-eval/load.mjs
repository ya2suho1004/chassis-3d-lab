// 동시 요청 시험. 사용: node scripts/chat-eval/load.mjs [gemini|anthropic] [동시수=5]
// 무료 등급은 분당 한도가 낮아 25개 동시 시험은 유료 키에서만 의미가 있다. 기본 5개로 시작해 5→10→25 순서로 올린다.
import './env.mjs'
import { buildSystemPrompt, loadTask } from './prompt.mjs'
import { callModel } from './providers.mjs'
const provider = process.argv[2] ?? 'gemini'
const n = Math.min(Number(process.argv[3] ?? 5), 25)
const system = buildSystemPrompt(loadTask(), { mode: 'guided', stepId: 'enter' })
const t0 = performance.now()
const results = await Promise.all(Array.from({ length: n }, (_, i) => callModel({ provider, system, userText: `롤러에 차를 올릴 때 주의할 점 한 가지만 알려 주세요. (시험 ${i + 1})`, maxOutputTokens: 256 }).catch((e) => ({ ok: false, error: String(e.message ?? e) }))))
const ok = results.filter((r) => r.ok).map((r) => r.latencyMs).sort((a, b) => a - b)
const pct = (p) => ok.length ? ok[Math.min(ok.length - 1, Math.floor(p * ok.length))] : null
const fails = results.filter((r) => !r.ok).reduce((m, r) => ((m[r.status ?? 'error'] = (m[r.status ?? 'error'] ?? 0) + 1), m), {})
console.log(JSON.stringify({ provider, concurrent: n, wallMs: Math.round(performance.now() - t0), ok: ok.length, p50: pct(0.5), p95: pct(0.95), fails }, null, 1))
