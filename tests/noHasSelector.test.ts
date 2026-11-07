// tests/noHasSelector.test.ts — 학교 태블릿 크롬이 오래돼도(:has()는 크롬 105부터) 공방 화면이 같게 보이도록
// CSS에 :has()를 쓰지 않는다(2026-11-07). 같은 모양은 화면·컴포넌트가 붙이는 클래스로 낸다.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const css = fs.readFileSync('src/styles.css', 'utf8')

describe('오래된 크롬 대비 — :has() 없음', () => {
  it('styles.css에 :has( 가 없다', () => {
    expect(css).not.toContain(':has(')
  })
  it('노을 바탕은 main.wa.screen::before 로 화면 전체 뒤에 깐다', () => {
    expect(css).toMatch(/main\.wa\.screen::before \{[^}]*position:fixed; inset:0; z-index:-1;[^}]*linear-gradient/)
  })
  it('정비 일지 도장 자리·캐릭터 다시 꾸미기 덮개는 클래스로', () => {
    expect(css).toContain('.worklog.stamped .wl-head')
    expect(css).toContain('.av-overlay.warm')
    expect(fs.readFileSync('src/screens/WorkLog.tsx', 'utf8')).toContain("fx.includes('stamp') ? 'stamped' : ''")
    expect(fs.readFileSync('src/screens/LabScreen.tsx', 'utf8')).toContain('className="av-overlay warm"')
  })
})
