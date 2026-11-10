// 회전반경 측정판 눈금 그림(설계 2026-11-10 §5, MOON 결정 A). 3D 측정판(scene/models/TurntableDial.tsx)과 같은 눈금:
// 바퀴 바깥이 0°, 앞뒤로 45°까지 1° 눈금, 5°마다 긴 눈금, 10°마다 숫자(절댓값). 3D 확대 보기처럼 바퀴 바깥에서 본 모습이라
// 0°가 아래 가운데에 있다. 바늘 각도 +는 화면 오른쪽이다(바퀴 바깥에 서서 보면 좌회전은 두 바퀴 모두 오른쪽).
// 각도는 글자·aria-label 어디에도 숫자로 쓰지 않는다(학생이 눈금을 읽는다). 띠가 그림 폭을 채워 1° 눈금 사이가 폭의 약 1.2%다.

/** 그림 치수(viewBox 단위). 중심(CX, CY)은 그림 위쪽 바깥에 있다 */
export const DIAL = { W: 620, H: 214, CX: 310, CY: -250, RT: 420, RL: 384, RS: 404, RN: 446, RP0: 360, RP1: 432 } as const

/** 중심에서 r만큼, 아래(0°)에서 deg만큼 오른쪽(+)으로 돈 점 */
export function dialPoint(r: number, deg: number): { x: number; y: number } {
  const t = (deg * Math.PI) / 180
  return { x: DIAL.CX + r * Math.sin(t), y: DIAL.CY + r * Math.cos(t) }
}

/** 그림 제목: 다시 보기 중이면 측정 당시임을 밝힌다 */
export const dialCaption = (side: 'left' | 'right', reviewing: boolean) => `${side === 'left' ? '좌측 바퀴' : '우측 바퀴'}${reviewing ? ' — 측정 당시(핸들을 끝까지 돌렸을 때)' : ''}`

const r1 = (v: number) => Math.round(v * 10) / 10
const TICKS = Array.from({ length: 91 }, (_, i) => i - 45)

export function TurningDialPicture({ side, deg, caption }: { side: 'left' | 'right'; deg: number; caption?: string }) {
  const name = side === 'left' ? '좌측 바퀴' : '우측 바퀴'
  const a = Number.isFinite(deg) ? Math.max(-45, Math.min(45, deg)) : 0
  const p0 = dialPoint(DIAL.RP0, a), p1 = dialPoint(DIAL.RP1, a)
  return (
    <figure className="tt-dial">
      <figcaption>{caption ?? name}</figcaption>
      <svg viewBox={`0 0 ${DIAL.W} ${DIAL.H}`} role="img" aria-label={`${name} 회전반경 측정판 눈금`}>
        <rect x={0} y={0} width={DIAL.W} height={DIAL.H} rx={12} fill="#fff8d6" />
        {TICKS.map((t) => {
          const long = t % 5 === 0
          const q0 = dialPoint(long ? DIAL.RL : DIAL.RS, t), q1 = dialPoint(DIAL.RT, t)
          return <line key={t} x1={r1(q0.x)} y1={r1(q0.y)} x2={r1(q1.x)} y2={r1(q1.y)} stroke="#1b1b1b" strokeWidth={long ? 3.5 : 2} />
        })}
        {TICKS.filter((t) => t % 10 === 0).map((t) => {
          const q = dialPoint(DIAL.RN, t)
          return <text key={`n${t}`} x={r1(q.x)} y={r1(q.y)} transform={`rotate(${-t} ${r1(q.x)} ${r1(q.y)})`} textAnchor="middle" dominantBaseline="middle" fontSize={24} fontWeight={700} fill="#1b1b1b">{Math.abs(t)}</text>
        })}
        <line className="needle" x1={r1(p0.x)} y1={r1(p0.y)} x2={r1(p1.x)} y2={r1(p1.y)} stroke="#d50000" strokeWidth={5} strokeLinecap="round" />
      </svg>
    </figure>
  )
}

/** 측정 당시 눈금 다시 보기 버튼(각도 오답을 안 뒤에만 보인다, §5) */
export function ReviewToggle({ reviewing, onToggle }: { reviewing: boolean; onToggle: () => void }) {
  return <button className="tt-review" onClick={onToggle}>{reviewing ? '지금 눈금 보기' : '측정 당시 눈금 다시 보기'}</button>
}
