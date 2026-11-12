// 실습장 안내 규칙(Codex 교차 검토 2026-11-06 A1·A5)
import { describe, expect, it } from 'vitest'
import { chatTaskId, loadBadge, nextHighlightId } from '../src/app/labGuide'
import { listTasks } from '../src/app/session'
import { createTaskRun } from '../src/domain/taskEngine'

const turning = listTasks().find((t) => t.taskId === 'min-turning-radius')!
const braking = listTasks().find((t) => t.taskId !== 'min-turning-radius')!
const runOf = (task: typeof turning, mode: 'guided' | 'unguided') => createTaskRun(task, { difficultyMode: mode })

describe('nextHighlightId — 3D 다음 장비 강조', () => {
  it('안내 있음이면 다음 단계 장비를 강조한다', () => {
    const run = runOf(turning, 'guided')
    const step = turning.steps.find((s) => s.stepId === run.nextStepId)!
    expect(nextHighlightId(run)).toBe(step.equipmentId)
  })
  it('안내 없음이면 강조하지 않는다(최초 응답 전 다음 단계 자동 노출 금지)', () => {
    expect(nextHighlightId(runOf(turning, 'unguided'))).toBeNull()
    expect(nextHighlightId(runOf(braking, 'unguided'))).toBeNull()
  })
  it('시간 제한 평가에서도 강조하지 않는다(목적지 표식은 안내 있음에서만 — 설계 2026-11-12 §4.5)', () => {
    expect(nextHighlightId(createTaskRun(turning, { difficultyMode: 'timedAssessment' }))).toBeNull()
    expect(nextHighlightId(createTaskRun(braking, { difficultyMode: 'timedAssessment' }))).toBeNull()
  })
  it('과제 전이면 강조 없음', () => {
    expect(nextHighlightId(null)).toBeNull()
  })
})

describe('chatTaskId — AI 교관에 보낼 과제', () => {
  it('과제 수령 전에도 고른 과제를 보낸다', () => {
    expect(chatTaskId(turning, null)).toBe('min-turning-radius')
    expect(chatTaskId(braking, null)).toBeNull()
  })
  it('수행 중이면 수행 과제를 따른다', () => {
    expect(chatTaskId(braking, runOf(turning, 'guided'))).toBe('min-turning-radius')
  })
})

describe('loadBadge — 준비 화면을 20초에 닫은 뒤의 표시(A4)', () => {
  it('준비 화면이 떠 있으면 따로 표시 안 함', () => {
    expect(loadBadge({ loadedOnce: false, active: true, progress: 40, errorCount: 0 })).toBeNull()
  })
  it('닫힌 뒤에도 받는 중이면 진행률', () => {
    expect(loadBadge({ loadedOnce: true, active: true, progress: 62.4, errorCount: 0 })).toBe('3D 자료를 아직 받는 중… 62%')
  })
  it('받기에 실패했으면 할 일을 안내', () => {
    const t = loadBadge({ loadedOnce: true, active: false, progress: 90, errorCount: 2 })!
    expect(t).toContain('받지 못했습니다')
    expect(t).toContain('품질 낮음')
  })
  it('다 받았으면 표시 없음', () => {
    expect(loadBadge({ loadedOnce: true, active: false, progress: 100, errorCount: 0 })).toBeNull()
  })
})
