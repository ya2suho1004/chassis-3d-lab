// 실습장 사람 캐릭터(public/assets/models/character*.glb) — scripts/blender/build_character.py로 만든다.
// 머리가 큰 3등신 안팎의 양식화 비례(설계 2026-11-13 캐릭터와 움직임): 학생 체형 1(character.glb)·체형 2(character-b.glb), 교관 전용(character-npc.glb).
// 세 파일은 뼈·동작·재질·부품 이름이 같고, 앱은 재질 이름으로 옷·외모 색을 입힌다. 동작: Idle·Walk·Gesture·Crouch·Press·Equip.
// 두 품질 모두 쓴다(2026-10-29부터). 불러오는 중은 코드 모델(Person)을 쓴다. 특정 인물을 닮지 않은 일반 캐릭터다.
import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { SkeletonUtils } from 'three-stdlib'
import { HAIR_STYLES, type BodyType, type HairStyle } from '../../app/avatar'
import { assetUrl } from '../../app/assetUrl'
import { nodAngle } from '../../app/cozyState'

export const CHARACTER_URL = assetUrl('models/character.glb')
/** 체형 2(체형 1을 1.62/1.72로 줄임, 키 약 1.37 m) — 캐릭터 만들기(설계 2026-11-03) */
export const CHARACTER_B_URL = assetUrl('models/character-b.glb')
/** NPC 교관 전용(어른 비례, 키 1.62 m) — 설계 2026-11-13 §2-5 */
export const CHARACTER_NPC_URL = assetUrl('models/character-npc.glb')
export const characterUrl = (b: BodyType, instructor = false) => (instructor ? CHARACTER_NPC_URL : b === 'b' ? CHARACTER_B_URL : CHARACTER_URL)

/** 모델 치수(m, build_character.py가 찍는 MEASURE 값). 카메라·이름표가 이 값을 쓰고 tests/characterAsset.test.ts가 모델 파일과 대조한다 */
export const STUDENT_HEIGHT = 1.45
export const INSTRUCTOR_HEIGHT = 1.62
export const INSTRUCTOR_EYE = 1.339

/** 외모(체형·머리 모양·피부·머리·눈 색). 없으면 기본(체형 1, 짧은 머리, 모델 색 그대로) — NPC 교관(교관은 body와 상관없이 교관 모델) */
export interface CharacterLook { body: BodyType; hairStyle: HairStyle; skin?: string; hairColor?: string; eye?: string }
export const DEFAULT_LOOK: CharacterLook = { body: 'a', hairStyle: 'short' }
export const CHARACTER_CLIPS = ['Idle', 'Walk', 'Gesture', 'Crouch', 'Press', 'Equip'] as const
/** 한 번만 재생하고 끝 자세에서 멈추는 동작(앱이 길이를 재고 Idle로 돌린다) */
const ONE_SHOT = new Set<string>(['Crouch', 'Press', 'Equip'])
export type CharacterAction = (typeof CHARACTER_CLIPS)[number]

/** 옷 색(재질 이름 Top·Bottom·Shoes·Trim). 실습복의 남색 판은 Trim(어깨 띠·허리 아래 띠, 2026-11-03)으로 살린다 */
export interface Outfit { top: string; bottom: string; shoes?: string; /** 배색 판(어깨 띠·허리 아래 띠, 재질 Trim). 없으면 윗옷 색 */ trim?: string }
/** 학생: 친환경자동차과 실습복(주황 + 남색 판). 학교 홍보 포스터의 옷 부분에서 색만 뽑음(2026-11-02, docs/20 D34). 하의는 사진에 안 보여 남색 판 색으로 가정 */
export const STUDENT_OUTFIT: Outfit = { top: '#ea4b2a', bottom: '#2b2d64', shoes: '#cfd3d6', trim: '#2b2d64' }
/** 교관: 짙은 남색 작업복(Trim = 소매·어깨·깃·끝단) 위에 형광 연두 조끼(Top = 조끼 몸판). 교관 모델에서만 Top이 조끼다 */
export const INSTRUCTOR_OUTFIT: Outfit = { top: '#c6ef2b', bottom: '#1f2733', shoes: '#3b2a1e', trim: '#24324a' }
/** 보호구 착용 뒤 학생 신발(안전화 — 짙은 갈색) */
export const SAFETY_SHOES = '#3b2a1e'

/** 사람은 레이어 2에만 둔다: 바닥 그림자를 한 번 구울 때(look/FloorShadowBake — 굽는 카메라는 레이어 0만 봄) 빠져 움직인 뒤 그림자가 남지 않게 한다.
 *  화면 카메라·클릭·조준 광선은 레이어 2도 켠다(LabScene LayerSetup) */
export const CHARACTER_LAYER = 2

/** 걷기 동작 한 주기(1초)에 나아가는 거리(m, 체형 1) — 이동 속도에 맞춰 재생 속도를 정한다. 체형 2는 bodyScale을 곱한다.
 *  값은 build_character.py의 설계 보폭(walk_cycle_design_m 0.808, 디딘 발이 몸에 대해 뒤로 가는 속도) */
export const WALK_CYCLE_DISTANCE = 0.808

/** 모델 앞은 -z. 이동 방향(dx, dz)을 보게 하는 y 회전 */
export function headingFor(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz)
}

/** 재질 이름으로 입힐 색. Top·Trim·Bottom·Shoes는 옷, Skin·Hair·Eye는 외모. Detail(정점색으로 반사띠·입·볼터치·지퍼 등)과 보안경은 모델 그대로 */
export function materialColor(name: string, outfit: Outfit, look: CharacterLook): string | undefined {
  switch (name) {
    case 'Top': return outfit.top
    case 'Trim': return outfit.trim ?? outfit.top
    case 'Bottom': return outfit.bottom
    case 'Shoes': return outfit.shoes
    case 'Skin': return look.skin
    case 'Hair': return look.hairColor
    case 'Eye': return look.eye
    default: return undefined
  }
}

/** 끄덕임은 카메라가 교관 앞에 자리 잡은 뒤 시작(초) */
const NOD_DELAY = 0.45

/** nod: 켜지는 순간부터 고개를 두 번 끄덕인다(검사 통과 — 교관 전용). 모든 동작 클립이 Head 회전을 매 프레임 덮어쓰므로 그 위에 더한다.
 *  instructor: 교관 전용 모델(character-npc.glb)을 쓴다 */
export function CharacterModel({ action, outfit, speed = 1, goggles = false, look = DEFAULT_LOOK, nod = false, instructor = false }: { action: CharacterAction; outfit: Outfit; speed?: number; goggles?: boolean; look?: CharacterLook; nod?: boolean; instructor?: boolean }) {
  const { scene, animations } = useGLTF(characterUrl(look.body, instructor), false, true)
  // 뼈대가 있는 모델은 SkeletonUtils로 복제해야 학생·교관이 따로 움직인다
  const clone = useMemo(() => SkeletonUtils.clone(scene) as THREE.Group, [scene])
  const root = useRef<THREE.Group>(null)
  const { actions } = useAnimations(animations, root)
  const head = useMemo(() => clone.getObjectByName('Head') ?? null, [clone])
  const nodT = useRef(-1)
  useEffect(() => { nodT.current = nod ? -NOD_DELAY : -1 }, [nod])
  // useAnimations의 mixer.update 뒤에 돈다(같은 컴포넌트에서 먼저 등록됨)
  useFrame((_, dt) => {
    if (!nod || !head) return
    nodT.current += Math.min(dt, 0.1)
    const a = nodAngle(nodT.current)
    // 모델 앞이 -z라서 +x 회전은 고개를 뒤로 젖힌다 → 숙이려면 -x
    if (a) head.rotateX(-a)
  })

  useLayoutEffect(() => {
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.layers.set(CHARACTER_LAYER)
      mesh.castShadow = true
      mesh.frustumCulled = false // 뼈로 움직인 몸이 원래 경계 상자를 벗어나도 사라지지 않게
      // 복제해도 로더가 켠 정점색(vertexColors)은 그대로 — Detail은 색을 건드리지 않아 정점색이 보인다
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
      const color = materialColor(mat.name, outfit, look)
      if (color) mat.color.set(color)
      mesh.material = mat
    })
  }, [clone, outfit, look.skin, look.hairColor, look.eye]) // look 객체는 캐릭터 만들기에서 매번 새로 만들어져 색 값만 본다

  // 머리 모양: 모델 안 부품 4개 중 고른 것만 보인다
  useLayoutEffect(() => {
    const want = HAIR_STYLES.find((h) => h.id === look.hairStyle)?.node ?? 'Hair_Short'
    for (const h of HAIR_STYLES) {
      const n = clone.getObjectByName(h.node)
      if (n) n.visible = h.node === want
    }
  }, [clone, look.hairStyle])

  // 보안경(보호구 착용 단계 뒤에만 보임)
  useLayoutEffect(() => {
    const g = clone.getObjectByName('Goggles')
    if (g) g.visible = goggles
  }, [clone, goggles])

  useEffect(() => {
    const a = actions[action]
    if (!a) return
    if (ONE_SHOT.has(action)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true }
    a.reset().fadeIn(0.25).play()
    return () => { a.fadeOut(0.25) }
  }, [action, actions])

  useEffect(() => {
    const a = actions[action]
    if (a) a.timeScale = speed
  }, [action, actions, speed])

  return <group ref={root}><primitive object={clone} /></group>
}
