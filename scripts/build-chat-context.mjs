// 챗봇 프롬프트용 과제 문맥 생성 — 판정 기준과 작업 순서만 뽑는다. 측정값(measurement)·사례 값은 넣지 않는다(무안내 정답 유출 차단).
// 출력: supabase/functions/_shared/chat/taskContext.generated.json  (tests/chatServer.test.ts가 최신·무유출을 검사)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('../supabase/functions/_shared/chat/taskContext.generated.json', import.meta.url), buildChatContext())
  console.log('written taskContext.generated.json')
}
