// AI 정리 평가 시험기와 사람 판독표(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2-5).
// 합성 수행 사실을 서버 처리 본체(debriefCore.handleDebrief)에 그대로 통과시킨다 — 요청 검사·요약 글·지시문·답 길이 제한·429 재시도·답 검사가 서버와 같다.
// 저장소는 메모리 흉내뿐이라 대화 기록(chat_logs)이 남지 않는다. 판독은 사람이 한다.
import { checkDebriefAnswer, debriefAllowedNumbers, handleDebrief } from '../../supabase/functions/_shared/chat/debriefCore.ts'

/** 사람이 판독할 항목 */
export const DEBRIEF_DIMENSIONS = {
  facts: { label: '사실만 씀', how: '요약에 없는 사실(값·차량 상태·지어낸 오류)을 말하지 않았다. 정오를 바꾸어 말하지 않았다.' },
  method: { label: '고칠 방법의 근거', how: '보완할 점의 방법이 판정 기준·작업 순서에 있는 것이다. 안전 위반이 있으면 맨 앞에 있다.' },
  hard: { label: '짐작으로 씀', how: '어려웠던 점을 "~것 같아요"처럼 짐작으로 썼다. 근거 없는 칭찬·꾸중이 없다.' },
  tone: { label: '말투·길이', how: '해요체, 고등학생 눈높이, 한 문장 60자 안쪽, 이름·인사·점수 없음.' },
}

/** 합성 사례의 수행 번호(서버가 UUID 모양만 받는다): D07 → 00000000-0000-4000-8000-000000000007 */
const evalRecordId = (id) => `00000000-0000-4000-8000-${String(id.replace(/\D/g, '')).padStart(12, '0')}`

/** @param opts { callModel, provider, model, apiKey, context, labels } */
export async function runDebriefCase(c, { callModel, provider, model, apiKey, context, labels }) {
  let call = null
  let raw = null
  let finishReason = null
  let row = null
  /** 모델 호출마다 HTTP 상태·오류 글·끝난 이유(키·요청 머리글은 남기지 않는다). 서버 본체는 그대로 두고 callModel만 감싼다 */
  const attempts = []
  const body = JSON.stringify({ protocolVersion: 'debrief-1', sessionCode: 'EVAL-ONLY', anonymousStudentCode: 'E-01', recordId: evalRecordId(c.id), taskId: c.taskId, difficultyMode: c.mode, facts: c.facts })
  const t0 = Date.now()
  const res = await handleDebrief('text/plain', body, {
    getSession: async () => ({ active: true, chatbotEnabled: true, capPerStudent: 1_000_000, dailyCap: 1_000_000 }),
    findDebrief: async () => null,
    countDebriefToday: async () => 0,
    insertLog: async (r) => { row = r; return null },
    model: () => ({ provider, model, apiKey }),
    callModel: async (cl) => {
      call = cl
      let r
      try { r = await callModel(cl) } catch (e) { attempts.push({ status: 0, error: String(e).slice(0, 300), finishReason: null }); throw e }
      attempts.push({ status: r.status, error: r.error ?? null, finishReason: r.finishReason ?? null })
      raw = r.text ?? null; finishReason = r.finishReason ?? null
      return r
    },
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    context,
    labels,
  })
  const elapsedMs = Date.now() - t0
  let reason = null
  if (!res.ok) {
    if (res.code !== 'DEBRIEF_INVALID' || !call) reason = res.code
    else {
      const checked = raw ? checkDebriefAnswer(raw, debriefAllowedNumbers(context, c.taskId, call.question)) : { ok: false, reason: '빈 답' }
      reason = checked.ok ? `끝난 이유 ${finishReason ?? '없음'}` : checked.reason
    }
  }
  return { case: c, system: call?.system ?? null, summary: call?.question ?? null, raw, finishReason, res, reason, attempts, retries: Math.max(0, attempts.length - 1), elapsedMs, latencyMs: row?.latency_ms ?? null, modelVersion: row?.model_version ?? null }
}

const modeName = (m) => (m === 'guided' ? '안내 있음' : '안내 없음')
const taskName = (t) => (t === 'min-turning-radius' ? '최소회전반경' : '제동력')
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, ' ')
const fence = (s) => ['```', String(s ?? '(없음)'), '```']
const attemptText = (a) => [a.status ? `HTTP ${a.status}` : '연결 실패', a.error ? `오류 ${a.error}` : '', a.finishReason ? `끝난 이유 ${a.finishReason}` : ''].filter(Boolean).join(' · ')
/** 모델 호출 기록 한 줄: 몇 번 불렀는지(다시 부른 횟수), 호출마다 HTTP 상태·오류 글·끝난 이유 */
const callsLine = (r) => `모델 호출: ${r.attempts.length}번${r.retries ? `(다시 부름 ${r.retries}번)` : ''}${r.attempts.length ? ` · ${r.attempts.map(attemptText).join(' / ')}` : ''}`

export function renderDebriefSheet(results, meta) {
  const passed = results.filter((r) => r.res.ok).length
  const times = results.map((r) => r.elapsedMs)
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : '-'
  const versions = [...new Set(results.map((r) => r.modelVersion).filter(Boolean))].join(', ') || '-'
  return [
    `# AI 정리 평가 판독표 — ${meta.provider} / ${meta.model} / ${meta.promptVersion}`, '',
    `- 실행 ${meta.ranAt} · 수행 요약 ${results.length}개 · 모델 버전 ${versions} · 평균 걸린 시간 ${avg}ms(앱은 12초까지 기다린다)`,
    '- 조건: 서버 처리 본체(handleDebrief)를 그대로 거침 — 요청 허용 목록 검사, 서버가 만든 요약 글, 정리 지시문, 답 길이 제한, 429 재시도, 답 검사(JSON·세 묶음·문장 수·길이·양호/불량·숫자).',
    '- 다른 점: 이 기기 키로 직접 부르므로 Supabase 함수·세션 설정·재사용·한도를 거치지 않고 대화 기록(chat_logs)이 남지 않는다.',
    '- 합성 수행 사실만 썼다. 실제 학생 자료 없음. 이 표는 지시문·모델을 고르기 위한 개발 자료로, **연구 자료가 아니다**.',
    meta.provider === 'gemini' ? '- Gemini 무료 API: 성인 한정 개발 시험. 무료 등급 입력은 구글이 학습·검토에 쓸 수 있음(합성 자료만).' : '',
    '', '## 판독 기준', '',
    ...Object.values(DEBRIEF_DIMENSIONS).map((d) => `- **${d.label}**: ${d.how}`),
    '', '## 요약', '',
    `검사 통과 ${passed} · 걸림 ${results.length - passed}`, '',
    '| 번호 | 과제 · 조건 | 검사 | 걸린 시간(ms) | 판독 | 메모 |', '|---|---|---|---|---|---|',
    ...results.map((r) => `| ${r.case.id} | ${taskName(r.case.taskId)} · ${modeName(r.case.mode)} | ${r.res.ok ? '통과' : `걸림: ${esc(r.reason)}`} | ${r.elapsedMs} |  |  |`),
    '',
    ...results.flatMap((r) => [
      `## ${r.case.id} ${r.case.title}`, '',
      `${taskName(r.case.taskId)} · ${modeName(r.case.mode)} · 검사 ${r.res.ok ? '통과' : `걸림(${r.reason})`} · 걸린 시간 ${r.elapsedMs}ms${r.finishReason ? ` · 끝난 이유 ${r.finishReason}` : ''}`, '',
      callsLine(r), '',
      '요약 글(AI가 받은 것):', '', ...fence(r.summary), '',
      '모델 원문:', '', ...fence(r.raw), '',
      ...(r.res.ok ? ['화면에 보일 정리:', '', `- 잘한 점: ${r.res.notes.good.join(' / ') || '(빈 묶음 → 고정 문장)'}`, `- 보완할 점: ${r.res.notes.improve.join(' / ') || '(빈 묶음 → 고정 문장)'}`, `- 어려웠던 점: ${r.res.notes.hard.join(' / ') || '(빈 묶음 → 고정 문장)'}`, ''] : ['화면에는 규칙 정리가 나온다.', '']),
      '| 판독 항목 | 판독 | 메모 |', '|---|---|---|',
      ...Object.values(DEBRIEF_DIMENSIONS).map((d) => `| ${d.label} |  |  |`),
      '',
    ]),
  ].filter((line, i, a) => line !== '' || a[i - 1] !== '').join('\n')
}
