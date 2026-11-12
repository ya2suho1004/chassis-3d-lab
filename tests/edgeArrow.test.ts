// tests/edgeArrow.test.ts — 목적지 방향 화살표의 자리(설계 2026-11-12 §4.5): 화면 가장자리 띠를 따라 움직이고 HUD가 차지한 구간에는 서지 않는다
import { describe, expect, it } from 'vitest'
import { ARROW_PAD, buildTrack, placeEdgeArrow, type Box } from '../src/scene/feel/edgeArrow'

const view = { w: 1280, h: 800 }
const open = buildTrack(view, [])
// 1280×800 태블릿의 HUD 자리(어림): 상태 막대, 의뢰 패널, 작업 버튼, 조이스틱
const status: Box = { x0: 12, y0: 12, x1: 660, y1: 60 }
const quest: Box = { x0: 928, y0: 12, x1: 1268, y1: 235 }
const actions: Box = { x0: 1110, y0: 585, x1: 1268, y1: 788 }
const stick: Box = { x0: 28, y0: 622, x1: 178, y1: 772 }
const hud = buildTrack(view, [status, quest, actions, stick])

describe('placeEdgeArrow — 언제 보이나', () => {
  it('목적지가 화면 가운데 영역(가로 94%, 세로 90%) 안에 보이면 화살표가 없다', () => {
    expect(placeEdgeArrow({ nx: 0, ny: 0, behind: false }, open)).toBeNull()
    expect(placeEdgeArrow({ nx: 0.93, ny: -0.89, behind: false }, open)).toBeNull()
  })
  it('그 영역을 벗어나면 보인다', () => {
    expect(placeEdgeArrow({ nx: 0.95, ny: 0, behind: false }, open)).not.toBeNull()
    expect(placeEdgeArrow({ nx: 0, ny: 0.91, behind: false }, open)).not.toBeNull()
  })
  it('카메라 뒤에 있으면 투영 좌표가 가운데여도 보인다', () => {
    expect(placeEdgeArrow({ nx: 0.1, ny: 0.2, behind: true }, open)).not.toBeNull()
  })
})

describe('placeEdgeArrow — 어디에 서고 어디를 가리키나(HUD 없음)', () => {
  it('오른쪽 밖: 오른쪽 띠(가로 95%)의 같은 높이, 오른쪽을 가리킨다', () => {
    const a = placeEdgeArrow({ nx: 1.8, ny: 0, behind: false }, open)!
    expect(a.x).toBeCloseTo(0.95 * 1280, 6)
    expect(a.y).toBeCloseTo(400, 6)
    expect(a.angle).toBeCloseTo(0, 9)
  })
  it('위쪽 밖: 위 띠(세로 11%), 위를 가리킨다(화면은 아래가 +라서 각도는 −90°)', () => {
    const a = placeEdgeArrow({ nx: 0, ny: 1.5, behind: false }, open)!
    expect(a.x).toBeCloseTo(640, 6)
    expect(a.y).toBeCloseTo(0.11 * 800, 6)
    expect(a.angle).toBeCloseTo(-Math.PI / 2, 9)
  })
  it('왼쪽 아래 대각선 밖: 띠의 네모와 만나는 점에 선다', () => {
    const a = placeEdgeArrow({ nx: -2, ny: -1, behind: false }, open)!
    expect(a.x).toBeCloseTo(0.05 * 1280, 6) // |nx|/0.9 가 더 크므로 왼쪽 띠
    expect(a.y).toBeCloseTo((0.5 + 0.5 * (1 / (2 / 0.9))) * 800, 6)
    expect(a.angle).toBeCloseTo(Math.atan2(1, -2), 9)
  })
  it('카메라 뒤: 좌표를 뒤집어 쓴다 — 뒤쪽 아래에 있는 목적지는 아래 띠에서 아래를 가리킨다', () => {
    const a = placeEdgeArrow({ nx: 0.1, ny: 0.3, behind: true }, open)!
    expect(a.y).toBeCloseTo(0.89 * 800, 6)
    expect(a.x).toBeCloseTo((0.5 - 0.5 * (0.1 / (0.3 / 0.78))) * 1280, 6)
    expect(a.angle).toBeCloseTo(Math.atan2(0.3, -0.1), 9)
  })
  it('카메라 바로 뒤(좌표가 0에 가까움): 아래 가운데에서 아래를 가리킨다(흔들리지 않게)', () => {
    const a = placeEdgeArrow({ nx: 0.0001, ny: -0.0002, behind: true }, open)!
    expect(a.x).toBeCloseTo(640, 6)
    expect(a.y).toBeCloseTo(0.89 * 800, 6)
    expect(a.angle).toBeCloseTo(Math.PI / 2, 9)
  })
})

describe('placeEdgeArrow — HUD가 차지한 구간에는 서지 않는다', () => {
  it('오른쪽 위(의뢰 패널 자리)에 걸리면 같은 변에서 패널 아래로 밀린다', () => {
    const free = placeEdgeArrow({ nx: 2, ny: 1.2, behind: false }, open)!
    expect(free.y).toBeGreaterThan(quest.y0)
    expect(free.y).toBeLessThan(quest.y1) // HUD를 모르면 패널 밑에 깔린다
    const a = placeEdgeArrow({ nx: 2, ny: 1.2, behind: false }, hud)!
    expect(a.x).toBeCloseTo(free.x, 6)
    expect(a.y).toBeCloseTo(quest.y1 + ARROW_PAD, 6)
    expect(a.angle).toBeCloseTo(free.angle, 9) // 가리키는 방향은 그대로
  })
  it('위 왼쪽(상태 막대 자리)에 걸리면 위 띠에서 막대 오른쪽으로 밀린다', () => {
    const a = placeEdgeArrow({ nx: -0.5, ny: 1.6, behind: false }, hud)!
    expect(a.y).toBeCloseTo(0.11 * 800, 6)
    expect(a.x).toBeCloseTo(status.x1 + ARROW_PAD, 6)
  })
  it('아래 오른쪽(작업 버튼 자리)에 걸리면 아래 띠에서 버튼 왼쪽으로 밀린다', () => {
    const a = placeEdgeArrow({ nx: 1.1, ny: -1.2, behind: false }, hud)!
    expect(a.y).toBeCloseTo(0.89 * 800, 6)
    expect(a.x).toBeCloseTo(actions.x0 - ARROW_PAD, 6)
  })
  it('가까운 쪽 빈 자리로 간다: 왼쪽 아래(조이스틱)에서는 조이스틱 위로', () => {
    const a = placeEdgeArrow({ nx: -2, ny: -1.4, behind: false }, hud)!
    expect(a.x).toBeCloseTo(0.05 * 1280, 6)
    expect(a.y).toBeCloseTo(stick.y0 - ARROW_PAD, 6)
  })
  it('띠에서 떨어져 있는 요소(화면 가운데의 카드)는 막지 않는다', () => {
    const t = buildTrack(view, [{ x0: 400, y0: 300, x1: 880, y1: 500 }])
    expect(placeEdgeArrow({ nx: 1.8, ny: 0, behind: false }, t)).toEqual(placeEdgeArrow({ nx: 1.8, ny: 0, behind: false }, open))
  })
  it('붙어 있는 두 요소는 한 덩어리로 보고 그 바깥으로 민다', () => {
    const t = buildTrack(view, [{ x0: 1100, y0: 200, x1: 1270, y1: 380 }, { x0: 1100, y0: 390, x1: 1270, y1: 560 }])
    const a = placeEdgeArrow({ nx: 1.8, ny: 0.05, behind: false }, t)! // 띠 위의 y ≈ 389 — 두 요소 사이 틈
    expect(a.y === 200 - ARROW_PAD || a.y === 560 + ARROW_PAD).toBe(true)
  })
  it('그 변에 빈 자리가 없으면 제자리에 둔다', () => {
    const t = buildTrack(view, [{ x0: 1100, y0: 0, x1: 1280, y1: 800 }])
    const a = placeEdgeArrow({ nx: 1.8, ny: 0, behind: false }, t)!
    expect(a.y).toBeCloseTo(400, 6)
  })
  it('어떤 방향이든 화살표는 띠 안(화면 안)에 선다', () => {
    for (let i = 0; i < 360; i += 7) for (const behind of [false, true]) {
      const r = (i * Math.PI) / 180
      const a = placeEdgeArrow({ nx: 3 * Math.cos(r), ny: 3 * Math.sin(r), behind }, hud)!
      expect(a.x).toBeGreaterThanOrEqual(0.05 * 1280 - 1e-6)
      expect(a.x).toBeLessThanOrEqual(0.95 * 1280 + 1e-6)
      expect(a.y).toBeGreaterThanOrEqual(0.11 * 800 - 1e-6)
      expect(a.y).toBeLessThanOrEqual(0.89 * 800 + 1e-6)
    }
  })
})

describe('buildTrack', () => {
  it('변마다 그 변에 걸친 요소의 구간을 여유(30px)를 두어 담는다', () => {
    expect(hud.w).toBe(1280)
    expect(hud.h).toBe(800)
    expect(hud.right).toEqual([[quest.y0 - ARROW_PAD, quest.y1 + ARROW_PAD], [actions.y0 - ARROW_PAD, actions.y1 + ARROW_PAD]])
    expect(hud.top).toEqual([[status.x0 - ARROW_PAD, status.x1 + ARROW_PAD], [quest.x0 - ARROW_PAD, quest.x1 + ARROW_PAD]])
    expect(hud.left).toEqual([[status.y0 - ARROW_PAD, status.y1 + ARROW_PAD], [stick.y0 - ARROW_PAD, stick.y1 + ARROW_PAD]])
    expect(hud.bottom).toEqual([[stick.x0 - ARROW_PAD, stick.x1 + ARROW_PAD], [actions.x0 - ARROW_PAD, actions.x1 + ARROW_PAD]])
  })
  it('HUD가 없으면 구간도 없다', () => {
    expect([open.left, open.right, open.top, open.bottom]).toEqual([[], [], [], []])
  })
})
