// 게임 화면이 옆으로 밀리지 않게(2026-11-09). 닫힌 작업 서랍은 translateX(105%)로 화면 밖에 있어 main.game의
// 스크롤 넓이를 늘린다(767 → 1355, 588 = 560×1.05). overflow:hidden은 코드·보조 기능의 스크롤까지 막지 못한다.
// 시험 환경에 레이아웃이 없어 CSS 규칙을 읽어 확인한다. 실제 동작은 브라우저에서 확인했다.
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = fs.readFileSync('src/styles.css', 'utf8')
const rule = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`)
  expect(start, `${selector} 규칙이 있어야 한다`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

describe('게임 화면 옆 밀림 방지', () => {
  test('.game은 clip으로 스크롤 자체를 없애고, clip을 모르는 옛 브라우저는 hidden을 그대로 쓴다', () => {
    expect(rule('.game')).toMatch(/overflow:hidden;\s*overflow:clip;/)
  })

  test('3D 이름표가 넘치는 캔버스 감싸개도 스크롤되지 않는다(R3F 인라인 overflow:hidden을 이김)', () => {
    expect(rule('.game .g-canvas > div')).toMatch(/overflow:clip !important/)
  })

  test('닫힌 서랍은 계속 밀어서 숨긴다(열고 닫는 움직임 유지)', () => {
    expect(rule('.g-drawer')).toMatch(/transform:translateX\(105%\)/)
  })
})
