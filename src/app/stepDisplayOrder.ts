// 작업 목록 보이는 순서(2026-11-24 MOON 결정, 요구사항 ST-04 "무안내에서는 정답 순서를 미리 알려주지 않는다").
// 안내 있음: 정답 순서 그대로, 번호와 함께. 안내 없음: 수행 번호(recordId)를 씨앗으로 섞은 순서, 번호 없이.
// 같은 수행이면 새로고침·화면 전환 뒤에도 순서가 같다. 섞은 결과가 정답 순서와 같으면 한 칸 돌려 다르게 한다.
// 보이는 순서만 바꾼다 — 채점·기록(src/domain·src/records)과 과제 자료는 정답 순서 그대로다.
import type { DifficultyMode } from '../domain/taskEngine'
import type { InspectionIssue } from '../domain/npcInspection'

/** 글자 씨앗 → 32비트 수(FNV-1a) */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 씨앗이 같으면 같은 수열을 내는 작은 난수기(mulberry32) */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 씨앗으로 정한 순서로 섞는다(첫 단계도 함께). 단계가 2개 이상이면 정답 순서와 반드시 다르다. 원래 배열은 그대로 둔다 */
export function shuffledSteps<T extends { stepId: string }>(steps: readonly T[], seed: string): T[] {
  const out = [...steps]
  if (out.length < 2) return out
  const next = rng(hashSeed(seed))
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  // 정답 순서와 같게 나왔으면 한 칸 돌린다(단계 이름이 서로 달라 돌린 순서는 정답과 다르다)
  if (out.every((s, i) => s.stepId === steps[i]!.stepId)) out.push(out.shift()!)
  return out
}

/** 화면 작업 목록 순서: 안내 있음은 정답 순서, 그 밖(안내 없음·시간제한 평가)은 섞은 순서 */
export function stepsForDisplay<T extends { stepId: string }>(steps: readonly T[], mode: DifficultyMode, seed: string): T[] {
  return mode === 'guided' ? [...steps] : shuffledSteps(steps, seed)
}

/** NPC 검사의 미완료 단계를 작업 목록과 같은 순서로(나머지 항목은 뒤에 원래 순서대로) */
export function inspectionIssueOrder(issues: readonly InspectionIssue[], shown: ReadonlyArray<{ stepId: string }>): InspectionIssue[] {
  const at = (id: string) => shown.findIndex((s) => s.stepId === id)
  const stepIssues = issues.filter((i): i is Extract<InspectionIssue, { kind: 'step' }> => i.kind === 'step')
  return [...[...stepIssues].sort((a, b) => at(a.stepId) - at(b.stepId)), ...issues.filter((i) => i.kind !== 'step')]
}

/** NPC 검사의 미완료 단계 이름: 안내 있음은 "N번 단계", 그 밖은 번호 대신 단계 문구(정답 순서의 자리를 드러내지 않게) */
export function stepIssueLabel(steps: ReadonlyArray<{ stepId: string; instruction: string }>, stepId: string, mode: DifficultyMode): string {
  const i = steps.findIndex((s) => s.stepId === stepId)
  if (mode === 'guided') return `${i + 1}번 단계`
  return i >= 0 ? `「${steps[i]!.instruction}」` : stepId
}

/** AI 교관에 보낼 '학생의 현재 단계'. 안내 없음(guided가 아닌 모든 방식)에서는 정답 기준 다음 단계가 순서 단서가 되므로 보내지 않는다(null). */
export function chatStepIdFor(mode: string | undefined, nextStepId: string | null | undefined): string | null {
  return mode === 'guided' ? nextStepId ?? null : null
}
