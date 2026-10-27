import { describe, expect, test } from 'vitest'
import { caseKey, parsePreset } from '../src/app/teacherPreset'
import { listTasks } from '../src/app/session'

const known = listTasks().map(caseKey)
const good = { caseId: known[0], usagePhase: 'preview', difficultyMode: 'guided', vehicleEntryDirection: 'north', locked: true }

describe('교사 설정(기기별)', () => {
  test('두 과제 사례 모두 사례 ID가 있다', () => {
    expect(known.every((k) => k !== '')).toBe(true)
  })

  test('올바른 설정은 그대로 읽는다', () => {
    expect(parsePreset(JSON.stringify(good), known)).toEqual(good)
    expect(parsePreset(JSON.stringify({ ...good, vehicleEntryDirection: null, locked: false }), known)?.vehicleEntryDirection).toBeNull()
  })

  test('없거나 깨졌거나 모르는 값이면 무시한다(학생이 직접 고르는 화면)', () => {
    expect(parsePreset(null, known)).toBeNull()
    expect(parsePreset('{깨짐', known)).toBeNull()
    expect(parsePreset(JSON.stringify({ ...good, caseId: 'case-unknown' }), known)).toBeNull()
    expect(parsePreset(JSON.stringify({ ...good, difficultyMode: 'timedAssessment' }), known)).toBeNull()
    expect(parsePreset(JSON.stringify({ ...good, usagePhase: 'exam' }), known)).toBeNull()
    expect(parsePreset(JSON.stringify({ ...good, vehicleEntryDirection: 'east' }), known)).toBeNull()
    expect(parsePreset(JSON.stringify({ ...good, locked: 'yes' }), known)).toBeNull()
  })

  test('추가 칸(예: 이름)은 결과에 옮기지 않는다', () => {
    const r = parsePreset(JSON.stringify({ ...good, teacherName: '홍길동' }), known)
    expect(r && Object.keys(r).sort()).toEqual(['caseId', 'difficultyMode', 'locked', 'usagePhase', 'vehicleEntryDirection'])
  })
})
