// 연습 규정값(기기별) — 디스크 런아웃·차동기어 백래시 연습의 판정 기준. 교사 화면에서 바꿀 수 있다.
// 기본값은 교사 확인지 0F(MOON, 2026-10-31)의 답: 둘 다 0.10 mm 이하가 양호(근거: 실습장 차종이 고정되어 실습장에서 쓰는 규정값).
// 이 기기 localStorage에만 두며 전송하지 않는다. 연습은 기록이 없으므로 이 값도 기록에 남지 않는다.

export interface PracticeSpec {
  /** 디스크 런아웃 정비 한계(mm 이하 양호) */
  runoutMaxMm: number
  /** 차동기어 백래시 정비 한계(mm 이하 양호) */
  backlashMaxMm: number
}

export const DEFAULT_PRACTICE_SPEC: PracticeSpec = { runoutMaxMm: 0.1, backlashMaxMm: 0.1 }
export const PRACTICE_SPEC_KEY = 'chassis.practiceSpec.v1'
export const PRACTICE_SPEC_SOURCE = '실습장 기준(교사 확인)'

/** 쓸 수 있는 한계값인지(0 초과 ~ 게이지 범위 10 mm 이하) */
const okMm = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 10

/** 저장된 값을 검사해 쓸 수 있으면 돌려준다. 틀린 값이 섞이면 기본값 */
export function parsePracticeSpec(raw: string | null): PracticeSpec {
  if (!raw) return DEFAULT_PRACTICE_SPEC
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (okMm(o.runoutMaxMm) && okMm(o.backlashMaxMm)) return { runoutMaxMm: o.runoutMaxMm, backlashMaxMm: o.backlashMaxMm }
  } catch { /* 기본값 */ }
  return DEFAULT_PRACTICE_SPEC
}

export function loadPracticeSpec(): PracticeSpec {
  try { return parsePracticeSpec(localStorage.getItem(PRACTICE_SPEC_KEY)) } catch { return DEFAULT_PRACTICE_SPEC }
}

/** 저장 성공 여부를 돌려준다. null이면 기본값으로 되돌림 */
export function savePracticeSpec(s: PracticeSpec | null): boolean {
  try {
    if (s) localStorage.setItem(PRACTICE_SPEC_KEY, JSON.stringify(s))
    else localStorage.removeItem(PRACTICE_SPEC_KEY)
    return true
  } catch { return false }
}

export type Verdict = 'good' | 'bad'

/** 학생이 적은 측정값을 한계와 비교한 판정(경계값 포함 양호) — 답안지처럼 측정값 → 규정값 비교 */
export function verdictFor(measuredMm: number, maxMm: number): Verdict {
  return measuredMm <= maxMm + 1e-9 ? 'good' : 'bad'
}

export const fmtMm = (v: number) => v.toFixed(2)
