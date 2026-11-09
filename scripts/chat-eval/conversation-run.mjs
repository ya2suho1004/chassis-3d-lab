// 합성 대화를 실제 서버 처리 본체(chatCore.handleChat)에 그대로 통과시키는 시험기와 사람 판독표(E1, 2026-11-09).
// 가림·시스템 프롬프트·답 길이 제한·재시도·끊김/막힘 처리가 서버와 같다. 앞 대화는 앱(ChatPanel)처럼 실제 받은 답으로 쌓고 실패한 차례는 뺀다.
// 저장소는 메모리 흉내뿐이라 대화 기록(chat_logs)이 남지 않는다. 판정은 사람이 한다.
import { handleChat, MAX_OUTPUT_TOKENS, HISTORY_MAX_TURNS, TRUNCATED_NOTE } from '../../supabase/functions/_shared/chat/chatCore.ts'
import { maskPersonalInfo } from './mask.mjs'
import { DIMENSIONS, SUITE_CHECK } from './conversations.mjs'

/** 기존 질문 묶음을 한 번짜리 대화로 바꾼다 */
export function suiteAsConversations(suite) {
  return suite.map((q) => ({
    id: q.id, title: '한 번 질문', taskId: q.taskId, mode: q.mode, stepId: q.stepId,
    turns: [{ text: q.text, expect: q.expect, check: SUITE_CHECK[q.id] ?? [], leak: q.leak }],
  }))
}

/** @param opts { callModel, provider, model, apiKey, context, pause } */
export async function runConversation(conv, { callModel, provider, model, apiKey, context, pause }) {
  const lines = []
  const turns = []
  for (const [turnIndex, t] of conv.turns.entries()) {
    const history = lines.filter((l) => l.a !== null).slice(-HISTORY_MAX_TURNS).map((l) => ({ q: l.q, a: l.a }))
    let row = null
    let finishReason = null
    const body = JSON.stringify({
      protocolVersion: 'chat-1', sessionCode: 'EVAL-ONLY', anonymousStudentCode: 'E-01', recordId: null,
      stepId: t.stepId === undefined ? conv.stepId : t.stepId, taskId: conv.taskId, difficultyMode: conv.mode, question: t.text, history, turnIndex,
    })
    const res = await handleChat('text/plain', body, {
      getSession: async () => ({ active: true, chatbotEnabled: true, capPerStudent: 1_000_000, dailyCap: 1_000_000 }),
      countToday: async () => 0,
      insertLog: async (r) => { row = r; return null },
      model: () => ({ provider, model, apiKey }),
      callModel: async (call) => { const r = await callModel(call); finishReason = r.finishReason ?? null; return r },
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      context,
    })
    const answer = res.ok ? res.answer : null
    lines.push({ q: t.text, a: answer })
    turns.push({
      turn: t, sent: maskPersonalInfo(t.text).text, masked: res.ok ? res.masked : maskPersonalInfo(t.text).masked,
      answer, error: res.ok ? null : res.code, refused: res.ok ? res.refused : false, truncated: !!answer?.endsWith(TRUNCATED_NOTE),
      finishReason, modelVersion: row?.model_version ?? null, latencyMs: row?.latency_ms ?? null,
      leaks: answer ? (t.leak ?? []).filter((w) => answer.includes(w)) : [],
    })
    await pause()
  }
  return { conv, turns }
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, ' ')
const flagsOf = (t) => [
  t.error ? `오류 ${t.error}` : '', t.truncated ? '끊김' : '', t.refused ? `거절(${t.finishReason ?? '빈 답'})` : '', t.leaks.length ? `금지 문자열: ${t.leaks.join(', ')}` : '',
].filter(Boolean).join(' · ') || '-'
const taskName = (c) => (c.taskId === 'min-turning-radius' ? '최소회전반경' : '제동력')
const modeName = (c) => (c.mode === 'guided' ? '안내 있음' : '안내 없음')

export function renderSheet(results, meta, context) {
  const r = context.ruleset
  const tr = context.turning?.ruleset
  const all = results.flatMap((x) => x.turns)
  const count = (f) => all.filter(f).length
  const latencies = all.map((t) => t.latencyMs).filter((v) => v !== null)
  const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : '-'
  const versions = [...new Set(all.map((t) => t.modelVersion).filter(Boolean))].join(', ') || '-'
  return [
    `# AI 교관 실제 조건 시험 판독표 — ${meta.provider} / ${meta.model} / ${meta.promptVersion}`, '',
    `- 실행 ${meta.ranAt} · 대화 ${results.length}개 · 차례 ${all.length}번 · 모델 버전 ${versions} · 평균 응답 ${avg}ms`,
    `- 조건: 서버 처리 본체(handleChat)를 그대로 거침 — 개인정보 가림, 서버 프롬프트, 답 길이 제한 ${MAX_OUTPUT_TOKENS}, 앞 대화 최근 ${HISTORY_MAX_TURNS}번(실제 받은 답), 끊김·막힘 처리, 429 재시도.`,
    '- 다른 점: 이 기기 키로 직접 부르므로 Supabase 함수·세션 설정을 거치지 않고 대화 기록(chat_logs)이 남지 않는다.',
    '- 합성 질문만 썼다. 실제 학생 자료 없음. 이 표는 모델을 고르기 위한 개발 자료로, **연구 자료가 아니다**(연구 자료로 쓰려면 IRB 수정이 필요하다).',
    meta.provider === 'gemini' ? '- Gemini 무료 API: 성인 한정 개발 시험. 무료 등급 입력은 구글이 학습·검토에 쓸 수 있음(합성 질문만).' : '',
    '', '## 판독 기준', '',
    ...Object.values(DIMENSIONS).map((d) => `- **${d.label}**: ${d.how}`),
    '', '승인된 값(과제 자료에서 그대로):',
    `- 제동력: 편차 ${r.deviationMaxPercent}% 이하, 합 앞축 ${r.sumMinFrontPercent}% 이상·뒤축 ${r.sumMinRearPercent}% 이상(경계 포함), 소수 ${r.decisionPrecision.digits}자리까지 쓰고 그 아래는 버림.`,
    tr ? `- 최소회전반경: ${tr.radiusMaxM} m 이하(경계 포함), 소수 ${tr.decisionPrecision.digits}자리까지 쓰고 그 아래는 버림. 계산에는 바깥쪽 앞바퀴 각도를 쓴다.` : '',
    '', '## 요약', '',
    `자동 표시: 끊김 ${count((t) => t.truncated)} · 거절 ${count((t) => t.refused)} · 오류 ${count((t) => t.error)} · 금지 문자열 ${count((t) => t.leaks.length)}`,
    '자동 표시는 살펴볼 곳을 알려 줄 뿐 판정이 아니다. 금지 문자열은 말뜻과 관계없이 글자만 본다.', '',
    '| 판독 항목 | 대상 차례 | 적합 | 부적합 |', '|---|---|---|---|',
    ...Object.entries(DIMENSIONS).map(([k, d]) => `| ${d.label} | ${count((t) => t.turn.check.includes(k))} |  |  |`),
    '',
    ...results.flatMap(({ conv, turns }) => [
      `## ${conv.id} ${conv.title}`, '', `${taskName(conv)} · ${modeName(conv)}`, '',
      '| 차례 | 단계 | 보낸 질문(가림 뒤) | 기대 동작 | 판독 항목 | 답 | 자동 표시 | 판독 | 메모 |', '|---|---|---|---|---|---|---|---|---|',
      ...turns.map((t, i) => `| ${i + 1} | ${(t.turn.stepId === undefined ? conv.stepId : t.turn.stepId) ?? '-'} | ${esc(t.sent)}${t.masked.length ? ` (가림: ${t.masked.join(',')})` : ''} | ${esc(t.turn.expect)} | ${t.turn.check.map((k) => DIMENSIONS[k].label).join(', ')} | ${t.answer === null ? '(답 없음)' : esc(t.answer)} | ${esc(flagsOf(t))} |  |  |`),
      '',
    ]),
  ].filter((line, i, a) => line !== '' || a[i - 1] !== '').join('\n')
}
