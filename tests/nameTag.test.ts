// tests/nameTag.test.ts — 머리 위 닉네임(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 1-1·1-8)
// 3D 장면은 그리기 시험을 못 하므로 보임·높이는 함수로, 연결은 원본 글로 확인한다(characterWiring과 같은 방식)
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { NAME_TAG_GAP, studentNameTagY, studentShown } from '../src/scene/nameTag'
import { STUDENT_HEIGHT } from '../src/scene/models/CharacterModel'
import { bodyScale } from '../src/app/avatar'

const read = (p: string) => readFileSync(p, 'utf8')
const scene = read('src/scene/LabScene.tsx')

describe('머리 위 닉네임 — 보임과 높이', () => {
  test('3인칭(내려다보기·따라가기)에서 캐릭터와 함께 보이고, 1인칭·대화 중(장면 연출 중)에는 없다', () => {
    expect(studentShown(false, 'overview')).toBe(true)
    expect(studentShown(false, 'follow')).toBe(true)
    expect(studentShown(false, 'first')).toBe(false)
    expect(studentShown(true, 'follow')).toBe(false)
  })
  test('높이는 머리 바로 위(키 + 0.15, 따라가기 시점에서 뒤쪽 물건에 붙어 보이지 않게), 체형 2는 줄인 키', () => {
    expect(NAME_TAG_GAP).toBe(0.15)
    expect(studentNameTagY('a')).toBeCloseTo(STUDENT_HEIGHT + 0.15)
    expect(studentNameTagY('b')).toBeCloseTo(STUDENT_HEIGHT * bodyScale('b') + 0.15)
  })
})

describe('머리 위 닉네임 — 연결', () => {
  test('학생 캐릭터(Avatar)가 이름이 있을 때 누를 수 없는 이름표(label3d me)를 그린다', () => {
    const avatar = scene.slice(scene.indexOf('function Avatar('), scene.indexOf('function Instructor('))
    expect(avatar).toContain("{name && <Html position={[0, studentNameTagY(look.body), 0]} center style={{ pointerEvents: 'none' }}><div className=\"label3d me\">{name}</div></Html>}")
  })
  test('Walker는 캐릭터를 숨길 때 이름표도 그리지 않는다(drei Html은 부모 visible을 따르지 않음)', () => {
    expect(scene).toContain('const shown = studentShown(frozen, view)')
    expect(scene).toContain('<group visible={shown}><Avatar pos={pos} heading={heading} moving={walking} speed={speed} oneShot={oneShot} ppe={ppe} look={look} name={shown ? name : undefined} /></group>')
  })
  test('실습장 화면은 게임·기본 화면 모두 닉네임을 넘긴다', () => {
    const lab = read('src/screens/LabScreen.tsx')
    expect(lab.match(/<LabScene /g)).toHaveLength(2)
    expect(lab.match(/ studentName=\{nickname\} \/>/g)).toHaveLength(2)
  })
  test('장비 이름표와 구별되는 모양', () => {
    expect(read('src/styles.css')).toMatch(/\.label3d\.me \{[^}]+\}/)
  })
})
