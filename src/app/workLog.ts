// src/app/workLog.ts
// 결과 화면 '정비 일지' 세 묶음(측정 → 계산 → 판정). 최종 답만 보인다(최초·최종 비교는 아래 기존 표).
// 계측부라 화면에서 원래 색을 쓴다(설계 §2-1). 기록 형식은 건드리지 않는다.
import type { ResponseSummary } from '../domain/grading'
import { itemLabel, verdictLabel } from './resultLabels'

export interface WorkLogGroup { title: '측정' | '계산' | '판정'; lines: string[] }

export function workLogGroups(sum: ResponseSummary): WorkLogGroup[] {
  const unitOf = (u: string | null | undefined) => (u === '°' ? '°' : u ? ` ${u}` : '')
  return [
    { title: '측정', lines: sum.measurementInputs.map((i) => `${itemLabel(i.itemId)} ${i.finalInput ?? '—'}${i.finalInput ? unitOf(i.unit) : ''}`) },
    { title: '계산', lines: sum.calculationAnswers.map((i) => `${itemLabel(i.itemId)} ${i.finalInput ?? '—'}`) },
    { title: '판정', lines: sum.judgmentAnswers.map((i) => `${itemLabel(i.itemId)} ${i.finalAnswer ? verdictLabel(i.finalAnswer) : '—'}`) },
  ]
}
