// 사례 지킴이(계산기 설계 §6): 계산기의 정확한 sin과 sin 표로 낸 답이 기재 규칙(소수 첫째 자리, 둘째 자리 버림) 뒤 같고,
// 정확한 값이 절사 경계에 너무 가깝지 않다. 새 사례를 만들면 여기에 더한다
import { describe, expect, test } from 'vitest'
import b1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import b2 from '../src/data/tasks/task.braking-force.case-lv2.json'
import t1 from '../src/data/tasks/task.min-turning-radius.case-lv1.json'
import t2 from '../src/data/tasks/task.min-turning-radius.case-lv2.json'
import { createResponseSheet } from '../src/domain/grading'
import type { ApprovedTask } from '../src/domain/types'

const trunc1 = (x: number) => Math.floor(x * 10 + 1e-9) / 10
/** 0.1 단위 경계까지 거리. 정확히 경계 위(1e-9 안)는 0 */
const gap = (x: number) => { const lo = x - trunc1(x); return lo < 1e-9 ? 0 : Math.min(lo, trunc1(x) + 0.1 - x) }
const safe = (x: number) => gap(x) === 0 || gap(x) >= 1e-4
const ref = (task: ApprovedTask, itemId: string) => createResponseSheet(task).items.find((i) => i.itemId === itemId)!.referenceValue

describe('최소회전반경: sin 표와 계산기 sin이 같은 답(§6)', () => {
  for (const [label, raw] of [['사례 1', t1], ['사례 2', t2]] as const) {
    test(label, () => {
      const task = raw as unknown as ApprovedTask
      const m = task.measurement as unknown as { wheelbaseM: number; kingpinOffsetM: number; turnDirection: 'left' | 'right'; leftAngleDeg: number; rightAngleDeg: number; sinTable: Record<string, number> }
      const outer = m.turnDirection === 'left' ? m.rightAngleDeg : m.leftAngleDeg // 회전할 때 바깥쪽 앞바퀴
      const byTable = m.wheelbaseM / m.sinTable[String(outer)]! + m.kingpinOffsetM
      const byCalc = m.wheelbaseM / Math.sin((outer * Math.PI) / 180) + m.kingpinOffsetM
      expect(trunc1(byTable)).toBe(ref(task, 'radius'))
      expect(trunc1(byCalc)).toBe(ref(task, 'radius'))
      expect(safe(byTable)).toBe(true)
      expect(safe(byCalc)).toBe(true)
    })
  }
})

describe('제동력: 계산기로 낸 편차·합이 기준값과 같고 절사 경계에 너무 가깝지 않다(§6)', () => {
  for (const [label, raw] of [['사례 1', b1], ['사례 2', b2]] as const) {
    test(label, () => {
      const task = raw as unknown as ApprovedTask
      const m = task.measurement as unknown as { axleWeight: number; left: number; right: number }
      const deviation = (Math.abs(m.left - m.right) / m.axleWeight) * 100 // 일반 계산기의 왼쪽부터 계산과 같은 순서
      const sum = ((m.left + m.right) / m.axleWeight) * 100
      expect(trunc1(deviation)).toBe(ref(task, 'deviation'))
      expect(trunc1(sum)).toBe(ref(task, 'sum'))
      expect(safe(deviation)).toBe(true)
      expect(safe(sum)).toBe(true)
    })
  }
})
