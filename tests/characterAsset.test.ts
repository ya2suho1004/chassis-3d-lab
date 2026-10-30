// 사람 캐릭터 모델 점검: 뼈대·동작 이름(앱이 부르는 이름), 옷 재질 이름(실습복 색 바꿀 자리), 압축, 용량, 방향 계산
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CHARACTER_CLIPS, headingFor } from '../src/scene/models/CharacterModel'

const buf = readFileSync(new URL('../public/assets/models/character.glb', import.meta.url))
const len = buf.readUInt32LE(12)
const j = JSON.parse(buf.toString('utf8', 20, 20 + len)) as {
  nodes: Array<{ name?: string }>; skins?: unknown[]; animations?: Array<{ name?: string }>; materials: Array<{ name?: string }>
  extensionsUsed?: string[]; images?: unknown[]
}

describe('사람 캐릭터 모델(character.glb)', () => {
  it('뼈대 1개와 주요 뼈가 있다', () => {
    expect(j.skins ?? []).toHaveLength(1)
    const names = j.nodes.map((n) => n.name)
    for (const b of ['Hips', 'Spine', 'Chest', 'Head', 'UpperArm.L', 'UpperArm.R', 'UpperLeg.L', 'LowerLeg.R', 'Foot.L']) expect(names).toContain(b)
  })
  it('앱이 부르는 동작(Idle·Walk·Gesture)이 모두 있다', () => {
    const clips = (j.animations ?? []).map((a) => a.name)
    for (const c of CHARACTER_CLIPS) expect(clips).toContain(c)
  })
  it('옷 재질이 Top·Bottom·Shoes로 나뉘어 있다(실습복 색을 바꾸는 자리)', () => {
    const mats = j.materials.map((m) => m.name)
    for (const m of ['Top', 'Bottom', 'Shoes', 'Skin', 'Hair']) expect(mats).toContain(m)
  })
  it('보안경(Goggles)이 따로 된 물체로 있다(보호구 착용 뒤에만 보임)', () => {
    expect(j.nodes.map((n) => n.name)).toContain('Goggles')
    const mats = j.materials.map((m) => m.name)
    for (const m of ['GogglesFrame', 'GogglesLens']) expect(mats).toContain(m)
  })
  it('meshopt만 쓰고 그림 파일이 없으며 0.4 MB 이하다', () => {
    expect(j.extensionsUsed ?? []).toContain('EXT_meshopt_compression')
    expect(j.images ?? []).toHaveLength(0)
    expect(buf.length).toBeLessThan(400_000)
  })
  it('이동 방향을 바라보는 회전: 모델 앞은 -z', () => {
    expect(headingFor(0, -1)).toBeCloseTo(0, 6)
    expect(Math.abs(headingFor(0, 1))).toBeCloseTo(Math.PI, 6)
    expect(headingFor(-1, 0)).toBeCloseTo(Math.PI / 2, 6)
  })
})
