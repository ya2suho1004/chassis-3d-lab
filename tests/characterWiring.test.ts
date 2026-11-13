// tests/characterWiring.test.ts — 새 캐릭터 연결(설계 2026-11-13 캐릭터와 움직임 §3·§5): 교관 전용 모델과 사람 키를 전제로 한 값을 원본 글로 확인한다
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { PRELOAD_MODELS } from '../src/app/intro'

const read = (p: string) => readFileSync(p, 'utf8')
const scene = read('src/scene/LabScene.tsx')
const model = read('src/scene/models/CharacterModel.tsx')
const avatarScreen = read('src/screens/AvatarScreen.tsx')

describe('교관 전용 모델', () => {
  test('CharacterModel은 instructor 속성으로 교관 파일을 고른다', () => {
    expect(model).toContain('useGLTF(characterUrl(look.body, instructor), false, true)')
  })
  test('실습장의 교관은 교관 모델을 쓰고, 학생 아바타는 쓰지 않는다', () => {
    const instructor = scene.slice(scene.indexOf('function Instructor('), scene.indexOf('function EquipmentModel('))
    expect(instructor).toMatch(/<CharacterModel [^>]*\binstructor\b[^>]*outfit=\{INSTRUCTOR_OUTFIT\}/)
    const avatar = scene.slice(scene.indexOf('function Avatar('), scene.indexOf('function Instructor('))
    expect(avatar).toContain('<CharacterModel ')
    expect(avatar).not.toMatch(/\binstructor\b/)
  })
  test('캐릭터 만들기 미리보기는 학생 모델', () => {
    expect(avatarScreen).toContain('<CharacterModel action="Idle" outfit={STUDENT_OUTFIT} look={look} />')
  })
  test('교관 모델도 처음부터 미리 받는다', () => {
    expect(PRELOAD_MODELS).toContain('character-npc.glb')
  })
})

describe('사람 키를 전제로 한 값은 모델 치수 상수에서 나온다', () => {
  test('교관 대화 카메라는 교관 눈높이에서 그보다 조금 아래(턱~눈)를 본다', () => {
    expect(scene).toMatch(/const goal = new THREE\.Vector3\([^)]*, INSTRUCTOR_EYE, /)
    expect(scene).toMatch(/const tgt = new THREE\.Vector3\([^)]*, INSTRUCTOR_EYE - 0\.14, /)
  })
  test('교관 이름표는 교관 키 위', () => {
    expect(scene).toContain('<Html position={[0, INSTRUCTOR_HEIGHT + 0.33, 0]}')
  })
  test('걷는 동안 카메라 목표 높이는 시점 프리셋을 따른다(따로 적은 높이가 없다)', () => {
    expect(scene).toContain("const targetY = view === 'first' ? 1.0 : ORBIT_PRESET[view].targetY")
    expect(scene).toContain('controls.target.set(nextPos.x, targetY, nextPos.z)')
  })
  test('캐릭터 만들기 미리보기는 학생 키의 가운데를 본다', () => {
    expect(avatarScreen).toContain('target={[0, STUDENT_HEIGHT / 2, 0]}')
  })
  test('불러오는 중의 대체 모형도 교관은 교관 키', () => {
    expect(scene).toMatch(/<Person [^>]*height=\{INSTRUCTOR_HEIGHT\}/)
  })
})
