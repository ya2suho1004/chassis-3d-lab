// 질문 5개 비교 시험. 사용: node scripts/chat-eval/run.mjs [gemini|anthropic] [--list]
// 결과: docs/chat-eval/<날짜>_<provider>_<model>.md (질문은 가림 처리 후 원문, 키는 기록하지 않음)
import './env.mjs'
import { writeFileSync } from 'node:fs'
import { buildSystemPrompt, loadTask, PROMPT_VERSION } from './prompt.mjs'
import { maskPersonalInfo } from './mask.mjs'
import { callModel, DEFAULTS, listGeminiModels } from './providers.mjs'
import { QUESTIONS } from './questions.mjs'

const provider = process.argv[2] ?? 'gemini'
if (process.argv.includes('--list')) { console.log((await listGeminiModels()).join('\n')); process.exit(0) }
const task = loadTask()
const model = DEFAULTS[provider]
const rows = []
for (const q of QUESTIONS) {
  const { text, masked } = maskPersonalInfo(q.text)
  const system = buildSystemPrompt(task, { mode: q.mode, stepId: q.stepId })
  let res
  try { res = await callModel({ provider, model, system, userText: text }) } catch (e) { res = { ok: false, error: String(e.message ?? e), latencyMs: null } }
  rows.push({ q, sent: text, masked, res })
  console.log(`${q.id} ${res.ok ? 'ok' : 'FAIL'} ${res.latencyMs ?? '-'}ms ${res.ok ? '' : res.error}`)
  await new Promise((r) => setTimeout(r, 4000)) // 무료 등급 분당 한도 보호
}
const date = new Date().toISOString().slice(0, 10)
const out = new URL(`../../docs/chat-eval/${date}_${provider}_${model}_${PROMPT_VERSION}.md`, import.meta.url)
const md = [`# 챗봇 비교 시험 — ${provider} / ${model}`, '',
  `- 실행: ${new Date().toISOString()} · 프롬프트 ${PROMPT_VERSION} · 합성 질문 ${QUESTIONS.length}개 · 실제 학생 자료 없음`,
  provider === 'gemini' ? '- Gemini 무료 API: 성인 한정 개발·시연 시험. 무료 등급 입력은 구글이 학습·검토에 쓸 수 있음.' : '', '',
  '| 질문 | 단계 | 응답 시간 | 끝난 이유 | 토큰(입력/출력/추론) | 가림 |', '|---|---|---|---|---|---|',
  ...rows.map(({ q, masked, res }) => `| ${q.id} | ${q.mode} | ${res.latencyMs ?? '-'} ms | ${res.finishReason ?? (res.ok ? '' : 'error')} | ${res.usage ? [res.usage.promptTokenCount ?? res.usage.input_tokens, res.usage.candidatesTokenCount ?? res.usage.output_tokens, res.usage.thoughtsTokenCount ?? '-'].join(' / ') : '-'} | ${masked.join(', ') || '-'} |`),
  '', ...rows.flatMap(({ q, sent, res }) => [`## ${q.id} (${q.mode})`, '', `**보낸 질문(가림 후):** ${sent}`, '', `**기대 동작:** ${q.expect}`, '',
    res.ok ? `**답변** (모델 버전 ${res.modelVersion ?? '-'}):\n\n${res.text.split('\n').map((l) => '> ' + l).join('\n')}` : `**실패:** ${res.error}`, '',
    '**교사 판정:** [ ] 기대대로  [ ] 수정 필요 — 메모:', '']),
].join('\n')
writeFileSync(out, md)
console.log('saved', out.pathname)
