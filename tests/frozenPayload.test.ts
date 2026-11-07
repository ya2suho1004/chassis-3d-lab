// G2(2026-11-08 Codex 회의): 결과 화면·JSON·CSV 내려받기는 확정 저장한 원본 하나를 쓴다.
// 예전에는 결과 화면이 new Date()로 기록을 다시 만들어 완료 시각이 저장본과 달라질 수 있었다.
import fs from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { resolveResultPayload } from '../src/app/resultPayload'
import type { RecordPayload } from '../src/domain/record'

const frozen = { recordId: 'r-1', completedAt: '2026-11-08T01:00:00.000Z' } as unknown as RecordPayload

describe('결과 화면의 기록 — 확정 원본 하나(G2)', () => {
  test('확정 원본이 있으면 그대로 쓰고 다시 만들지 않는다', () => {
    const build = vi.fn(() => ({ ...frozen, completedAt: '2026-11-08T01:00:09.000Z' }) as unknown as RecordPayload)
    const r = resolveResultPayload(frozen, build)
    expect(r).toEqual({ ok: true, value: frozen })
    expect(build).not.toHaveBeenCalled()
  })

  test('확정 원본이 없을 때만 만들고, 실패하면 오류를 돌려준다', () => {
    expect(resolveResultPayload(null, () => frozen)).toEqual({ ok: true, value: frozen })
    expect(resolveResultPayload(undefined, () => { throw new Error('BAD') })).toEqual({ ok: false, error: 'BAD' })
  })

  test('TaskScreen은 저장한 원본(없으면 저장하려던 원본)을 결과 화면으로 넘긴다', () => {
    const src = fs.readFileSync('src/screens/TaskScreen.tsx', 'utf8')
    expect(src.match(/buildRecordPayload\(/g)?.length).toBe(1)
    expect(src).toMatch(/onFinish\(finalRun, status, stored\?\.envelope \?\? null, null, stored\?\.payload \?\? payload\)/)
    expect(src).toMatch(/onFinish\(finalRun, status, null, r\.errorCode \?\? 'FREEZE_FAILED', payload\)/)
  })

  test('App·ResultScreen이 원본을 이어받아 쓴다', () => {
    const app = fs.readFileSync('src/App.tsx', 'utf8')
    expect(app).toMatch(/frozenPayload=\{screen\.frozenPayload\}/)
    const res = fs.readFileSync('src/screens/ResultScreen.tsx', 'utf8')
    expect(res).toMatch(/resolveResultPayload\(frozenPayload,/)
  })
})
