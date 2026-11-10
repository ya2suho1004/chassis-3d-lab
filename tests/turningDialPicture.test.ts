// 측정판 눈금 그림(설계 2026-11-10 §5, 결정 A): 각도는 글자로 쓰지 않고, 바늘 + 쪽이 화면 오른쪽
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { dialCaption, DIAL, dialPoint, ReviewToggle, TurningDialPicture } from '../src/screens/TurningDialPicture'

const html = (deg: number, caption?: string) => renderToStaticMarkup(createElement(TurningDialPicture, { side: 'left', deg, caption }))
const texts = (h: string) => h.replace(/<[^>]+>/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean)
const needle = (h: string) => h.match(/<line class="needle" x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/)!.slice(1).map(Number)

describe('측정판 눈금 그림', () => {
  test('0°는 아래 가운데, + 쪽은 화면 오른쪽', () => {
    expect(dialPoint(100, 0)).toEqual({ x: DIAL.CX, y: DIAL.CY + 100 })
    expect(dialPoint(100, 30).x).toBeGreaterThan(DIAL.CX)
    expect(dialPoint(100, -30).x).toBeLessThan(DIAL.CX)
  })
  test('글자는 이름과 눈금 숫자뿐이고 바늘 각도는 없다', () => {
    for (const deg of [0, 35, -32]) expect(texts(html(deg))).toEqual(['좌측 바퀴', '40', '30', '20', '10', '0', '10', '20', '30', '40'])
    expect(html(35)).toContain('aria-label="좌측 바퀴 회전반경 측정판 눈금"')
  })
  test('바늘: 0°면 세로, 좌회전(+)이면 오른쪽, 우회전(−)이면 왼쪽으로 기운다', () => {
    const [x1, , x2] = needle(html(0))
    expect(x1).toBe(DIAL.CX)
    expect(x2).toBe(DIAL.CX)
    expect(needle(html(35))[2]).toBeGreaterThan(DIAL.CX)
    expect(needle(html(-32))[2]).toBeLessThan(DIAL.CX)
  })
  test('1° 눈금 91개(긴 눈금 19개)이고 띠가 그림 안에 든다', () => {
    const h = html(0)
    expect(h.match(/<line /g)!.length).toBe(91 + 1)
    expect(h.match(/stroke-width="3.5"/g)!.length).toBe(19)
    expect(dialPoint(DIAL.RT, 45).x).toBeLessThan(DIAL.W)
    expect(dialPoint(DIAL.RT, -45).x).toBeGreaterThan(0)
    expect(dialPoint(DIAL.RP0, 45).y).toBeGreaterThan(0)
  })
  test('다시 보기 제목·버튼 글자', () => {
    expect(dialCaption('left', false)).toBe('좌측 바퀴')
    expect(dialCaption('right', true)).toBe('우측 바퀴 — 측정 당시(핸들을 끝까지 돌렸을 때)')
    expect(texts(html(35, dialCaption('left', true)))[0]).toBe('좌측 바퀴 — 측정 당시(핸들을 끝까지 돌렸을 때)')
    expect(renderToStaticMarkup(createElement(ReviewToggle, { reviewing: false, onToggle: () => {} }))).toContain('측정 당시 눈금 다시 보기')
    expect(renderToStaticMarkup(createElement(ReviewToggle, { reviewing: true, onToggle: () => {} }))).toContain('지금 눈금 보기')
  })
  test('바늘 방향이 넘겨받은 각도와 같고, 범위 밖은 ±45°, 잘못된 값은 0°로 그림 안에 남는다', () => {
    const angleOf = (h: string) => { const [x1, y1, x2, y2] = needle(h); return (Math.atan2(x2! - x1!, y2! - y1!) * 180) / Math.PI }
    for (const deg of [0, 30, -32, 35]) expect(Math.abs(angleOf(html(deg)) - deg)).toBeLessThan(0.5)
    expect(Math.abs(angleOf(html(60)) - 45)).toBeLessThan(0.5)
    expect(needle(html(60))[2]).toBeLessThanOrEqual(DIAL.W)
    expect(needle(html(-60))[2]).toBeGreaterThanOrEqual(0)
    const [nx1, , nx2] = needle(html(Number.NaN))
    expect(nx1).toBe(DIAL.CX)
    expect(nx2).toBe(DIAL.CX)
  })
})
