// F1(Codex 회의 2026-11-08): 조작 안내 다시 보기 — 안내 확인은 기기 공통으로 저장돼 공유 태블릿의 다음 학생이 볼 길이 없었다.
// 메뉴에서 언제든 다시 연다. 이동·시점·장비 조작만 안내하고 정답·작업 순서는 넣지 않으며, 안내 있음·없음에 똑같이 보인다.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = fs.readFileSync('src/screens/LabScreen.tsx', 'utf8')
const menu = src.slice(src.indexOf('<div className="g-menu"'), src.indexOf('</div>', src.indexOf('<div className="g-menu"')))
const guide = src.slice(src.indexOf('<div className="g-guide"'), src.indexOf('</div>', src.indexOf('<div className="g-guide"')))

describe('조작 안내 다시 보기(F1)', () => {
  it('메뉴에 다시 보기 항목이 있고 누르면 안내를 열고 메뉴를 닫는다', () => {
    expect(menu).toMatch(/<button onClick=\{\(\) => \{ setGuideOpen\(true\); setMenuOpen\(false\) \}\}>조작 안내 다시 보기<\/button>/)
  })
  it('다시 보기 항목은 과제 중·안내 방식과 관계없이 늘 보인다(조건 없이 렌더)', () => {
    const line = menu.split('\n').find((l) => l.includes('조작 안내 다시 보기'))!
    expect(line.trim().startsWith('<button')).toBe(true)
  })
  it('안내 내용은 조작만 — 정답·작업 순서·판정 낱말이 없다', () => {
    expect(guide).toMatch(/조이스틱/)
    expect(guide).not.toMatch(/보호구|시동|타이어|롤러|편차|합|판정|양호|불량|조향각|순서/)
  })
})
