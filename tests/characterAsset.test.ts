// 사람 캐릭터 모델 점검(설계 2026-11-13 캐릭터와 움직임 §4·§5): 학생 체형 1·2와 교관 전용 모델.
// 뼈대·동작 이름(앱이 부르는 이름), 재질 이름(옷 색 바꿀 자리 + 정점색 Detail), 압축, 용량, 키·눈높이, 방향 계산
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  CHARACTER_CLIPS, CHARACTER_NPC_URL, CHARACTER_URL, CHARACTER_B_URL, INSTRUCTOR_EYE, INSTRUCTOR_HEIGHT, INSTRUCTOR_OUTFIT, STUDENT_HEIGHT, STUDENT_OUTFIT,
  WALK_CYCLE_DISTANCE, characterUrl, headingFor, materialColor,
} from '../src/scene/models/CharacterModel'
import { HAIR_STYLES, bodyScale } from '../src/app/avatar'
import { ORBIT_PRESET } from '../src/scene/viewMode'

type Glb = {
  nodes: Array<{ name?: string; scale?: number[] }>; skins?: Array<{ joints: number[] }>; animations?: Array<{ name?: string }>; materials: Array<{ name?: string }>
  extensionsUsed?: string[]; images?: unknown[]
}
const FILES = ['character.glb', 'character-b.glb', 'character-npc.glb'] as const
type File = (typeof FILES)[number]
const read = (f: File) => {
  const b = readFileSync(new URL(`../public/assets/models/${f}`, import.meta.url))
  return { b, size: b.length, j: JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12))) as Glb }
}
/** 앱이 문자열로 부르는 뼈 17개(설계 §4) */
const BONES = ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'UpperArm.L', 'LowerArm.L', 'Hand.L', 'UpperArm.R', 'LowerArm.R', 'Hand.R',
  'UpperLeg.L', 'LowerLeg.L', 'Foot.L', 'UpperLeg.R', 'LowerLeg.R', 'Foot.R']
/** 앱이 이름으로 색을 입히는 재질 + 보안경 + 정점색 Detail */
const MATERIALS = ['Top', 'Trim', 'Bottom', 'Shoes', 'Skin', 'Hair', 'Eye', 'GogglesFrame', 'GogglesLens', 'Detail']

describe.each(FILES)('사람 캐릭터 모델 — %s', (f) => {
  const { size, j } = read(f)
  it('뼈대 1개, 앱이 부르는 뼈 17개', () => {
    expect(j.skins ?? []).toHaveLength(1)
    expect(j.skins![0]!.joints.map((i) => j.nodes[i]!.name).sort()).toEqual([...BONES].sort())
  })
  it('동작 6개(Idle·Walk·Gesture·Crouch·Press·Equip)', () => {
    expect((j.animations ?? []).map((a) => a.name).sort()).toEqual([...CHARACTER_CLIPS].sort())
  })
  it('재질: 옷 색 자리(Top·Trim·Bottom·Shoes)·피부·머리·눈·보안경, 정점색 Detail 하나(재질은 캐릭터당 1개만 늘림)', () => {
    expect(j.materials.map((m) => m.name).sort()).toEqual([...MATERIALS].sort())
  })
  it('머리 모양 부품 4개와 보안경(Goggles)이 따로 있고 뿌리는 Character', () => {
    const names = j.nodes.map((n) => n.name)
    for (const h of HAIR_STYLES) expect(names).toContain(h.node)
    expect(names).toContain('Goggles')
    expect(names).toContain('Character')
  })
  it('meshopt만 쓰고 그림 파일이 없으며 0.4 MB 미만이다', () => {
    expect(j.extensionsUsed ?? []).toContain('EXT_meshopt_compression')
    expect(j.images ?? []).toHaveLength(0)
    expect(size).toBeLessThan(400_000)
  })
})

describe('체형 키', () => {
  const root = (f: File) => read(f).j.nodes.find((n) => n.name === 'Character')!
  it('체형 2는 뿌리(Character)를 1.62/1.72로 줄이고 체형 1·교관은 그대로', () => {
    expect(root('character.glb').scale ?? [1, 1, 1]).toEqual([1, 1, 1])
    expect(root('character-npc.glb').scale ?? [1, 1, 1]).toEqual([1, 1, 1])
    for (const s of root('character-b.glb').scale!) expect(s).toBeCloseTo(1.62 / 1.72, 4)
  })
})

// 앱과 같은 로더(GLTFLoader + meshopt 해제기)로 풀어서 본다
type Loaded = { scene: THREE.Group }
const loaded = {} as Record<File, Loaded>
beforeAll(async () => {
  await MeshoptDecoder.ready
  for (const f of FILES) {
    const { b } = read(f)
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
    const g = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(ab, '')
    g.scene.updateMatrixWorld(true)
    loaded[f] = g as unknown as Loaded
  }
})
const meshes = (f: File) => {
  const out: THREE.Mesh[] = []
  loaded[f].scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh) })
  return out
}
const matName = (m: THREE.Mesh) => (m.material as THREE.Material).name
const boxOf = (ms: THREE.Mesh[]) => ms.reduce((b, m) => b.union(new THREE.Box3().setFromObject(m, true)), new THREE.Box3())
const boneY = (f: File, n: string) => loaded[f].scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n))!.getWorldPosition(new THREE.Vector3()).y
/** 눈 재질(Eye) 부분의 가운데 높이 */
const eyeY = (f: File) => boxOf(meshes(f).filter((m) => matName(m) === 'Eye')).getCenter(new THREE.Vector3()).y

describe.each(FILES)('불러온 모습 — %s', (f) => {
  it('Detail(반사띠·입·볼터치·지퍼 등)은 정점색을 그대로 보인다: 정점색 켜짐, 바탕색 흰색', () => {
    const detail = meshes(f).filter((m) => matName(m) === 'Detail')
    expect(detail.length).toBeGreaterThan(0)
    for (const m of detail) {
      const mat = m.material as THREE.MeshStandardMaterial
      expect(mat.vertexColors).toBe(true)
      expect(mat.color.getHex()).toBe(0xffffff)
      expect(m.geometry.getAttribute('color')).toBeDefined()
    }
  })
  it('Detail 밖의 정점색은 모두 흰색이다(앱이 입힌 옷·피부 색이 그대로 보인다)', () => {
    for (const m of meshes(f).filter((x) => matName(x) !== 'Detail')) {
      const c = m.geometry.getAttribute('color')
      if (!c) continue
      for (let i = 0; i < c.count; i++) for (const v of [c.getX(i), c.getY(i), c.getZ(i)]) expect(v).toBeCloseTo(1, 3)
    }
  })
})

describe('키와 눈높이(앱의 카메라·이름표가 쓰는 값과 모델이 맞는다)', () => {
  // 짧은 머리를 쓴 서 있는 자세의 맨 위(보안경·다른 머리 부품은 빼고 잰다)
  const top = (f: File) => boxOf(meshes(f).filter((m) => !/^(Hair_(Bob|Fringe|Tied)|gog)/.test(m.name))).max.y
  it('학생 체형 1은 STUDENT_HEIGHT(1.45 m), 체형 2는 그 1.62/1.72배', () => {
    expect(Math.abs(top('character.glb') - STUDENT_HEIGHT)).toBeLessThan(0.01)
    expect(Math.abs(top('character-b.glb') - STUDENT_HEIGHT * bodyScale('b'))).toBeLessThan(0.01)
  })
  it('교관은 INSTRUCTOR_HEIGHT(1.62 m), 눈높이 INSTRUCTOR_EYE', () => {
    expect(Math.abs(top('character-npc.glb') - INSTRUCTOR_HEIGHT)).toBeLessThan(0.01)
    expect(Math.abs(eyeY('character-npc.glb') - INSTRUCTOR_EYE)).toBeLessThan(0.02)
  })
  it('교관은 학생보다 10~15% 크다(설계 §2)', () => {
    expect(INSTRUCTOR_HEIGHT / STUDENT_HEIGHT).toBeGreaterThan(1.1)
    expect(INSTRUCTOR_HEIGHT / STUDENT_HEIGHT).toBeLessThan(1.15)
  })
  it('따라가기 카메라는 학생 체형 1의 어깨와 눈 사이(머리·어깨쯤)를 본다', () => {
    expect(ORBIT_PRESET.follow.targetY).toBeGreaterThan(boneY('character.glb', 'UpperArm.L'))
    expect(ORBIT_PRESET.follow.targetY).toBeLessThan(eyeY('character.glb'))
  })
})

describe('앱 쪽 연결', () => {
  it('교관은 전용 모델 파일, 학생은 체형별 파일', () => {
    expect(CHARACTER_NPC_URL).toMatch(/models\/character-npc\.glb/)
    expect(characterUrl('a')).toBe(CHARACTER_URL)
    expect(characterUrl('b')).toBe(CHARACTER_B_URL)
    expect(characterUrl('a', true)).toBe(CHARACTER_NPC_URL)
    expect(characterUrl('b', true)).toBe(CHARACTER_NPC_URL)
  })
  it('재질 색: Top·Trim·Bottom·Shoes는 옷 색, Skin·Hair·Eye는 외모 색, Detail·보안경은 건드리지 않는다', () => {
    const look = { body: 'a' as const, hairStyle: 'short' as const, skin: '#111111', hairColor: '#222222', eye: '#333333' }
    expect(materialColor('Top', STUDENT_OUTFIT, look)).toBe(STUDENT_OUTFIT.top)
    expect(materialColor('Trim', STUDENT_OUTFIT, look)).toBe(STUDENT_OUTFIT.trim)
    expect(materialColor('Trim', { top: '#123456', bottom: '#000000' }, look)).toBe('#123456') // 배색이 없으면 윗옷 색
    expect(materialColor('Bottom', STUDENT_OUTFIT, look)).toBe(STUDENT_OUTFIT.bottom)
    expect(materialColor('Shoes', STUDENT_OUTFIT, look)).toBe(STUDENT_OUTFIT.shoes)
    expect([materialColor('Skin', STUDENT_OUTFIT, look), materialColor('Hair', STUDENT_OUTFIT, look), materialColor('Eye', STUDENT_OUTFIT, look)]).toEqual(['#111111', '#222222', '#333333'])
    for (const n of ['Detail', 'GogglesFrame', 'GogglesLens']) expect(materialColor(n, STUDENT_OUTFIT, look)).toBeUndefined()
  })
  it('교관 옷: 조끼(Top)는 형광 연두, 소매·깃(Trim)과 하의는 짙은 남색', () => {
    const c = (h: string) => new THREE.Color(h)
    const top = c(INSTRUCTOR_OUTFIT.top)
    expect(top.g).toBeGreaterThan(0.6)
    expect(top.g).toBeGreaterThan(top.b * 3)
    for (const h of [INSTRUCTOR_OUTFIT.trim!, INSTRUCTOR_OUTFIT.bottom]) {
      const d = c(h)
      expect(Math.max(d.r, d.g, d.b)).toBeLessThan(0.1) // 짙은 색(선형값)
      expect(d.b).toBeGreaterThanOrEqual(d.r)            // 남색 쪽
    }
  })
  it('걷기 한 주기(1초)에 나아가는 거리는 새 모델(체형 1)의 0.808 m', () => {
    expect(WALK_CYCLE_DISTANCE).toBe(0.808)
  })
  it('이동 방향을 바라보는 회전: 모델 앞은 -z', () => {
    expect(headingFor(0, -1)).toBeCloseTo(0, 6)
    expect(Math.abs(headingFor(0, 1))).toBeCloseTo(Math.PI, 6)
    expect(headingFor(-1, 0)).toBeCloseTo(Math.PI / 2, 6)
  })
})
