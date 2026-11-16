// 도감 저장(설계 docs/superpowers/specs/2026-11-16-codex-window-design.md §3-3).
// 모은 장비 번호 목록을 학번(입장 코드)별로 이 기기 localStorage에만 둔다. 캐릭터 저장(app/avatar.ts)과 같은 방식이다.
// 화면 표시용이다 — 연구 기록·서버·AI 요청에는 넣지 않는다. '기록 없이 하기'는 이 모듈을 부르지 않는다(실습 화면이 막는다).
// 저장 공간이 막혀도(사파리 개인 정보 보호 모드 등) 던지지 않는다. 실습은 그대로 되고 도감은 그 수행 동안만 남는다.

export const CODEX_KEY = 'chassis.codex.v1'

/** 저장소 전체(코드 → 모은 번호 목록)를 읽어 쓸 수 있는 것만 남긴다. 겹친 번호는 하나만 */
export function parseCodexStore(raw: string | null): Record<string, string[]> {
  if (!raw) return {}
  let v: unknown
  try { v = JSON.parse(raw) } catch { return {} }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {}
  const out: Record<string, string[]> = {}
  for (const [code, ids] of Object.entries(v as Record<string, unknown>)) {
    if (!Array.isArray(ids)) continue
    out[code] = [...new Set(ids.filter((x): x is string => typeof x === 'string'))]
  }
  return out
}

/** 그 코드의 도감. 지금 배치 자료에 없는 번호는 버린다(모은 순서는 지킨다) */
export function loadCodex(code: string, knownIds: readonly string[]): string[] {
  try {
    const known = new Set(knownIds)
    return (parseCodexStore(localStorage.getItem(CODEX_KEY))[code] ?? []).filter((id) => known.has(id))
  } catch { return [] }
}

/** 처음 누른 장비 하나를 더해 저장한다. 저장 성공 여부를 돌려준다(실패해도 이번 수행은 그대로 진행) */
export function addToCodex(code: string, id: string): boolean {
  try {
    const all = parseCodexStore(localStorage.getItem(CODEX_KEY))
    const mine = all[code] ?? []
    if (!mine.includes(id)) all[code] = [...mine, id]
    localStorage.setItem(CODEX_KEY, JSON.stringify(all))
    return true
  } catch { return false }
}
