// 게임 화면 겹침 방지 규칙(2026-11-09, 11-10 고침). 실제 겹침은 개발 서버에서 window.__hudOverlaps()로 잰다(src/app/hudLayout.ts).
// 이 시험은 측정으로 정한 규칙이 지워지지 않게 지킬 뿐, 겹침이 없다는 증명은 아니다(11-09에 CSS 글자만 보고 계기 버튼 겹침을 놓쳤다).
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = fs.readFileSync('src/styles.css', 'utf8')

describe('게임 화면 겹침 방지 규칙', () => {
  test('태블릿 폭에서는 의뢰 카드를 위쪽 버튼 줄 아래로 내린다', () => {
    expect(css).toMatch(/@media \(min-width: 761px\) and \(max-width: 1100px\) and \(min-height: 501px\) \{\s*\.game\.wa \.g-quest \{ top:66px; \}/)
  })
  test('질문 버튼은 조이스틱 위(왼쪽 열)에 둔다 — 가운데 계기 버튼과 같은 줄에 두지 않는다', () => {
    expect(css).toMatch(/\.g-chatbtn \{ position:absolute; left:28px; bottom:188px;/)
  })
  test('안내 줄은 한 줄로 줄여 위 버튼과 겹치지 않는다', () => {
    expect(css).toMatch(/\.g-hud \{[^}]*white-space:nowrap; overflow:hidden; text-overflow:ellipsis;/)
  })
  test('폰 세로: 질문 버튼은 조이스틱 위, 가운데 버튼은 그 위(수행 버튼과 겹치지 않게), 계기 닫기는 조이스틱 자리', () => {
    const block = css.slice(css.indexOf('@media (max-width: 760px) and (min-height: 501px) {'))
    expect(block).toMatch(/\.g-chatbtn \{ left:16px; bottom:146px; \}/)
    expect(block).toMatch(/\.g-gaugebtn \{ left:16px; bottom:201px; transform:none; \}/)
    expect(block).toMatch(/\.g-gaugebtn\.on \{ bottom:16px; \}/)
  })
  test('장비 설명 카드는 가운데 버튼 위로 올리고 양옆 버튼 열을 비운다', () => {
    expect(css).toMatch(/@media \(min-width: 761px\) and \(min-height: 501px\) \{\s*\.g-info \{ bottom:120px; width:min\(520px, calc\(100vw - 420px\)\); \}/)
  })
})
