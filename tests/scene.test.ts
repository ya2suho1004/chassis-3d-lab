import { describe, expect, test } from 'vitest'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout, footprintOf, nearEquipment } from '../src/scene/layoutModel'
import { buildNavGrid, findPath, advanceAlongPath } from '../src/scene/pathfind'
import { createTaskRun, changeDisplayMode } from '../src/domain/taskEngine'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import type { ApprovedTask } from '../src/domain/types'

const layout = loadSceneLayout(raw)

describe('임시 배치 데이터', () => {
  test('개발용 임시 배치이며 layoutConfirmed=false, 축척 미확정이 명시된다', () => {
    expect(layout.sourceStatus).toBe('devProvisional')
    expect(layout.layoutConfirmed).toBe(false)
    expect(layout.metricScaleKnown).toBe(false)
  })

  test('모든 장비·기둥에 근거(basis) 표시가 있다', () => {
    const allowed = ['measured', 'measured-partial', 'sketch', 'assumption', 'teacher']
    for (const e of layout.equipment) expect(allowed).toContain(e.basis)
    for (const p of layout.pillars) expect(allowed).toContain(p.basis)
  })

  test('제동력 시험기는 실측 크기 3.00×1.20이고, 북쪽 벽까지 8.20·동쪽 벽까지 2.00을 지킨다', () => {
    const t = layout.equipment.find((e) => e.id === 'brake-tester-01')!
    expect(t.basis).toBe('measured')
    expect([t.w, t.d]).toEqual([3.0, 1.2])
    expect(t.z - layout.mainZone.zMin).toBeCloseTo(8.2, 5)
    expect(layout.mainZone.xMax - t.x).toBeCloseTo(2.0, 5)
  })

  test('장비 23개 ID가 v1-1 개념도와 같은 이름을 쓴다(시험 차량·책상은 추가 소품)', () => {
    const ids = layout.equipment.map((e) => e.id)
    for (const id of ['brake-tester-01', 'brake-control-panel-01', 'lift-zone-01/a', 'lift-zone-01/b', 'lift-zone-01/c', 'toe-gauge-zone-01', 'parts-bench-01/디스크', 'camber-caster-vehicle-01']) expect(ids).toContain(id)
  })

  test('발자국(footprint)은 회전을 반영한 축 정렬 사각형이다', () => {
    const panel = layout.equipment.find((e) => e.id === 'brake-control-panel-01')!
    const f = footprintOf(panel) // rotation 90 → w/d 교환
    expect(f.xMax - f.xMin).toBeCloseTo(0.5, 5)
    expect(f.zMax - f.zMin).toBeCloseTo(0.7, 5)
  })

  test('장비 근접 판정은 접근점 기준 반경 안이면 true', () => {
    const tester = layout.equipment.find((e) => e.id === 'brake-tester-01')!
    expect(nearEquipment({ x: tester.accessPoint!.x + 0.1, z: tester.accessPoint!.z - 0.1 }, tester, 1.0)).toBe(true)
    expect(nearEquipment({ x: 5, z: 5 }, tester, 1.0)).toBe(false)
  })
})

describe('격자 길찾기', () => {
  const grid = buildNavGrid(layout, 0.5)

  test('격자는 장비·기둥·벽 밖을 막고 시작점과 시험기 접근점은 비어 있다', () => {
    expect(grid.isBlocked(layout.studentStart.x, layout.studentStart.z)).toBe(false)
    const tester = layout.equipment.find((e) => e.id === 'brake-tester-01')!
    expect(grid.isBlocked(tester.accessPoint!.x, tester.accessPoint!.z)).toBe(false)
    expect(grid.isBlocked(tester.x, tester.z)).toBe(true) // 장비 위
    expect(grid.isBlocked(-1, 5)).toBe(true) // 구역 밖(서쪽 바깥)
  })

  test('시작점에서 시험기 접근점까지 경로가 있고 막힌 칸을 지나지 않는다', () => {
    const tester = layout.equipment.find((e) => e.id === 'brake-tester-01')!
    const path = findPath(grid, layout.studentStart, tester.accessPoint!)
    expect(path).not.toBeNull()
    expect(path!.length).toBeGreaterThan(5)
    for (const p of path!) expect(grid.isBlocked(p.x, p.z)).toBe(false)
    const last = path![path!.length - 1]!
    expect(Math.hypot(last.x - tester.accessPoint!.x, last.z - tester.accessPoint!.z)).toBeLessThan(0.75)
  })

  test('장비 위를 목적지로 찍으면 경로가 없다(null)', () => {
    const tester = layout.equipment.find((e) => e.id === 'brake-tester-01')!
    expect(findPath(grid, layout.studentStart, { x: tester.x, z: tester.z })).toBeNull()
  })

  test('경로를 따라 일정 속도로 전진하고 끝에 도달하면 완료다', () => {
    const path = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }]
    let s = advanceAlongPath({ x: 0, z: 0 }, path, 0, 1.0, 0.5)
    expect(s.pos).toEqual({ x: 0.5, z: 0 })
    expect(s.done).toBe(false)
    s = advanceAlongPath(s.pos, path, s.index, 1.0, 10)
    expect(s.pos).toEqual({ x: 1, z: 1 })
    expect(s.done).toBe(true)
  })
})

describe('화면 모드 전환 기록', () => {
  test('3D→도식 전환은 displayModeChanged 이벤트(from/to/사유)와 경험 모드 목록에 남는다', () => {
    let r = createTaskRun(lv1 as ApprovedTask, { difficultyMode: 'guided' })
    expect(r.experiencedDisplayModes).toEqual(['threeD'])
    r = changeDisplayMode(r, 'diagram', 'userChoice').run
    const ev = r.events.at(-1)!
    expect(ev.type).toBe('displayModeChanged')
    expect(ev.fromDisplayMode).toBe('threeD')
    expect(ev.toDisplayMode).toBe('diagram')
    expect(ev.reasonCode).toBe('userChoice')
    expect(r.displayMode).toBe('diagram')
    expect(r.experiencedDisplayModes).toEqual(['threeD', 'diagram'])
  })

  test('기록 payload의 displayMode는 시작 모드(threeD), 경험 모드는 전환 이력을 담는다', async () => {
    const { buildRecordPayload } = await import('../src/domain/record')
    const { createDemoSession } = await import('../src/app/session')
    let r = createTaskRun(lv1 as ApprovedTask, { difficultyMode: 'guided', displayMode: 'threeD' })
    r = changeDisplayMode(r, 'diagram', 'userChoice').run
    const session = createDemoSession({ studentCode: 'A-01', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview' })
    const p = buildRecordPayload(r, session, { completedAtIso: '2026-10-21T13:10:00Z', completionStatus: 'aborted' })
    expect(p.displayMode).toBe('threeD')
    expect(p.experiencedDisplayModes).toEqual(['threeD', 'diagram'])
  })
})

describe('2차 실측(2026-10-26) 반영', () => {
  const tester = layout.equipment.find((e) => e.id === 'brake-tester-01')!
  test('조작부 앞면(버튼면)은 롤러 중심에서 동쪽 1.30, 같은 남북선 위이고 서쪽을 향한다', () => {
    const panel = layout.equipment.find((e) => e.id === 'brake-control-panel-01')!
    const f = footprintOf(panel)
    expect(f.xMin - tester.x).toBeCloseTo(1.3, 5) // 앞면 = 본체 서쪽 면
    expect(panel.z).toBeCloseTo(tester.z, 5)
    expect(f.xMax).toBeLessThanOrEqual(layout.mainZone.xMax) // 벽 안
  })
  test('리프트 옆 기둥의 동쪽 면은 장비 서쪽 끝에서 1.50 서쪽에 있다', () => {
    const p = layout.pillars.find((x) => x.id === 'pillar-4')!
    expect(tester.x - 1.5 - (p.x + p.size / 2)).toBeCloseTo(1.5, 5)
  })
  test('리프트 바닥판은 2.20×4.00이고 ABS 구역은 4.10×10.00으로 동쪽 벽 바깥에 있다', () => {
    for (const id of ['lift-zone-01/a', 'lift-zone-01/b', 'lift-zone-01/c']) {
      const l = layout.equipment.find((e) => e.id === id)!
      expect([l.w, l.d]).toEqual([2.2, 4.0])
    }
    const ab = layout.absProtrusion!
    expect(ab.xMax - ab.xMin).toBeCloseTo(4.1, 5)
    expect(ab.zMax - ab.zMin).toBeCloseTo(10.0, 5)
    expect(ab.xMin).toBeCloseTo(layout.mainZone.xMax, 5)
  })
})
