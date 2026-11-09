// 합성 질문 묶음 시험(서버 문맥 그대로). 사용: node scripts/chat-eval/run-suite.mjs [gemini]
// 서버를 거치지 않고 이 기기의 .env.local 키로 직접 부른다 → 시연 대화 기록(chat_logs)이 남지 않는다. 결과: docs/chat-eval/<날짜>_suite_<모델>_<프롬프트>.md
import './env.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { buildSystemPrompt, PROMPT_VERSION } from './prompt.mjs'
import { maskPersonalInfo } from './mask.mjs'
import { MAX_OUTPUT_TOKENS } from '../../supabase/functions/_shared/chat/chatCore.ts'
import { callModel, DEFAULTS } from './providers.mjs'
import { SUITE } from './questions-turning.mjs'

const provider = process.argv[2] ?? 'gemini'
const model = DEFAULTS[provider]
const context = JSON.parse(readFileSync(new URL('../../supabase/functions/_shared/chat/taskContext.generated.json', import.meta.url), 'utf8'))
const rows = []
for (const q of SUITE) {
  const { text, masked } = maskPersonalInfo(q.text)
  const system = buildSystemPrompt(context, { mode: q.mode, stepId: q.stepId, taskId: q.taskId })
  let res
  try { res = await callModel({ provider, model, system, userText: text, maxOutputTokens: MAX_OUTPUT_TOKENS }) } catch (e) { res = { ok: false, error: String(e.message ?? e) } }
  const leaks = res.ok ? (q.leak ?? []).filter((w) => res.text.includes(w)) : []
  rows.push({ q, sent: text, masked, res, leaks })
  console.log(`${q.id} ${res.ok ? 'ok' : 'FAIL'} ${res.latencyMs ?? '-'}ms${leaks.length ? ' LEAK ' + leaks.join('|') : ''}${res.ok ? '' : ' ' + res.error}`)
  await new Promise((r) => setTimeout(r, 4500)) // 무료 등급 분당 한도 보호
}
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ')
const date = new Date().toISOString().slice(0, 10)
const out = new URL(`../../docs/chat-eval/${date}_suite_${provider}_${model}_${PROMPT_VERSION}.md`, import.meta.url)
writeFileSync(out, [`# AI 교관 질문 묶음 시험 — ${provider} / ${model} / ${PROMPT_VERSION}`, '',
  `- 실행 ${new Date().toISOString()} · 합성 질문 ${SUITE.length}개(최소회전반경 16·제동력 4) · 서버 문맥(taskContext.generated.json)·서버 프롬프트 그대로 · 이 기기 키로 직접 호출(시연 대화 기록 없음) · 실제 학생 자료 없음`,
  provider === 'gemini' ? '- Gemini 무료 API: 성인 한정 개발 시험. 무료 등급 입력은 구글이 학습·검토에 쓸 수 있음(합성 질문만).' : '',
  '- "자동 표시"는 금지 문자열이 답에 있는지만 본 것이다. 최종 판단은 사람이 표의 기대 동작과 답을 읽고 한다.', '',
  '| 질문 | 과제·모드·단계 | 보낸 질문(가림 뒤) | 기대 동작 | 답 | 자동 표시 |', '|---|---|---|---|---|---|',
  ...rows.map(({ q, sent, masked, res, leaks }) => `| ${q.id} | ${q.taskId ? '최소회전반경' : '제동력'} · ${q.mode === 'guided' ? '안내 있음' : '안내 없음'} · ${q.stepId ?? '-'} | ${esc(sent)}${masked.length ? ` (가림: ${masked.join(',')})` : ''} | ${esc(q.expect)} | ${res.ok ? esc(res.text) : '오류: ' + esc(res.error)} | ${leaks.length ? '⚠ ' + leaks.join(', ') : '-'} |`),
  ''].join('\n'))
console.log('written', out.pathname)
