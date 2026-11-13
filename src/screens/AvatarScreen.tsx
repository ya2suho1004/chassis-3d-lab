// 캐릭터 만들기 화면(설계 docs/superpowers/specs/2026-11-03-character-creation-design.md)
// 왼쪽 3D 미리보기(서 있기 동작, 끌어서 돌리기) + 오른쪽 선택(체형·머리 모양·색·닉네임). 실습복은 고정.
// 결과는 부모가 이 기기에만 저장한다(비기록이면 저장하지 않음). 연구 기록·서버·AI와 무관하다.
import { Suspense, useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BODIES, EYES, HAIR_COLORS, HAIR_STYLES, NICK_BACK, NICK_FRONT, SKINS, nicknameOf, randomNickname, type AvatarProfile, type Choice } from '../app/avatar'
import { Icon } from './Icon'
import { CHARACTER_LAYER, CharacterModel, STUDENT_HEIGHT, STUDENT_OUTFIT } from '../scene/models/CharacterModel'
import { ToneSetup } from '../scene/look/ToneSetup'

/** 사람은 레이어 2에만 그려진다(CharacterModel) — 미리보기 카메라도 레이어 2를 켠다 */
function SeeCharacters() {
  const camera = useThree((s) => s.camera)
  useEffect(() => { camera.layers.enable(CHARACTER_LAYER) }, [camera])
  return null
}

function Chips<T extends string>({ name, items, value, onPick }: { name: string; items: Array<Choice<T>>; value: T; onPick: (v: T) => void }) {
  return (
    <div className="av-chips" role="group" aria-label={name}>
      {items.map((it) => <button key={it.id} className="av-chip" aria-pressed={it.id === value} onClick={() => onPick(it.id)}>{it.label}</button>)}
    </div>
  )
}

function Swatches({ name, items, value, onPick }: { name: string; items: Choice[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="av-swatches" role="group" aria-label={name}>
      {items.map((it) => <button key={it.id} className="av-swatch" aria-pressed={it.id === value} aria-label={it.label} title={it.label} style={{ background: it.id }} onClick={() => onPick(it.id)} />)}
    </div>
  )
}

export function AvatarScreen({ initial, editing = false, saveNote, onDone, onCancel }: {
  initial: AvatarProfile
  /** 실습장 메뉴에서 다시 꾸미기로 열었는가(닫기 버튼을 보임) */
  editing?: boolean
  /** 저장 위치 안내 한 줄(일반: 이 기기에 저장, 비기록: 저장 안 함) */
  saveNote: string
  onDone: (p: AvatarProfile) => void
  onCancel?: () => void
}) {
  const [p, setP] = useState<AvatarProfile>(initial)
  const set = <K extends keyof AvatarProfile>(k: K, v: AvatarProfile[K]) => setP((cur) => ({ ...cur, [k]: v }))
  const look = { body: p.body, hairStyle: p.hairStyle, skin: p.skin, hairColor: p.hairColor, eye: p.eye }

  return (
    <main className="screen avatar wa">
      <h1>{editing ? '캐릭터 다시 꾸미기' : '내 캐릭터 만들기'}</h1>
      <div className="av-grid">
        <div>
        <p className="av-nick" aria-live="polite">{nicknameOf(p)}</p>
        <section className="av-preview" aria-label="캐릭터 미리보기(끌어서 돌리기)">
          {/* 키 1.45 m가 세로 시야의 약 88%를 채우는 거리(예전 1.72 m·3.7 m와 같은 비율), 가운데를 조금 위에서 본다 */}
          <Canvas camera={{ position: [0, 0.85, 3.1], fov: 30 }} dpr={[1, 2]}>
            <SeeCharacters />
            <ToneSetup />
            <color attach="background" args={['#f6e7d2']} />
            <hemisphereLight args={['#ffffff', '#8aa39a', 1.3]} />
            <directionalLight position={[2, 4, 3]} intensity={1.6} />
            <Suspense fallback={null}>
              <group rotation-y={Math.PI}>
                <CharacterModel action="Idle" outfit={STUDENT_OUTFIT} look={look} />
              </group>
            </Suspense>
            <mesh rotation-x={-Math.PI / 2}><circleGeometry args={[0.7, 40]} /><meshStandardMaterial color="#2e8b57" /></mesh>
            <OrbitControls target={[0, STUDENT_HEIGHT / 2, 0]} enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2.6} maxPolarAngle={Math.PI / 1.9} />
          </Canvas>
        </section>
        <p className="small">미리보기를 손가락으로 끌면 캐릭터가 돌아갑니다.</p>
        </div>
        <section className="av-options">
          <h2>닉네임</h2>
          <div className="av-nickrow">
            <select aria-label="닉네임 앞말" value={p.nickFront} onChange={(e) => set('nickFront', e.target.value)}>
              {NICK_FRONT.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
            <select aria-label="닉네임 뒷말" value={p.nickBack} onChange={(e) => set('nickBack', e.target.value)}>
              {NICK_BACK.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
            <button aria-label="닉네임 무작위로 뽑기" onClick={() => setP((cur) => ({ ...cur, ...randomNickname() }))}><Icon name="dice" /> 뽑기</button>
          </div>
          <h2>체형</h2>
          <Chips name="체형" items={BODIES} value={p.body} onPick={(v) => set('body', v)} />
          <h2>머리 모양</h2>
          <Chips name="머리 모양" items={HAIR_STYLES} value={p.hairStyle} onPick={(v) => set('hairStyle', v)} />
          <h2>머리색</h2>
          <Swatches name="머리색" items={HAIR_COLORS} value={p.hairColor} onPick={(v) => set('hairColor', v)} />
          <h2>피부색</h2>
          <Swatches name="피부색" items={SKINS} value={p.skin} onPick={(v) => set('skin', v)} />
          <h2>눈 색</h2>
          <Swatches name="눈 색" items={EYES} value={p.eye} onPick={(v) => set('eye', v)} />
          <p className="small">실습복은 친환경자동차과 실습복으로 정해져 있습니다. {saveNote}</p>
          <div className="row">
            <button className="primary" onClick={() => onDone(p)}>{editing ? '이대로 바꾸기' : '이대로 시작'}</button>
            {onCancel && <button onClick={onCancel}>닫기</button>}
          </div>
        </section>
      </div>
    </main>
  )
}
