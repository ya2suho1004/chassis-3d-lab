// tests/locomotion.test.ts — 걷기 가속·감속, 도착 감속, 걷기·서기 판정, 걷기 동작 재생 속도(설계 2026-11-13 캐릭터와 움직임 §6)
import { describe, expect, test } from 'vitest'
import {
  ACCEL_TIME, DECEL_TIME, MAX_STEP_DT, STICK_DEADZONE, WALK_ANIM_MIN, WALK_OFF_SPEED, WALK_ON_SPEED, WALK_SPEED,
  approachSpeed, arrivalSpeed, nextWalking, pathRemaining, pathSpeed, stickTargetSpeed, walkPlayback,
} from '../src/scene/locomotion'
import { advanceAlongPath } from '../src/scene/pathfind'
import type { Pt } from '../src/scene/layoutModel'

const DTS = [1 / 144, 1 / 120, 1 / 60, 1 / 30, 1 / 15, 0.1, 0.25, 2]

describe('상수', () => {
  test('최고 속도는 1.6 m/s 그대로, 출발 0.25초·멈춤 0.2초', () => {
    expect(WALK_SPEED).toBe(1.6)
    expect(ACCEL_TIME).toBe(0.25)
    expect(DECEL_TIME).toBe(0.2)
    expect(WALK_OFF_SPEED).toBeLessThan(WALK_ON_SPEED)
    // 조이스틱을 조금만 밀어도 걷기로 보일 만큼은 빠르다(떨림 없이 걷기 판정에 들어간다)
    expect(stickTargetSpeed(STICK_DEADZONE + 0.01)).toBeGreaterThan(WALK_ON_SPEED)
  })
})

describe('가속·감속(approachSpeed)', () => {
  test('어떤 dt에서도 목표(최고 속도)를 넘지 않고 0 밑으로 내려가지 않는다', () => {
    for (const dt of DTS) {
      let v = 0
      for (let i = 0; i < 200; i++) {
        v = approachSpeed(v, WALK_SPEED, dt)
        expect(v).toBeLessThanOrEqual(WALK_SPEED)
        expect(v).toBeGreaterThanOrEqual(0)
      }
      expect(v).toBe(WALK_SPEED)
      for (let i = 0; i < 200; i++) {
        v = approachSpeed(v, 0, dt)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(WALK_SPEED)
      }
      expect(v).toBe(0)
    }
  })

  test('정지에서 0.25초 뒤 최고 속도 근처(60·120 fps)', () => {
    for (const fps of [60, 120]) {
      let v = 0
      for (let i = 0; i < Math.round(ACCEL_TIME * fps); i++) v = approachSpeed(v, WALK_SPEED, 1 / fps)
      expect(v).toBeGreaterThan(WALK_SPEED * 0.97)
      // 0.15초 때는 아직 최고 속도가 아니다(즉시 출발이 아니다)
      let w = 0
      for (let i = 0; i < Math.round(0.15 * fps); i++) w = approachSpeed(w, WALK_SPEED, 1 / fps)
      expect(w).toBeLessThan(WALK_SPEED * 0.7)
    }
  })

  test('최고 속도에서 정지까지 약 0.2초', () => {
    let v = WALK_SPEED, t = 0
    while (v > 0) { v = approachSpeed(v, 0, 1 / 60); t += 1 / 60 }
    expect(t).toBeGreaterThan(0.18)
    expect(t).toBeLessThan(0.22)
  })

  test('dt가 아주 커도 한 번에 MAX_STEP_DT만큼만 바뀐다(발산 없음)', () => {
    expect(approachSpeed(0, WALK_SPEED, 1000)).toBeCloseTo((WALK_SPEED / ACCEL_TIME) * MAX_STEP_DT, 9)
    expect(approachSpeed(0, WALK_SPEED, Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(WALK_SPEED)
    expect(approachSpeed(WALK_SPEED, 0, 1000)).toBeCloseTo(WALK_SPEED - (WALK_SPEED / DECEL_TIME) * MAX_STEP_DT, 9)
    expect(approachSpeed(1, 1, 0)).toBe(1)
  })

  test('목표가 최고 속도보다 커도 최고 속도에서 멈춘다', () => {
    let v = 0
    for (let i = 0; i < 100; i++) v = approachSpeed(v, 5, 1 / 30)
    expect(v).toBe(WALK_SPEED)
  })

  test('모션 줄이기 설정이면 즉시 출발·즉시 정지', () => {
    expect(approachSpeed(0, WALK_SPEED, 1 / 60, true)).toBe(WALK_SPEED)
    expect(approachSpeed(WALK_SPEED, 0, 1 / 60, true)).toBe(0)
    expect(pathSpeed(0, 0.01, 1 / 60, true)).toBe(WALK_SPEED)
  })
})

describe('조이스틱 목표 속도와 손을 뗀 뒤의 미끄러짐', () => {
  test('죽은 구간이면 0, 그 밖은 입력 크기에 비례(최대 1)', () => {
    expect(stickTargetSpeed(0)).toBe(0)
    expect(stickTargetSpeed(STICK_DEADZONE)).toBe(0)
    expect(stickTargetSpeed(0.5)).toBeCloseTo(0.8, 9)
    expect(stickTargetSpeed(1)).toBe(WALK_SPEED)
    expect(stickTargetSpeed(1.4)).toBe(WALK_SPEED)
  })
  test('최고 속도에서 손을 떼면 0.1~0.2 m 더 나아가 선다', () => {
    let v = WALK_SPEED, d = 0
    while (v > 0) { v = approachSpeed(v, 0, 1 / 60); d += v / 60 }
    expect(d).toBeGreaterThan(0.1)
    expect(d).toBeLessThan(0.2)
  })
})

/** 경로 이동을 화면처럼 흉내 낸다: 속도 → 전진 */
function walkPath(path: Pt[], dt: number, reduced = false) {
  let pos = { ...path[0]! }, idx = 0, v = 0, frames = 0, lastV = 0
  const speeds: number[] = []
  const xs: number[] = []
  for (; frames < 10_000; frames++) {
    v = pathSpeed(v, pathRemaining(pos, path, idx), dt, reduced)
    speeds.push(v)
    const r = advanceAlongPath(pos, path, idx, v, Math.min(dt, MAX_STEP_DT))
    pos = r.pos; idx = r.index; xs.push(pos.x)
    lastV = v
    if (r.done) break
  }
  return { pos, frames, speeds, xs, lastV }
}

describe('경로 이동의 도착 감속', () => {
  test('남은 거리', () => {
    const path = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 2 }]
    expect(pathRemaining({ x: 0, z: 0 }, path, 0)).toBeCloseTo(3, 9)
    expect(pathRemaining({ x: 0.5, z: 0 }, path, 1)).toBeCloseTo(2.5, 9)
    expect(pathRemaining({ x: 1, z: 2 }, path, 3)).toBe(0)
  })
  test('도착 속도 상한은 남은 거리에서 감속해 설 수 있는 속도(최고 속도까지)', () => {
    expect(arrivalSpeed(0)).toBe(0)
    expect(arrivalSpeed(10)).toBe(WALK_SPEED)
    // 최고 속도로 감속을 시작하는 거리 = v²/(2a) = 0.16 m
    expect(arrivalSpeed(0.16)).toBeCloseTo(WALK_SPEED, 6)
    expect(arrivalSpeed(0.04)).toBeCloseTo(WALK_SPEED / 2, 6)
  })
  test('여러 dt에서 목적지를 지나치지 않고 정확히 닿는다', () => {
    const path = [{ x: 0, z: 0 }, { x: 3, z: 0 }]
    for (const dt of DTS) {
      const w = walkPath(path, dt)
      expect(w.pos).toEqual({ x: 3, z: 0 })
      for (const s of w.speeds) expect(s).toBeLessThanOrEqual(WALK_SPEED)
      for (const x of w.xs) expect(x).toBeLessThanOrEqual(3)
      // 앞으로만 간다(못 미친 채 서거나 뒤로 가지 않는다)
      for (let i = 1; i < w.xs.length; i++) expect(w.xs[i]!).toBeGreaterThan(w.xs[i - 1]!)
    }
  })
  test('60 fps에서 도착 직전에는 천천히 닿고, 중간에는 최고 속도로 걷는다', () => {
    const w = walkPath([{ x: 0, z: 0 }, { x: 3, z: 0 }], 1 / 60)
    expect(w.lastV).toBeLessThan(0.5)
    expect(Math.max(...w.speeds)).toBe(WALK_SPEED)
    // 일정 속도(3 / 1.6 = 1.875초)보다 출발·도착에 0.25초 안쪽만 더 든다
    expect(w.frames / 60).toBeGreaterThan(3 / WALK_SPEED)
    expect(w.frames / 60).toBeLessThan(3 / WALK_SPEED + 0.25)
  })
  test('아주 짧은 경로(0.1 m)도 유한한 프레임에 정확히 닿는다', () => {
    for (const dt of DTS) {
      const w = walkPath([{ x: 0, z: 0 }, { x: 0.1, z: 0 }], dt)
      expect(w.pos).toEqual({ x: 0.1, z: 0 })
      expect(w.frames).toBeLessThan(200)
    }
  })
  test('모션 줄이기 설정이면 최고 속도로 가다 즉시 선다(예전과 같음)', () => {
    const w = walkPath([{ x: 0, z: 0 }, { x: 3, z: 0 }], 1 / 60, true)
    expect(w.pos).toEqual({ x: 3, z: 0 })
    expect(w.speeds.every((s) => s === WALK_SPEED)).toBe(true)
  })
})

describe('걷기·서기 판정(떨림 없음)', () => {
  test('켜질 때는 WALK_ON_SPEED 이상, 꺼질 때는 WALK_OFF_SPEED 미만', () => {
    expect(nextWalking(false, 0)).toBe(false)
    expect(nextWalking(false, WALK_ON_SPEED - 0.01)).toBe(false)
    expect(nextWalking(false, WALK_ON_SPEED)).toBe(true)
    expect(nextWalking(true, WALK_ON_SPEED - 0.01)).toBe(true)
    expect(nextWalking(true, WALK_OFF_SPEED)).toBe(true)
    expect(nextWalking(true, WALK_OFF_SPEED - 0.001)).toBe(false)
    expect(nextWalking(true, 0)).toBe(false)
  })
  test('출발·멈춤 한 번에 걷기 판정은 한 번씩만 바뀐다', () => {
    let v = 0, w = false, flips = 0
    const step = (target: number) => { v = approachSpeed(v, target, 1 / 60); const n = nextWalking(w, v); if (n !== w) flips++; w = n }
    for (let i = 0; i < 30; i++) step(WALK_SPEED)
    for (let i = 0; i < 30; i++) step(0)
    expect(flips).toBe(2)
    expect(w).toBe(false)
  })
})

describe('걷기 동작 재생 속도', () => {
  const cycle = 0.808
  test('최고 속도일 때 지금 값(WALK_SPEED / 한 주기 거리)과 같다', () => {
    expect(walkPlayback(WALK_SPEED, cycle)).toBeCloseTo(WALK_SPEED / cycle, 9)
    expect(walkPlayback(WALK_SPEED, cycle * 0.94)).toBeCloseTo(WALK_SPEED / (cycle * 0.94), 9)
  })
  test('현재 속도에 비례한다', () => {
    expect(walkPlayback(1.2, cycle)).toBeCloseTo(1.2 / cycle, 9)
    expect(walkPlayback(0.8, cycle) / walkPlayback(1.6, cycle)).toBeCloseTo(0.5, 9)
  })
  test('아주 느릴 때는 아래 한계(최고 속도 재생의 WALK_ANIM_MIN배)에서 멈춘다', () => {
    const floor = (WALK_ANIM_MIN * WALK_SPEED) / cycle
    expect(walkPlayback(0, cycle)).toBeCloseTo(floor, 9)
    expect(walkPlayback(0.1, cycle)).toBeCloseTo(floor, 9)
    expect(walkPlayback(5, cycle)).toBeCloseTo(WALK_SPEED / cycle, 9)
  })
})
