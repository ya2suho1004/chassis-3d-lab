// 공용 조작부 3D 계기 화면 글자: 숫자식 계기와 같은 값, 할 일 안내 문구 없음
import { describe, expect, it } from 'vitest'
import { readoutLines } from '../src/scene/panelReadout'

describe('조작부 계기 화면', () => {
  it('측정 전에는 빈 값(---)', () => {
    expect(readoutLines({ axle: null, left: null, right: null, hold: false, unit: 'kg' })).toEqual(['AXLE  --- kg', 'L ---  R ---', ''])
  })
  it('차량 진입 뒤 축중, 모터가 돌면 0, 페달 뒤 최대값과 MAX HOLD', () => {
    expect(readoutLines({ axle: 600, left: 0, right: 0, hold: false, unit: 'kg' })).toEqual(['AXLE  600 kg', 'L   0  R   0', ''])
    expect(readoutLines({ axle: 600, left: 240, right: 200, hold: true, unit: 'kg' })).toEqual(['AXLE  600 kg', 'L 240  R 200', 'MAX HOLD'])
  })
  it('안내 문구(다음 할 일)는 넣지 않는다 — 안내 없음 조건', () => {
    const all = readoutLines({ axle: 600, left: 0, right: 0, hold: false, unit: 'kg' }).join(' ')
    expect(all).not.toMatch(/[가-힣]/)
    expect(all).not.toMatch(/PRESS|PEDAL/i)
  })
})
