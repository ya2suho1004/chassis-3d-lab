import { afterEach, describe, expect, test, vi } from 'vitest'
import { caseKey, parsePreset, PRESET_KEY, savePreset } from '../src/app/teacherPreset'
import { listTasks } from '../src/app/session'

const known = listTasks().map(caseKey)
const good = { caseId: known[0], usagePhase: 'preview', difficultyMode: 'guided', vehicleEntryDirection: 'north' }

describe('교사 설정(기기별)', () => {
  test('두 과제 사례 모두 사례 ID가 있다', () => {
    expect(known.every((k) => k !== '')).toBe(true)
  })

  test('올바른 설정은 그대로 읽는다', () => {
    // 세션 칸이 없던 예전 저장값은 시연 세션으로 읽는다(설계 2026-11-03-class-sessions)
    expect(parsePreset(JSON.stringify(good), known)).toEqual({ ...good, sessionCode: 'DEMO-ONLY' })
    expect(parsePreset(JSON.stringify({ ...good, vehicleEntryDirection: null }), known)?.vehicleEntryDirection).toBeNull()
  })

  test('잠금 칸(locked)은 없어졌다 — 예전 저장값의 locked는 무엇이든 문제없이 읽고 결과에 옮기지 않는다(학생 화면은 늘 막힘, 설계 2026-11-14 §3-6)', () => {
    for (const locked of [true, false, 'yes', undefined]) {
      const r = parsePreset(JSON.stringify({ ...good, locked }), known)
      expect(r).toEqual({ ...good, sessionCode: 'DEMO-ONLY' })
      expect(r && 'locked' in r).toBe(false)
    }
  })

  test('없거나 깨졌거나 모르는 값이면 무시한다(기본값으로 들어감)', () => {
    expect(parsePreset(null, known)).toBeNull()
    expect(parsePreset('{깨짐', known)).toBeNull()
    expect(parsePreset(JSON.stringify({ ...good, caseId: 'case-unknown' }), known)).toBeNull()
    expect(parsePreset(JSON.stringify({ ...good, difficultyMode: 'timedAssessment' }), known)).toBeNull()
    expect(parsePreset(JSON.stringify({ ...good, usagePhase: 'exam' }), known)).toBeNull()
    expect(parsePreset(JSON.stringify({ ...good, vehicleEntryDirection: 'east' }), known)).toBeNull()
  })

  test('추가 칸(예: 이름)은 결과에 옮기지 않는다', () => {
    const r = parsePreset(JSON.stringify({ ...good, teacherName: '홍길동' }), known)
    expect(r && Object.keys(r).sort()).toEqual(['caseId', 'difficultyMode', 'sessionCode', 'usagePhase', 'vehicleEntryDirection'])
  })
})

describe('교사 설정 저장', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  test('예전 판(0.3.6-demo까지)도 읽을 수 있게 locked: true를 함께 적는다', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => store.set(k, v), getItem: (k: string) => store.get(k) ?? null, removeItem: (k: string) => store.delete(k) })
    const p = parsePreset(JSON.stringify(good), known)!
    expect(savePreset(p)).toBe(true)
    expect(JSON.parse(store.get(PRESET_KEY)!)).toEqual({ ...p, locked: true })
    expect(parsePreset(store.get(PRESET_KEY)!, known)).toEqual(p)
    expect(savePreset(null)).toBe(true)
    expect(store.has(PRESET_KEY)).toBe(false)
  })
})
