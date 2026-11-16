// AI 정리 지시문 교사 검토 문서 생성: node scripts/chat-eval/build-debrief-doc.mjs → docs/06b_AI정리_지시문_초안.md
// 대화 지시문 문서(build-doc.mjs → docs/06_…)와 같은 방식. 지시문·요약 본보기는 서버 코드에서 그대로 만든다(tests/chatEvalDebrief.test.ts가 최신인지 본다).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildDebriefSummary, buildDebriefSystemPrompt, DEBRIEF_PROMPT_VERSION } from '../../supabase/functions/_shared/chat/debriefPrompt.ts'
import { DEBRIEF_CAP_PER_STUDENT, DEBRIEF_LINE_MAX_CHARS, DEBRIEF_LINES_MAX, DEBRIEF_MAX_OUTPUT_TOKENS } from '../../supabase/functions/_shared/chat/debriefCore.ts'
import { DEBRIEF_CASES } from './debrief-cases.mjs'

const read = (p) => JSON.parse(readFileSync(new URL(`../../supabase/functions/_shared/chat/${p}`, import.meta.url), 'utf8'))

export function buildDebriefDoc() {
  const context = read('taskContext.generated.json')
  const labels = read('debriefContext.generated.json')
  const sample = (id) => { const c = DEBRIEF_CASES.find((x) => x.id === id); return buildDebriefSummary(labels, { taskId: c.taskId, difficultyMode: c.mode, facts: c.facts }) }
  return [
    '# 06b. AI 정리 지시문 (교사 검토용)', '',
    `- 현재 판 \`${DEBRIEF_PROMPT_VERSION}\` · 생성 코드 \`supabase/functions/_shared/chat/debriefPrompt.ts\` · 이 문서는 \`scripts/chat-eval/build-debrief-doc.mjs\`로 다시 만든다.`,
    '- 근거: 설계 `docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md` 2단계, 지시문 문장의 정본 초안 `docs/copy/2026-11-16_AI정리_지시문_초안.md`(문장을 그대로 쓴다). [학교 승인 판정 기준]·[작업 순서] 구역은 대화 지시문(`docs/06_챗봇_시스템프롬프트_초안.md`)의 같은 구역 글 그대로.',
    '- 상태: **서버 반영 전.** 실제 모델 평가는 `node scripts/chat-eval/run-debrief.mjs gemini --run` → `docs/chat-eval/`.', '',
    '## 1. 설계 원칙', '', '| 원칙 | 구현 |', '|---|---|',
    '| 사실은 앱이, 말은 AI가 | 정오·횟수·공식·규정값은 앱과 서버가 정한다. AI는 받은 요약으로 "교관의 정리" 세 묶음(잘한 점·보완할 점·어려웠던 것으로 보이는 점)의 말만 쓴다 |',
    '| 값이 가지 않음 | 앱은 항목 정오(맞음·틀림·답 없음)·알려진 오류/안전 이름의 횟수·힌트·검사 횟수·걸린 초만 보낸다. 서버가 허용 목록으로 검사하고 요약 글로 바꾼다(자유 글 0) |',
    '| 판정·채점 분리 | 검사를 통과한 수행만 정리를 부른다. "양호"·"불량"을 쓰지 않는다 |',
    `| 서버가 한 번 더 막음 | JSON 하나·세 묶음·묶음마다 ${DEBRIEF_LINES_MAX}문장 이하·문장마다 ${DEBRIEF_LINE_MAX_CHARS}자 이하·"양호"/"불량" 없음·요약과 판정 기준 구역에 없는 숫자 없음(전각 숫자·"세 번" 같은 한글 수사 횟수도 견줌, 작업 순서 번호는 허용 안 함). 어기면 버리고 화면은 규칙 정리 |`,
    `| 비용·한도 | 같은 수행은 저장된 정리를 다시 쓴다(모델을 다시 부르지 않음). 학생 하루 ${DEBRIEF_CAP_PER_STUDENT}번, 세션 하루 한도는 세션의 AI 하루 한도(정리 행만 셈). 답 길이 제한 ${DEBRIEF_MAX_OUTPUT_TOKENS} |`,
    '| AI 표시 | AI 글이면 "교관의 정리" 제목 옆에 "AI 교관이 쓴 글이에요(사람 아님)." 규칙 정리로 대신하면 표시 없음 |', '',
    '## 2. AI가 받는 것 — 본보기(합성 수행)', '',
    '제동력 · 안내 없음(합성 D02):', '', '```text', sample('D02'), '```', '',
    '최소회전반경 · 안내 없음(합성 D09):', '', '```text', sample('D09'), '```', '',
    '보내지 않는 것: 학번, 세션 코드, 수행 번호, 닉네임, 학생이 넣은 값, 사례의 측정값·계산 기준값, 차량이 양호인지 불량인지. 학번·세션 코드·수행 번호는 서버의 기록·한도·재사용에만 쓴다.', '',
    '## 3. 화면에서', '',
    '- 정리 화면이 뜰 때 한 번 부른다(검사 통과한 수행, 기록 모드, 대화 주소가 있음, 확정 기록이 있음, 온라인). 같은 수행에 두 번 부르지 않는다.',
    '- 기다리는 동안(최대 12초) "교관이 정리를 쓰고 있어요…". 오지 않거나 실패하면 규칙 정리. 한번 보인 글은 바꾸지 않는다. 30초 잠금은 화면이 뜬 때부터(그대로).',
    '- AI가 빈 묶음을 주면 지금의 고정 문장. 수치 줄·내 답 표·"오늘 쓴 공식과 규정값"은 앱이 만든다. AI 글은 수행 기록·기기 저장에 넣지 않는다.',
    '- 교사 화면 대화 점검에는 "수행 정리"로 표시된다(요약 글과 세 묶음). 대화 기록 CSV 맨 끝 kind 열.', '',
    '## 4. 교사 검토 항목', '',
    '- [ ] 보완할 점에 "다음에 어떻게 하면 되는지"를 판정 기준·작업 순서 안에서만 쓰게 한 것이 맞는가',
    '- [ ] 어려웠던 점을 짐작으로("~것 같아요") 쓰게 한 표현이 학생에게 맞는가',
    '- [ ] 정리에서 빼야 할 말(점수·비교·시간 평가 외)이 더 있는가', '',
    '## 5. 지시문 전문 — 제동력', '', '```text', buildDebriefSystemPrompt(context, 'braking-force'), '```', '',
    '## 6. 지시문 전문 — 최소회전반경', '', '```text', buildDebriefSystemPrompt(context, 'min-turning-radius'), '```', '',
  ].join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const md = buildDebriefDoc()
  writeFileSync(new URL('../../docs/06b_AI정리_지시문_초안.md', import.meta.url), md)
  console.log('written', md.length)
}
