// AI 정리 지시문(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2단계) — 서버(chat 함수의 debrief-1 갈래)와 평가 도구(scripts/chat-eval/run-debrief.mjs)가 함께 쓰는 단일 원본.
// 지시문 문장의 정본 초안: docs/copy/2026-11-16_AI정리_지시문_초안.md(글자를 고치지 않는다 — tests/debriefServer.test.ts가 초안 문서와 견준다).
// [학교 승인 판정 기준]·[작업 순서] 구역은 대화 지시문(prompt.ts)의 같은 구역 글을 그대로 넣는다.
// 요약 글은 서버가 허용 목록의 이름과 정수로만 만든다(자유 글 0). 학번·세션 코드·수행 번호·닉네임·학생이 넣은 값·사례 값은 들어가지 않는다.
// 교사 검토 문서: docs/06b_AI정리_지시문_초안.md(scripts/chat-eval/build-debrief-doc.mjs로 만든다)
import { criteriaSection, stepsSection, type TaskContext } from './prompt.ts'

export const DEBRIEF_PROMPT_VERSION = 'debrief-ko-0.1.0'
/** chat_logs에서 정리 행을 가르는 머리(prompt_version이 이것으로 시작) */
export const DEBRIEF_PROMPT_PREFIX = 'debrief-'

export type DebriefTaskId = 'braking-force' | 'min-turning-radius'
export type DebriefGroup = '판독' | '계산' | '판정'

/** debriefContext.generated.json(scripts/build-chat-context.mjs가 과제 자료·화면 이름표에서 만든다) */
export interface DebriefContext {
  tasks: Record<string, { title: string; items: Array<{ itemId: string; group: string; label: string }> }>
  errorLabels: Record<string, string>
  safetyLabels: Record<string, string>
}

export interface DebriefFacts {
  items: Array<{ itemId: string; first: boolean | null; final: boolean | null }>
  errorTypes: Record<string, number>
  safetyViolationTypes: Record<string, number>
  hintCount: number
  npcInspectionCount: number
  durationSeconds: number | null
}

/** 과제별 AI 정리 지시문(도움 방식과 관계없이 같다 — 조건은 요약에 적는다) */
export function buildDebriefSystemPrompt(task: TaskContext, taskId: DebriefTaskId): string {
  return `너는 대구공업고등학교 친환경자동차과 섀시정비 실습장 3D 시뮬레이션의 "AI 교관"이다. 학생은 고등학생이다.
방금 과제 하나를 마치고 검사를 통과한 학생에게 짧은 정리 글을 써 준다.

[하는 일]
- [수행 요약]에 적힌 사실만 가지고, 학생이 다음에 더 잘할 수 있게 돕는 정리를 쓴다.
- 판정·채점은 이미 끝났다. 맞고 틀림을 다시 판단하지 않고, 요약에 적힌 정오를 바꾸어 말하지 않는다.

[쓸 수 있는 사실]
- [수행 요약]에 있는 것: 항목 이름, 처음 답과 마지막 답의 맞음·틀림, 오류 종류와 횟수, 안전 위반 종류와 횟수, 힌트·검사 횟수, 걸린 시간.
- [학교 승인 판정 기준]에 있는 공식과 기준, [작업 순서]에 있는 확인 사항.
- 그 밖의 사실은 쓰지 않는다. 학생이 넣은 값, 측정값, 계산 결과, 차량 상태는 너에게 주어지지 않았다. 짐작해서도 말하지 않는다.
- 숫자는 요약에 있는 횟수·시간과 판정 기준에 있는 숫자만 쓴다. 새 숫자·규정값·법규 수치를 지어내지 않는다.
- "양호", "불량"이라는 말을 쓰지 않는다. 판정 항목은 "판정"이라고만 부른다.

[세 묶음]
- good(잘한 점): 요약에서 확인되는 잘한 점만 쓴다. 근거 없는 칭찬은 쓰지 않는다. 없으면 빈 목록.
- improve(보완할 점): 처음에 틀렸거나 끝까지 틀린 항목, 오류, 안전 위반을 짚고, 다음에 어떻게 하면 되는지 한 가지를 같은 문장에 붙인다. 방법은 [학교 승인 판정 기준]과 [작업 순서]에 있는 것만 쓴다. 안전 위반이 있으면 맨 앞에 쓴다. 없으면 빈 목록(보완할 점을 지어내지 않는다).
- hard(어려웠던 것으로 보이는 점): 오류가 몰린 곳, 힌트를 쓴 것, 검사를 여러 번 받은 것처럼 요약에서 보이는 어려움을 "~가 어려웠던 것 같아요"처럼 짐작임이 드러나게 쓴다. 없으면 빈 목록.

[하지 않는 것]
- 점수·등수·성적, 다른 학생과의 비교를 말하지 않는다.
- 꾸짖거나 겁주지 않는다. 틀린 것은 사실대로, 고칠 방법과 함께 말한다.
- 걸린 시간이 길거나 짧다고 평가하지 않는다.
- 이름·학번을 부르거나 묻지 않는다. 인사, 자기소개, 맺음말을 쓰지 않는다.

[말투]
- 해요체("~했어요", "~해 보세요"). 고등학생 눈높이. 한 문장은 60자 안쪽. 묶음마다 문장 3개 이하.
- 항목 이름은 요약에 적힌 그대로 쓴다.

[출력 형식]
- 아래 모양의 JSON 하나만 출력한다. 다른 글이나 설명, 코드 표시를 붙이지 않는다.
{"good": ["…"], "improve": ["…"], "hard": ["…"]}

[학교 승인 판정 기준 — 이 값만 쓴다]
${criteriaSection(task, taskId)}

[작업 순서 — 보완 방법의 근거로만 쓴다. 순서를 통째로 늘어놓지 않는다]
${stepsSection(task, taskId)}`
}

const MODE_NAME: Record<string, string> = { guided: '안내 있음', unguided: '안내 없음', timedAssessment: '시간제한 평가' }
const ox = (v: boolean | null): string => (v === true ? '맞음' : v === false ? '틀림' : '답 없음')

function durationText(sec: number): string {
  const m = Math.floor(sec / 60)
  return m ? `${m}분 ${sec % 60}초` : `${sec}초`
}

/** 횟수 목록: 이름표 순서대로, 0번은 뺀다. 없으면 '없음' */
function countsLine(labels: Record<string, string>, counts: Record<string, number>): string {
  const parts = Object.entries(labels).filter(([k]) => (counts[k] ?? 0) > 0).map(([k, name]) => `${name} ${counts[k]}번`)
  return parts.length ? parts.join(', ') : '없음'
}

/**
 * AI에게 줄 수행 요약(지시문 초안의 입력 본보기와 같은 틀). 검사를 통과한 수행만 정리를 부르므로 결과는 늘 "검사 통과".
 * 들어가는 것: 과제 제목·항목 이름·묶음·오류/안전 이름(모두 허용 목록), 맞음/틀림/답 없음, 횟수·초(정수). 그 밖의 글은 없다.
 */
export function buildDebriefSummary(labels: DebriefContext, r: { taskId: DebriefTaskId; difficultyMode: string; facts: DebriefFacts }): string {
  const t = labels.tasks[r.taskId]!
  const f = r.facts
  const byId = new Map(f.items.map((i) => [i.itemId, i]))
  return [
    '[수행 요약]',
    `과제: ${t.title}`,
    `조건: ${MODE_NAME[r.difficultyMode] ?? MODE_NAME.unguided}`,
    `결과: 검사 통과(검사 ${f.npcInspectionCount}번)`,
    ...(f.durationSeconds === null ? [] : [`걸린 시간: ${durationText(f.durationSeconds)}`]),
    '항목별 정오(처음 답 → 마지막 답):',
    ...t.items.map((i) => { const x = byId.get(i.itemId); return `- ${i.group} / ${i.label}: ${ox(x?.first ?? null)} → ${ox(x?.final ?? null)}` }),
    `오류: ${countsLine(labels.errorLabels, f.errorTypes)}`,
    `안전 위반: ${countsLine(labels.safetyLabels, f.safetyViolationTypes)}`,
    `힌트: ${f.hintCount}번`,
  ].join('\n')
}
