// AI 정리 지시문(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2단계) — 서버(chat 함수의 debrief-1 갈래)와 평가 도구(scripts/chat-eval/run-debrief.mjs)가 함께 쓰는 단일 원본.
// 지시문 문장의 정본 초안: docs/copy/2026-11-16_AI정리_지시문_초안.md(글자를 고치지 않는다 — tests/debriefServer.test.ts가 초안 문서와 견준다).
// [학교 승인 판정 기준]·[작업 순서] 구역은 대화 지시문(prompt.ts)의 같은 구역 글을 그대로 넣는다.
// 요약 글은 서버가 허용 목록의 이름과 정수로만 만든다(자유 글 0). 학번·세션 코드·수행 번호·닉네임·학생이 넣은 값·사례 값은 들어가지 않는다.
// 교사 검토 문서: docs/06b_AI정리_지시문_초안.md(scripts/chat-eval/build-debrief-doc.mjs로 만든다)
import { criteriaSection, stepsSection, type TaskContext } from './prompt.ts'

// 0.1.1(2026-11-16 독립 검토): [쓸 수 있는 사실]에 '횟수는 요약에 적힌 숫자 그대로 쓴다.' 한 줄(서버 답 검사가 한글 수사 횟수도 요약과 견준다)
// 0.2.0(2026-11-16 실제 모델 시험 0.1.1 반영): 요약 모양(묶음을 줄 머리로, 횟수는 '회'), 연결 지어내기·단계 번호 금지, 보완 방법을 종류별로 한정, 항목 이름 늘어놓지 않기
// 0.3.0(2026-11-16 실제 모델 시험 0.2.0 반영): 보완 방법을 문장으로, 문장 본보기, 문장 끝 규칙('~하기'·'~바랍니다'를 베껴 쓰던 것)
export const DEBRIEF_PROMPT_VERSION = 'debrief-ko-0.3.0'
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
- 요약에 없는 연결을 지어내지 않는다. 힌트를 어느 항목·어느 단계에서 썼는지, 검사를 왜 다시 받았는지, 오류가 왜 났는지는 요약에 없다. 힌트·검사·오류는 횟수로만 말한다.
- 숫자는 요약에 있는 횟수·시간과 판정 기준에 있는 숫자만 쓴다. 새 숫자·규정값·법규 수치를 지어내지 않는다.
- 횟수는 요약에 적힌 숫자 그대로 쓴다.
- 작업 순서의 단계 번호(몇 번째 단계인지)를 말하지 않는다. 요약의 "작업 순서 어긋남"은 순서를 어긴 횟수다.
- "양호", "불량"이라는 말을 쓰지 않는다. 판정 항목은 "판정"이라고만 부른다.

[세 묶음]
- good(잘한 점): 요약에서 확인되는 잘한 점만 쓴다. 근거 없는 칭찬은 쓰지 않는다. 없으면 빈 목록.
- improve(보완할 점): 처음에 틀렸거나 끝까지 틀린 항목, 오류, 안전 위반을 짚고, 다음에 어떻게 하면 되는지 한 가지를 같은 문장에 붙인다. 안전 위반이 있으면 맨 앞에 쓴다. 없으면 빈 목록(보완할 점을 지어내지 않는다).
- 보완 방법은 종류에 맞는 것만, 학생에게 말하듯 문장으로 쓴다. 계산 항목은 [학교 승인 판정 기준]에 적힌 그 항목의 공식을 문장에 옮겨 적고 다시 확인해 보라고 한다. 판정 항목은 계산한 값을 판정 기준과 다시 견주어 보라고 한다. 판독 항목은 눈금을 한 번 더 읽고 확인해 보라고 한다. 작업 순서 어긋남은 작업지시서의 순서를 먼저 확인해 보라고 한다. 입력 형식 오류는 적는 형식을 확인하고 적어 보라고 한다. 안전 위반은 작업을 시작하기 전에 그 확인부터 해 보라고 한다.
- hard(어려웠던 것으로 보이는 점): 오류가 몰린 종류, 힌트 사용 횟수, 검사 받은 횟수처럼 요약에서 보이는 어려움을 "~가 어려웠던 것 같아요"처럼 짐작임이 드러나게 쓴다. 오류도 힌트도 없고 검사도 1회면 빈 목록.

[문장 본보기 — 말투와 모양만 따른다. 내용은 반드시 [수행 요약]에서 가져온다]
- 잘한 점: "판독 항목을 처음부터 모두 맞혔어요." / "힌트 없이 끝까지 해냈어요." / "검사를 1회 만에 통과했어요."
- 보완할 점: "보호구 확인을 1회 놓쳤어요. 작업을 시작하기 전에 보호구부터 확인해 보세요." / "우 제동력은 처음에 틀렸다가 고쳤어요. 눈금을 한 번 더 읽고 확인해 보세요." / "작업 순서가 2회 어긋났어요. 작업지시서의 순서를 먼저 확인해 보세요."
- 어려웠던 것으로 보이는 점: "계산에서 오류가 4회 난 걸 보면 계산이 어려웠던 것 같아요." / "힌트를 6회 쓴 걸 보면 혼자 풀어 가기 어려운 곳이 있었던 것 같아요." / "검사를 3회 받은 걸 보면 한 번에 마무리하기가 어려웠던 것 같아요."

[하지 않는 것]
- 점수·등수·성적, 다른 학생과의 비교를 말하지 않는다.
- 꾸짖거나 겁주지 않는다. 틀린 것은 사실대로, 고칠 방법과 함께 말한다.
- 걸린 시간이 길거나 짧다고 평가하지 않는다.
- 이름·학번을 부르거나 묻지 않는다. 인사, 자기소개, 맺음말을 쓰지 않는다.

[말투]
- 해요체("~했어요", "~해 보세요"). 고등학생 눈높이. 한 문장은 60자 안쪽. 묶음마다 문장 3개 이하.
- 항목 이름은 요약에 적힌 그대로 쓰고, 한 문장에 항목 이름은 2개까지만 쓴다. 한 묶음(판독·계산·판정)의 항목 결과가 모두 같으면 "판독 항목을 모두"처럼 묶어 말한다.
- 모든 문장은 "~어요", "~세요"로 끝낸다. "~바랍니다", "~하기"로 끝내지 않는다.

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

/** 요약에서만 쓰는 이름(화면 이름표 COUNT_LABEL은 그대로): '작업 순서 N회'를 단계 번호로 읽지 않게 */
const SUMMARY_LABEL: Record<string, string> = { order: '작업 순서 어긋남' }

/** 횟수 목록: 이름표 순서대로, 0회는 뺀다. 없으면 '없음' */
function countsLine(labels: Record<string, string>, counts: Record<string, number>): string {
  const parts = Object.entries(labels).filter(([k]) => (counts[k] ?? 0) > 0).map(([k, name]) => `${SUMMARY_LABEL[k] ?? name} ${counts[k]}회`)
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
    `결과: 검사 통과(검사 받은 횟수 ${f.npcInspectionCount}회)`,
    ...(f.durationSeconds === null ? [] : [`걸린 시간: ${durationText(f.durationSeconds)}`]),
    '항목별 정오(처음 답 → 마지막 답):',
    // 묶음(판독·계산·판정)을 줄 머리로 — 'AI가 "판독 / 좌 제동력" 꼴을 그대로 베껴 늘어놓던 것'(0.1.1 시험)
    ...[...new Set(t.items.map((i) => i.group))].flatMap((g) => [
      g,
      ...t.items.filter((i) => i.group === g).map((i) => { const x = byId.get(i.itemId); return `- ${i.label}: ${ox(x?.first ?? null)} → ${ox(x?.final ?? null)}` }),
    ]),
    `오류 횟수: ${countsLine(labels.errorLabels, f.errorTypes)}`,
    `안전 위반 횟수: ${countsLine(labels.safetyLabels, f.safetyViolationTypes)}`,
    `힌트 사용 횟수: ${f.hintCount}회`,
  ].join('\n')
}
