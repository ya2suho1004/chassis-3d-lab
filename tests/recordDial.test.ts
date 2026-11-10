// 작업 목록의 측정판(설계 2026-11-10 §5, 결정 A): 숫자 대신 눈금 그림, 오답을 안 뒤에만 측정 당시 다시 보기
import { describe, expect, test } from 'vitest'
import { answer, renderPanel, turnToReturn, turnToSteer } from './helpers/recordRuns'

const needles = (h: string) => [...h.matchAll(/<line class="needle" x1="[-\d.]+" y1="[-\d.]+" x2="([-\d.]+)"/g)].map((m) => Number(m[1]))

describe('작업 목록의 측정판', () => {
  test('조향 중: 눈금 그림 두 개, 각도 숫자 표시는 없고 바늘은 좌회전이라 오른쪽', () => {
    const h = renderPanel(turnToSteer())
    expect(h.match(/class="tt-dial"/g)?.length).toBe(2)
    expect(h).not.toContain('회전반경 측정판 (숫자식)')
    expect(h).not.toMatch(/<b>-?\d+°<\/b>/)
    expect(needles(h).every((x) => x > 310)).toBe(true)
  })
  test('직진 복귀 뒤에는 바늘이 0°', () => {
    expect(needles(renderPanel(turnToReturn('guided', '35', '30')))).toEqual([310, 310])
  })
  test('측정 당시 다시 보기는 각도 오답이 드러난 뒤에만', () => {
    expect(renderPanel(turnToReturn('guided', '34', '30'))).toContain('측정 당시 눈금 다시 보기')
    const u = turnToReturn('unguided', '34', '30')
    expect(renderPanel(u)).not.toContain('측정 당시 눈금 다시 보기')
    expect(renderPanel(answer(answer(u, 'radius', '5.5'), 'vehicleCondition', 'pass'))).toContain('측정 당시 눈금 다시 보기')
    expect(renderPanel(turnToReturn('guided', '35', '30'))).not.toContain('측정 당시 눈금 다시 보기')
  })
})
