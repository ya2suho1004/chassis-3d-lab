// 시험 차량 블렌더 모델 파일 점검: 앱이 기대하는 노드 이름, 외부 다운로드가 필요 없는 압축, 용량, 치수 판정
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TEST_CAR_SPEC, TEST_CAR_WHEELS, fitsTestCar } from '../src/scene/models/TestCarModel'

const path = new URL('../public/assets/models/test-car.glb', import.meta.url)
const buf = readFileSync(path)

function glbJson(b: Buffer) {
  expect(b.toString('ascii', 0, 4)).toBe('glTF')
  expect(b.readUInt32LE(4)).toBe(2)
  const len = b.readUInt32LE(12)
  expect(b.toString('ascii', 16, 20)).toBe('JSON')
  return JSON.parse(b.toString('utf8', 20, 20 + len)) as {
    nodes: Array<{ name?: string; translation?: number[]; children?: number[] }>
    materials: Array<{ name?: string }>
    extensionsUsed?: string[]
    extensionsRequired?: string[]
    images?: unknown[]
  }
}

describe('시험 차량 모델(test-car.glb)', () => {
  const j = glbJson(buf)
  const names = j.nodes.map((n) => n.name)

  it('뿌리·차체·바퀴 4개 노드가 있다', () => {
    for (const n of ['TestCar', 'Body', ...TEST_CAR_WHEELS.front, ...TEST_CAR_WHEELS.rear]) expect(names).toContain(n)
  })

  it('바퀴 중심이 장면 코드와 같다(반지름 0.3, 축 ±1.2, 중심 x ±0.7, 앞 = -z)', () => {
    const at = (n: string) => j.nodes.find((x) => x.name === n)!.translation!
    for (const [n, x, z] of [['Wheel_FL', -0.7, -1.2], ['Wheel_FR', 0.7, -1.2], ['Wheel_RL', -0.7, 1.2], ['Wheel_RR', 0.7, 1.2]] as const) {
      const t = at(n)
      expect(t[0]).toBeCloseTo(x, 3); expect(t[1]).toBeCloseTo(0.3, 3); expect(t[2]).toBeCloseTo(z, 3)
    }
  })

  it('강조 표시에 쓰는 차체색 재질 이름이 Paint다', () => {
    expect(j.materials.map((m) => m.name)).toContain('Paint')
  })

  it('압축은 앱 안의 해제기로 푸는 meshopt만 쓰고, Draco·그림 파일은 없다(학교망에서 외부 다운로드 없음)', () => {
    expect(j.extensionsUsed ?? []).toContain('EXT_meshopt_compression')
    expect(JSON.stringify(j.extensionsUsed ?? [])).not.toContain('draco')
    expect(j.images ?? []).toHaveLength(0)
  })

  it('파일이 1 MB 이하다(태블릿·학교망)', () => {
    expect(buf.length).toBeLessThan(1_000_000)
  })

  it('배치 차량 크기가 모델과 같을 때만 모델을 쓴다', () => {
    expect(fitsTestCar(TEST_CAR_SPEC)).toBe(true)
    expect(fitsTestCar({ w: 1.6, d: 3.6, h: 1.5 })).toBe(true)
    expect(fitsTestCar({ w: 1.7, d: 4.0, h: 1.5 })).toBe(false)
  })
})
