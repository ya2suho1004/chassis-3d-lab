// 챗봇 프롬프트용 과제 문맥 생성 — 판정 기준과 작업 순서만 뽑는다. 측정값(measurement)·사례 값은 넣지 않는다(무안내 정답 유출 차단).
// 출력: supabase/functions/_shared/chat/taskContext.generated.json  (tests/chatServer.test.ts가 최신·무유출을 검사)
// 2026-11-16 AI 정리(설계 2026-11-16-debrief-and-free-roam 2-2): 과제별 응답 항목(묶음)과 항목·오류·안전 키의 화면 이름 → debriefContext.generated.json
//   (tests/debriefServer.test.ts가 최신·무유출을 검사). 대화 문맥 파일과 나눈 것은 대화 쪽 무유출 시험이 항목 키(left·right·axleWeight)를 막기 때문
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { COUNT_LABEL, ITEM_LABEL } from '../src/app/resultLabels.ts'

function turningContext(root) {
  const t = JSON.parse(readFileSync(new URL('src/data/tasks/task.min-turning-radius.case-lv1.json', root), 'utf8'))
  const r = t.ruleset
  return {
    source: 'src/data/tasks/task.min-turning-radius.case-lv1.json (사례 2와 기준·순서 동일)',
    rulesetVersion: r.rulesetVersion,
    ruleset: { radiusMaxM: r.radiusMaxM, decisionPrecision: { digits: r.decisionPrecision.digits } },
    steps: t.steps.map((s) => ({ stepId: s.stepId, instruction: s.instruction })),
  }
}

export function buildChatContext(root = new URL('..', import.meta.url)) {
  const t = JSON.parse(readFileSync(new URL('src/data/tasks/task.braking-force.case-lv1.json', root), 'utf8'))
  const r = t.ruleset
  const ctx = {
    source: 'src/data/tasks/task.braking-force.case-lv1.json (사례 2와 기준·순서 동일)',
    rulesetVersion: r.rulesetVersion,
    ruleset: { deviationMaxPercent: r.deviationMaxPercent, sumMinFrontPercent: r.sumMinFrontPercent, sumMinRearPercent: r.sumMinRearPercent, decisionPrecision: { digits: r.decisionPrecision.digits } },
    steps: t.steps.map((s) => ({ stepId: s.stepId, instruction: s.instruction })),
    // 최소회전반경 과제(2026-11-02): 기준·자릿수·순서만. 사례 각도·축거·정답 R은 넣지 않는다
    turning: turningContext(root),
  }
  return JSON.stringify(ctx, null, 2) + '\n'
}

const GROUP = { measurement: '판독', calculation: '계산', judgment: '판정' }
const TASK_FILES = { 'braking-force': 'braking-force', 'min-turning-radius': 'min-turning-radius' }

/** 한 과제의 정리용 문맥: 제목(사례 번호 뗌)·응답 항목(묶음·화면 이름). 사례 1·2가 다르면 멈춘다(사례 값이 섞이지 않게) */
function debriefTask(root, name) {
  const [a, b] = ['lv1', 'lv2'].map((lv) => JSON.parse(readFileSync(new URL(`src/data/tasks/task.${name}.case-${lv}.json`, root), 'utf8')))
  const of = (t) => ({
    title: t.title.replace(/\s*—\s*사례\s*\d+\s*$/, ''),
    items: t.requiredResponseItems.map((i) => {
      if (!GROUP[i.kind] || !ITEM_LABEL[i.itemId]) throw new Error(`이름 없는 응답 항목: ${i.itemId}(${i.kind})`)
      return { itemId: i.itemId, group: GROUP[i.kind], label: ITEM_LABEL[i.itemId] }
    }),
  })
  const x = of(a)
  if (JSON.stringify(x) !== JSON.stringify(of(b))) throw new Error(`${name}: 사례 1·2의 제목·응답 항목이 다릅니다`)
  return x
}

/** AI 정리 서버의 허용 목록과 이름표. 사례 값(measurement·caseId)은 읽지도 넣지도 않는다 */
export function buildDebriefContext(root = new URL('..', import.meta.url)) {
  const entries = Object.entries(COUNT_LABEL)
  const ctx = {
    source: 'src/data/tasks 과제 자료의 requiredResponseItems + src/app/resultLabels.ts(화면 이름)',
    tasks: Object.fromEntries(Object.entries(TASK_FILES).map(([taskId, name]) => [taskId, debriefTask(root, name)])),
    errorLabels: Object.fromEntries(entries.filter(([k]) => !k.startsWith('s-'))),
    safetyLabels: Object.fromEntries(entries.filter(([k]) => k.startsWith('s-'))),
  }
  return JSON.stringify(ctx, null, 2) + '\n'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('../supabase/functions/_shared/chat/taskContext.generated.json', import.meta.url), buildChatContext())
  console.log('written taskContext.generated.json')
  writeFileSync(new URL('../supabase/functions/_shared/chat/debriefContext.generated.json', import.meta.url), buildDebriefContext())
  console.log('written debriefContext.generated.json')
}
