// 게임 화면 겹침 방지(2026-11-09). 실제 겹침은 브라우저에서 폭별로 쟀다(390·767·800·1024·1180·1280·가로 844).
// 이 시험은 그 규칙이 지워지지 않게 지킨다.
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = fs.readFileSync('src/styles.css', 'utf8')

describe('게임 화면 겹침 방지', () => {
  test('태블릿 폭에서는 의뢰 카드를 위쪽 버튼 줄 아래로 내린다', () => {
    expect(css).toMatch(/@media \(min-width: 761px\) and \(max-width: 1100px\) and \(min-height: 501px\) \{\s*\.game\.wa \.g-quest \{ top:66px; \}/)
  })
  test('질문 버튼은 안내 줄 위에 있다', () => {
    expect(css).toMatch(/\.g-chatbtn \{ position:absolute; left:196px; bottom:60px;/)
  })
  test('폰 세로에서는 질문 버튼이 수행 버튼과 겹치지 않게 조이스틱 위로 간다', () => {
    expect(css).toMatch(/\.g-chatbtn \{ left:16px; bottom:146px; \}/)
  })
})
