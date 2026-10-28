// 제동력 시험기 블렌더 모델 파일 점검: 앱이 움직이는 노드 이름·위치(롤러·리프트 판), 외부 다운로드가 필요 없는 압축, 용량, 치수 판정
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRAKE_TESTER_LIFTS, BRAKE_TESTER_ROLLERS, BRAKE_TESTER_SPEC, fitsBrakeTester } from '../src/scene/models/BrakeTesterModel'

const buf = readFileSync(new URL('../public/assets/models/brake-tester.glb', import.meta.url))

function glbJson(b: Buffer) {
  expect(b.toString('ascii', 0, 4)).toBe('glTF')
  const len = b.readUInt32LE(12)
  expect(b.toString('ascii', 16, 20)).toBe('JSON')
  return JSON.parse(b.toString('utf8', 20, 20 + len)) as {
    nodes: Array<{ name?: string; translation?: number[]; rotation?: number[] }>
    extensionsUsed?: string[]
    images?: unknown[]
  }
}

describe('제동력 시험기 모델(brake-tester.glb)', () => {
  const j = glbJson(buf)
  const at = (n: string) => j.nodes.find((x) => x.name === n)
  // 장면 코드(LabScene.tsx BrakeRig)와 같은 식
  const WHEEL_R = 0.3, ROLLER_R = 0.1, ROLLER_DZ = 0.28
  const ROLLER_Y = WHEEL_R - Math.sqrt((WHEEL_R + ROLLER_R) ** 2 - ROLLER_DZ ** 2)

  it('뿌리·고정부·롤러 4개·리프트 판 2개 노드가 있다', () => {
    const names = j.nodes.map((n) => n.name)
    for (const n of ['BrakeTester', 'Base', ...BRAKE_TESTER_ROLLERS, ...BRAKE_TESTER_LIFTS]) expect(names).toContain(n)
  })

  it('롤러 중심이 장면 코드와 같고(바퀴 x ±0.7, 앞뒤 ±0.28, 축 높이 ROLLER_Y) 회전이 없다', () => {
    for (const [n, x, z] of [['Roller_LN', -0.7, -0.28], ['Roller_LS', -0.7, 0.28], ['Roller_RN', 0.7, -0.28], ['Roller_RS', 0.7, 0.28]] as const) {
      const node = at(n)!
      const t = node.translation!
      expect(t[0]).toBeCloseTo(x, 3); expect(t[1]).toBeCloseTo(ROLLER_Y, 3); expect(t[2]).toBeCloseTo(z, 3)
      expect(node.rotation).toBeUndefined()
    }
  })

  it('리프트 판은 내려간 높이(-0.02)에서 시작한다(앱이 y = 들림 - 0.02로 움직임)', () => {
    for (const [n, x] of [['Lift_L', -0.7], ['Lift_R', 0.7]] as const) {
      const t = at(n)!.translation!
      expect(t[0]).toBeCloseTo(x, 3); expect(t[1]).toBeCloseTo(-0.02, 3); expect(t[2]).toBeCloseTo(0, 3)
    }
  })

  it('압축은 앱 안의 해제기로 푸는 meshopt만 쓰고, Draco·그림 파일은 없다', () => {
    expect(j.extensionsUsed ?? []).toContain('EXT_meshopt_compression')
    expect(JSON.stringify(j.extensionsUsed ?? [])).not.toContain('draco')
    expect(j.images ?? []).toHaveLength(0)
  })

  it('파일이 0.5 MB 이하다', () => {
    expect(buf.length).toBeLessThan(500_000)
  })

  it('배치 시험기 크기와 바퀴 자리가 모델과 같을 때만 모델을 쓴다', () => {
    expect(fitsBrakeTester(BRAKE_TESTER_SPEC, BRAKE_TESTER_SPEC.wheelX)).toBe(true)
    expect(fitsBrakeTester({ w: 3.0, d: 1.2 }, 1.6 / 2 - 0.1)).toBe(true)
    expect(fitsBrakeTester({ w: 3.4, d: 1.2 }, 0.7)).toBe(false)
    expect(fitsBrakeTester({ w: 3.0, d: 1.2 }, 0.85)).toBe(false)
  })
})
