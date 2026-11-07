// 결과 화면이 쓸 기록(G2, 2026-11-08 Codex 회의): 확정 저장한 원본이 있으면 그것 하나만 쓴다(표시·JSON·CSV 모두).
// 없을 때(저장 전 오류 등)만 만든다. 다시 만들면 완료 시각이 저장본과 달라지기 때문이다.
import type { RecordPayload } from '../domain/record'

export type ResultPayload = { ok: true; value: RecordPayload } | { ok: false; error: string }

export function resolveResultPayload(frozen: RecordPayload | null | undefined, build: () => RecordPayload): ResultPayload {
  if (frozen) return { ok: true, value: frozen }
  try {
    return { ok: true, value: build() }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
