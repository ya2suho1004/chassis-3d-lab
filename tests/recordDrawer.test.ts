// 작업 목록 칸(설계 2026-11-10 §2·§3·§7): 제출한 값 복원, 기록 단계 버튼 이름, 제동력 좌·우는 최대값 고정 뒤
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { answer, brakeToEnter, brakeToPress, renderPanel } from './helpers/recordRuns'

describe('작업 목록 칸', () => {
  test('제출한 값과 표시가 패널을 다시 그려도 칸에 남는다(화면 전환·이어서 하기)', () => {
    const h = renderPanel(answer(brakeToEnter(), 'axleWeight', '600'))
    expect(h).toMatch(/id="resp-axleWeight"[^>]*value="600"/)
    expect(h).toContain('<span class="mark ok">✓</span>')
  })
  test('안내 없음은 최초 답이 다 모이기 전까지 저장만 보인다', () => {
    const h = renderPanel(answer(brakeToEnter('unguided'), 'axleWeight', '610'))
    expect(h).toMatch(/id="resp-axleWeight"[^>]*value="610"/)
    expect(h).toContain('<span class="mark ">저장</span>')
    expect(h).not.toMatch(/[✓✗]/)
  })
  test('기록 단계 버튼은 할 일 이름으로 보인다', () => {
    const h = renderPanel(brakeToEnter())
    for (const label of ['축중 기록', '좌·우 제동력 기록', '계산·판정 기록', '수행']) expect(h).toContain(`>${label}</button>`)
  })
  test('제동력 좌·우는 숫자가 다 올라가 최대값이 고정되기 전에는 닫혀 있다', () => {
    const h = renderPanel(brakeToPress())
    expect(h).toMatch(/id="resp-left"[^>]*disabled=""/)
    expect(h).toMatch(/id="resp-right"[^>]*disabled=""/)
    expect(h).toContain('측정 중')
  })
  test('칸이 빈 단계를 끝내려 하면 적어 두고 입력을 누르지 않은 경우를 따로 알린다', () => {
    const task = fs.readFileSync('src/screens/TaskScreen.tsx', 'utf8')
    expect(task).toMatch(/plain: missingText\(ITEM_LABEL\[item\] \?\? item, !!inputs\[item\]\?\.trim\(\)\), focusItem: item/)
  })
})
