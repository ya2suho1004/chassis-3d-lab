// QR 생성(설계 2026-11-14-student-number-and-class-link §3-5, 바탕은 계획 2026-11-09-qr-entry Task 2).
// 표준 값(리드-솔로몬, 형식 정보)과 실제 판독기(OpenCV)로 왕복 확인한다. OpenCV가 없는 환경에서는 왕복 시험만 건너뛴다.
import { describe, expect, test } from 'vitest'
import { formatBits, qrMatrix, qrPath, rsRemainder, QR_MAX_BYTES } from '../src/teacher/qr'
import { decodeWithCv, hasCv } from './helpers/qrDecode'

describe('표준 값', () => {
  test('리드-솔로몬: HELLO WORLD 1-M 예제의 오류 정정 값과 같다', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]
    expect(rsRemainder(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23])
  })
  test('형식 정보: M 마스크 0', () => {
    expect(formatBits(0).toString(2).padStart(15, '0')).toBe('101010000010010')
  })
})

describe('행렬', () => {
  test('크기와 버전: 내용 길이에 맞는 가장 작은 버전을 고른다', () => {
    expect(qrMatrix('A').length).toBe(21)
    expect(qrMatrix('x'.repeat(42)).length).toBe(29) // 버전 3(바이트 방식 M 42자까지)
    expect(qrMatrix('x'.repeat(43)).length).toBe(33) // 버전 4
    expect(qrMatrix('x'.repeat(106)).length).toBe(41) // 버전 6
  })
  test('위치 찾기 무늬와 어두운 칸', () => {
    const m = qrMatrix('A')
    expect(m[0]!.slice(0, 7)).toEqual([true, true, true, true, true, true, true])
    expect(m[3]![3]).toBe(true)
    expect(m[m.length - 8]![8]).toBe(true)
  })
  test('너무 긴 내용은 만들지 않는다(106바이트까지)', () => {
    expect(QR_MAX_BYTES).toBe(106)
    expect(() => qrMatrix('x'.repeat(107))).toThrow('QR_TOO_LONG')
    expect(() => qrMatrix('가'.repeat(36))).toThrow('QR_TOO_LONG') // 한글은 3바이트
  })
  test('SVG 경로는 칸마다 하나, 여백 4칸을 둔다', () => {
    const m = qrMatrix('A')
    const dark = m.flat().filter(Boolean).length
    expect(qrPath(m).match(/M/g)!.length).toBe(dark)
    expect(qrPath(m).startsWith('M4 4h1v1h-1z')).toBe(true)
  })
})

describe.skipIf(!hasCv)('실제 판독기로 왕복', () => {
  const samples = ['A', 'https://chassis-3d-lab.vercel.app/', 'http://127.0.0.1:4325/#x=1', 'x'.repeat(43), 'y'.repeat(84), 'z'.repeat(85), 'w'.repeat(106)]
  test.each(samples)('%s', (text) => {
    expect(decodeWithCv(qrMatrix(text))).toBe(text)
  })
})
