// 사람 캐릭터 모델 점검: 뼈대·동작 이름(앱이 부르는 이름), 옷 재질 이름(실습복 색 바꿀 자리), 압축, 용량, 방향 계산
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CHARACTER_CLIPS, headingFor } from '../src/scene/models/CharacterModel'
import { HAIR_STYLES } from '../src/app/avatar'

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

// 캐릭터 만들기(설계 2026-11-03): 체형 2 모델과 머리 모양 4개
type Glb = { nodes: Array<{ name?: string; scale?: number[] }>; skins?: unknown[]; animations?: Array<{ name?: string }>; materials: Array<{ name?: string }> }
const read = (f: string) => {
  const b = readFileSync(new URL(`../public/assets/models/${f}`, import.meta.url))
  return { size: b.length, j: JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12))) as Glb }
}
describe.each(['character.glb', 'character-b.glb'])('캐릭터 만들기 — %s', (f) => {
  const { size, j: g } = read(f)
  it('머리 모양 부품 4개가 따로 있다(앱이 하나만 보임)', () => {
    const names = g.nodes.map((n) => n.name)
    for (const h of HAIR_STYLES) expect(names).toContain(h.node)
  })
  it('같은 동작 6개·뼈대 1개·피부·머리·눈 재질', () => {
    expect(g.skins ?? []).toHaveLength(1)
    const clips = (g.animations ?? []).map((a) => a.name)
    for (const c of CHARACTER_CLIPS) expect(clips).toContain(c)
    const mats = g.materials.map((m) => m.name)
    for (const m of ['Skin', 'Hair', 'Eye', 'Top', 'Bottom', 'Shoes']) expect(mats).toContain(m)
    expect(size).toBeLessThan(400_000)
  })
})
describe('체형 키', () => {
  it('체형 2는 뿌리(Character)를 1.62/1.72로 줄이고 체형 1은 그대로', () => {
    const root = (f: string) => read(f).j.nodes.find((n) => n.name === 'Character')!
    expect(root('character.glb').scale ?? [1, 1, 1]).toEqual([1, 1, 1])
    for (const s of root('character-b.glb').scale!) expect(s).toBeCloseTo(1.62 / 1.72, 4)
  })
})

