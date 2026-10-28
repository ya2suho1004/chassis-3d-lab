// 가상 조이스틱(왼쪽 아래) + 키보드(WASD·방향키) 이동 입력. 값은 ref로만 넘겨 매 프레임 다시 그리지 않는다.
// x: 오른쪽 +, y: 아래 + (화면 기준). 길이 0~1. 3D 장면의 Walker가 카메라 방향 기준으로 바꿔 걷는다.
import { useEffect, useRef, useState } from 'react'

export interface MoveInput { x: number; y: number }

const RADIUS = 56 // 손잡이가 움직이는 반지름(px)

export function Joystick({ input }: { input: React.MutableRefObject<MoveInput> }) {
  const base = useRef<HTMLDivElement>(null)
  const pointer = useRef<number | null>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const update = (clientX: number, clientY: number) => {
    const b = base.current?.getBoundingClientRect()
    if (!b) return
    let dx = clientX - (b.left + b.width / 2)
    let dy = clientY - (b.top + b.height / 2)
    const len = Math.hypot(dx, dy)
    if (len > RADIUS) { dx = (dx / len) * RADIUS; dy = (dy / len) * RADIUS }
    setKnob({ x: dx, y: dy })
    input.current = { x: dx / RADIUS, y: dy / RADIUS }
  }
  const release = () => { pointer.current = null; setKnob({ x: 0, y: 0 }); input.current = { x: 0, y: 0 } }

  // 키보드: 누르고 있는 키 묶음으로 방향을 만든다(입력칸에 글을 쓰는 중이면 무시)
  useEffect(() => {
    const keys = new Set<string>()
    const apply = () => {
      if (pointer.current !== null) return
      const x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0)
      const y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0)
      const l = Math.hypot(x, y) || 1
      input.current = { x: x / l, y: y / l }
    }
    const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) }
    const down = (e: KeyboardEvent) => { if (typing(e)) return; const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); apply(); e.preventDefault() } }
    const up = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); apply() }
    const blur = () => { keys.clear(); apply() }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [input])

  return (
    <div className="joystick" ref={base} role="application" aria-label="이동 조이스틱: 끌어서 걷기(키보드 W·A·S·D 또는 방향키)"
      onPointerDown={(e) => { pointer.current = e.pointerId; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); update(e.clientX, e.clientY) }}
      onPointerMove={(e) => { if (pointer.current === e.pointerId) update(e.clientX, e.clientY) }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      <div className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}
