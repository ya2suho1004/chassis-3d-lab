// 가위형 리프트·리프트 위 아반떼 블렌더 모델 점검: 노드 이름·위치, 다리 각도 계산, 압축, 용량
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AVANTE_SPEC, SCISSOR, SCISSOR_NODES, fitsScissorLift, scissorPose } from '../src/scene/models/ScissorLiftModel'

type Glb = { nodes: Array<{ name?: string; translation?: number[]; rotation?: number[] }>; extensionsUsed?: string[]; images?: unknown[] }
function load(name: string): { buf: Buffer; j: Glb } {
  const buf = readFileSync(new URL(`../public/assets/models/${name}`, import.meta.url))
  expect(buf.toString('ascii', 0, 4)).toBe('glTF')
  const len = buf.readUInt32LE(12)
  return { buf, j: JSON.parse(buf.toString('utf8', 20, 20 + len)) as Glb }
}

describe('가위형 리프트 모델(scissor-lift.glb)', () => {
  const { buf, j } = load('scissor-lift.glb')
  const at = (n: string) => j.nodes.find((x) => x.name === n)

  it('뿌리·고정부와 좌우 발판·다리 노드가 있다', () => {
    const names = j.nodes.map((n) => n.name)
    for (const n of ['ScissorLift', 'Base', ...SCISSOR_NODES.runways, ...SCISSOR_NODES.armBase, ...SCISSOR_NODES.armTop]) expect(names).toContain(n)
  })

  it('노드 기준점이 앱 계산과 같다(발판 = 내려간 높이, 바닥 핀 = pinZ, 위 핀 = 발판 − deck, 고정 핀은 남쪽 z=+0.9)', () => {
    const x = SCISSOR.w / 2 - 0.31
    for (const [side, sx] of [['L', -1], ['R', 1]] as const) {
      const r = at(`Runway_${side}`)!.translation!
      expect(r[0]).toBeCloseTo(sx * x, 3); expect(r[1]).toBeCloseTo(SCISSOR.restTop, 3); expect(r[2]).toBeCloseTo(0, 3)
      const b = at(`ArmBase_${side}`)!.translation!
      expect(b[1]).toBeCloseTo(SCISSOR.pinZ, 3); expect(b[2]).toBeCloseTo(0.9, 3)
      const t = at(`ArmTop_${side}`)!.translation!
      expect(t[1]).toBeCloseTo(SCISSOR.restTop - SCISSOR.deck, 3); expect(t[2]).toBeCloseTo(0.9, 3)
      expect(at(`ArmBase_${side}`)!.rotation).toBeUndefined()
    }
  })

  it('다리 각도: 두 다리가 가운데에서 만난다(아래 다리 끝 높이 = 위 핀 높이)', () => {
    for (const top of [SCISSOR.restTop, 1.0, SCISSOR.raisedTop]) {
      const { phi, armTopY } = scissorPose(top)
      expect(SCISSOR.pinZ + SCISSOR.arm * Math.sin(phi)).toBeCloseTo(armTopY, 6)
    }
    expect(scissorPose(SCISSOR.raisedTop).phi).toBeGreaterThan(scissorPose(SCISSOR.restTop).phi)
  })

  it('meshopt만 쓰고 Draco·그림 파일이 없으며 0.5 MB 이하다', () => {
    expect(j.extensionsUsed ?? []).toContain('EXT_meshopt_compression')
    expect(JSON.stringify(j.extensionsUsed ?? [])).not.toContain('draco')
    expect(j.images ?? []).toHaveLength(0)
    expect(buf.length).toBeLessThan(500_000)
  })

  it('배치 리프트 크기(2.2×4.0, 높이 0.4)와 같을 때만 모델을 쓴다', () => {
    expect(fitsScissorLift({ w: 2.2, d: 4.0, h: 0.4 })).toBe(true)
    expect(fitsScissorLift({ w: 2.2, d: 4.5, h: 0.4 })).toBe(false)
  })
})

describe('리프트 위 차량 모델(avante.glb, 1세대 아반떼)', () => {
  const { buf, j } = load('avante.glb')
  it('뿌리·차체·바퀴 노드가 있고 바퀴가 공식 제원 축거 2.55에 놓인다', () => {
    const names = j.nodes.map((n) => n.name)
    for (const n of ['Avante', 'Body', 'Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']) expect(names).toContain(n)
    const fl = j.nodes.find((n) => n.name === 'Wheel_FL')!.translation!
    const rl = j.nodes.find((n) => n.name === 'Wheel_RL')!.translation!
    const [flx, , flz] = fl as [number, number, number]
    const [, , rlz] = rl as [number, number, number]
    expect(rlz - flz).toBeCloseTo(2.55, 2)
    // 바퀴(윤거 약 1.45)가 리프트 발판(폭 0.62, 중심 x ±0.79) 위에 놓인다
    expect(Math.abs(flx)).toBeGreaterThan(SCISSOR.w / 2 - 0.62)
    expect(Math.abs(flx)).toBeLessThan(SCISSOR.w / 2)
  })
  it('meshopt만 쓰고 1 MB 이하다', () => {
    expect(j.extensionsUsed ?? []).toContain('EXT_meshopt_compression')
    expect(j.images ?? []).toHaveLength(0)
    expect(buf.length).toBeLessThan(1_000_000)
    expect(AVANTE_SPEC.d).toBeCloseTo(4.42, 2)
  })
})
