// 인트로 그림(설계 docs/superpowers/specs/2026-11-03-intro-loading-design.md)
// 밤, 실습장 철판 롤셔터(청회색)와 학과 간판, 셔터 안쪽 노란 쿠페(엠블럼·차 이름 없음)와 헤드라이트 빛.
// 따뜻한 정비 공방 1단계(설계 2026-11-06 §4): 셔터 안쪽 빛을 호박색으로, 간판을 패널(나무·크림) 색으로. 닫힌 셔터 아래 틈으로 불빛이 샌다.
// 학과 홍보 영상 오프닝의 분위기만 참고해 직접 그린 것이다(영상·사진을 넣지 않음). 움직임은 styles.css의 .ia-* 규칙.

import { useEffect, useState } from 'react'

export type ShutterPhase = 'closed' | 'opening' | 'open'

const W = 1600, H = 900
const OX0 = 400, OX1 = 1200, OY0 = 250, OY1 = 760 // 셔터 문 열린 자리
const SLAT = 17

/** 세로 화면(폰)에서는 셔터·간판 부분만 잘라 폭에 맞춘다(가로 화면은 화면을 꽉 채움) */
function usePortrait(): boolean {
  const q = '(max-aspect-ratio: 1/1)'
  const [portrait, setPortrait] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const m = matchMedia(q)
    const on = () => setPortrait(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return portrait
}

export function IntroArt({ phase, dim = false }: { phase: ShutterPhase; dim?: boolean }) {
  const portrait = usePortrait()
  return (
    <svg className={`ia ia-${phase} ${dim ? 'ia-dim' : ''}`} viewBox={portrait ? '350 90 900 690' : `0 0 ${W} ${H}`} preserveAspectRatio={portrait ? 'xMidYMid meet' : 'xMidYMid slice'} aria-hidden="true">
      <defs>
        <linearGradient id="ia-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#04060c" /><stop offset="1" stopColor="#141c2a" /></linearGradient>
        <linearGradient id="ia-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#262b33" /><stop offset="1" stopColor="#1a1e24" /></linearGradient>
        <linearGradient id="ia-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#140e09" /><stop offset="0.55" stopColor="#2a1b0e" /><stop offset="0.8" stopColor="#3a2a14" /><stop offset="1" stopColor="#2c3a1e" /></linearGradient>
        <linearGradient id="ia-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd23f" /><stop offset="0.55" stopColor="#f0b417" /><stop offset="1" stopColor="#b98208" /></linearGradient>
        <linearGradient id="ia-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a3340" /><stop offset="1" stopColor="#0d1117" /></linearGradient>
        <linearGradient id="ia-slats" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#56717d" /><stop offset="1" stopColor="#30454e" /></linearGradient>
        <pattern id="ia-slat" width="40" height={SLAT} patternUnits="userSpaceOnUse">
          <rect width="40" height={SLAT} fill="url(#ia-slats)" />
          <rect y="0" width="40" height="2" fill="#7593a0" opacity="0.55" />
          <rect y={SLAT - 3} width="40" height="3" fill="#1d2b31" opacity="0.75" />
        </pattern>
        <pattern id="ia-hex" width="14" height="12" patternUnits="userSpaceOnUse">
          <rect width="14" height="12" fill="#121518" />
          <path d="M3 1h8l3 5-3 5H3L0 6z" fill="none" stroke="#2c3238" strokeWidth="1.4" />
        </pattern>
        <radialGradient id="ia-flare"><stop offset="0" stopColor="#ffffff" /><stop offset="0.25" stopColor="#eaf4ff" stopOpacity="0.9" /><stop offset="1" stopColor="#bcd8ff" stopOpacity="0" /></radialGradient>
        <radialGradient id="ia-spill" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#ffe2a8" stopOpacity="0.6" /><stop offset="1" stopColor="#ffd08a" stopOpacity="0" /></radialGradient>
        <radialGradient id="ia-warm" cx="0.5" cy="0.35" r="0.65"><stop offset="0" stopColor="#ffb85c" stopOpacity="0.55" /><stop offset="0.6" stopColor="#f28c28" stopOpacity="0.16" /><stop offset="1" stopColor="#f28c28" stopOpacity="0" /></radialGradient>
        <radialGradient id="ia-leak"><stop offset="0" stopColor="#ffc46b" stopOpacity="0.5" /><stop offset="0.7" stopColor="#f2a24a" stopOpacity="0.14" /><stop offset="1" stopColor="#f2a24a" stopOpacity="0" /></radialGradient>
        <linearGradient id="ia-sign" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5e34" /><stop offset="1" stopColor="#5b3a1e" /></linearGradient>
        <clipPath id="ia-door"><rect x={OX0} y={OY0} width={OX1 - OX0} height={OY1 - OY0} /></clipPath>
      </defs>

      {/* 밤하늘·건물 벽·바닥 */}
      <rect width={W} height={H} fill="url(#ia-sky)" />
      <rect x="120" y="90" width={W - 240} height={OY1 - 90} fill="url(#ia-wall)" />
      <rect y={OY1} width={W} height={H - OY1} fill="#111418" />
      <rect y={OY1} width={W} height="4" fill="#2b3036" />

      {/* 셔터 안쪽: 실습장(초록 바닥) + 노란 쿠페 */}
      <g clipPath="url(#ia-door)">
        <rect x={OX0} y={OY0} width={OX1 - OX0} height={OY1 - OY0} fill="url(#ia-in)" />
        <g className="ia-lights">
          <rect x={OX0} y={OY0} width={OX1 - OX0} height={OY1 - OY0} fill="url(#ia-warm)" />
          {[300, 360, 420].map((y, i) => <rect key={y} x={560 + i * 30} y={y - 30} width={480 - i * 60} height="6" rx="3" fill="#ffe2a8" opacity={0.85 - i * 0.2} />)}
        </g>
        <g className="ia-car">
          {/* 바퀴 */}
          <rect x="560" y="650" width="78" height="96" rx="12" fill="#0b0c0e" />
          <rect x="962" y="650" width="78" height="96" rx="12" fill="#0b0c0e" />
          {/* 지붕·앞유리 */}
          <path d="M650 520 Q800 470 950 520 L1000 585 L600 585 Z" fill="url(#ia-glass)" />
          <path d="M660 528 Q800 486 940 528" stroke="#4a5868" strokeWidth="3" fill="none" opacity="0.6" />
          {/* 차체(보닛·펜더·범퍼) */}
          <path d="M560 600 Q600 570 680 576 L920 576 Q1000 570 1040 600 L1058 690 Q1058 726 1020 732 L580 732 Q542 726 542 690 Z" fill="url(#ia-body)" />
          <path d="M600 590 Q800 562 1000 590" stroke="#ffe57a" strokeWidth="4" fill="none" opacity="0.7" />
          {/* 그릴 */}
          <path d="M690 628 L910 628 L932 676 L668 676 Z" fill="url(#ia-hex)" stroke="#0a0b0d" strokeWidth="3" />
          {/* 아래 흡기구·립 */}
          <path d="M640 700 L960 700 L948 722 L652 722 Z" fill="#14171b" />
          <path d="M560 716 L640 716 L630 732 L566 732 Z" fill="#14171b" />
          <path d="M1040 716 L960 716 L970 732 L1034 732 Z" fill="#14171b" />
          {/* 헤드라이트(3줄 주간등 느낌) */}
          {[[575, 1], [1025, -1]].map(([x, d]) => (
            <g key={x} transform={`translate(${x} 606) scale(${d} 1)`}>
              <path d="M0 0 L104 -6 L96 18 L8 22 Z" fill="#20252b" />
              {[0, 7, 14].map((y) => <rect key={y} x={14} y={-2 + y} width={70 - y} height="3.4" rx="1.7" fill="#f4fbff" className="ia-led" />)}
            </g>
          ))}
        </g>
        {/* 헤드라이트 빛 번짐 */}
        <g className="ia-glow">
          <ellipse cx="800" cy="745" rx="420" ry="40" fill="url(#ia-spill)" />
          {[630, 970].map((x) => (
            <g key={x}>
              <circle cx={x} cy="612" r="120" fill="url(#ia-flare)" />
              <ellipse cx={x} cy="612" rx="360" ry="5" fill="#e8f3ff" opacity="0.8" />
            </g>
          ))}
        </g>
      </g>

      {/* 철판 롤셔터(올라가며 위 통으로 말려 들어감) */}
      <g clipPath="url(#ia-door)">
        <g className="ia-shutter">
          <rect x={OX0} y={OY0} width={OX1 - OX0} height={OY1 - OY0} fill="url(#ia-slat)" />
          <rect x={OX0} y={OY1 - 16} width={OX1 - OX0} height="16" fill="#26343a" />
          <rect x="770" y={OY1 - 42} width="60" height="14" rx="4" fill="#1b2328" />
        </g>
      </g>

      {/* 닫힌 셔터 아래 틈으로 새는 불빛(열리면 사라짐) */}
      <g className="ia-leak">
        <rect x={OX0} y={OY1 - 2} width={OX1 - OX0} height="2" fill="#ffd08a" opacity="0.8" />
        <ellipse cx={(OX0 + OX1) / 2} cy={OY1 + 4} rx={(OX1 - OX0) / 2 + 30} ry="30" fill="url(#ia-leak)" />
      </g>

      {/* 셔터 통·기둥 */}
      <rect x={OX0 - 18} y={OY0 - 30} width={OX1 - OX0 + 36} height="34" rx="4" fill="#2d343b" />
      <rect x={OX0 - 18} y={OY0} width="18" height={OY1 - OY0} fill="#22272d" />
      <rect x={OX1} y={OY0} width="18" height={OY1 - OY0} fill="#22272d" />

      {/* 학과 간판 */}
      <g>
        <ellipse cx="800" cy="112" rx="300" ry="34" fill="url(#ia-spill)" />
        <rect x="430" y="110" width="740" height="92" rx="14" fill="url(#ia-sign)" stroke="#c98b4f" strokeWidth="4" />
        <rect x="440" y="120" width="720" height="72" rx="9" fill="none" stroke="#c98b4f" strokeWidth="1.5" opacity="0.55" />
        <text x="800" y="150" textAnchor="middle" fill="#ffe2b8" fontSize="26" fontWeight="600" letterSpacing="4">대구공업고등학교</text>
        <text x="800" y="189" textAnchor="middle" fill="#fff6e5" fontSize="36" fontWeight="800" letterSpacing="6">친환경자동차과 실습장</text>
      </g>
      {/* 벽등 */}
      <circle cx="300" cy="300" r="10" fill="#ffe7a8" /><circle cx="300" cy="300" r="60" fill="url(#ia-spill)" />
      <circle cx="1300" cy="300" r="10" fill="#ffe7a8" /><circle cx="1300" cy="300" r="60" fill="url(#ia-spill)" />
    </svg>
  )
}

/** 학교·학과 로고(톱니바퀴 + 렌치 + 글자). 학교 공식 교표가 아니다 */
export function IntroLogo() {
  const teeth = Array.from({ length: 12 }, (_, i) => i * 30)
  return (
    <svg className="ia-logo" viewBox="0 0 600 360" aria-label="대구공업고등학교 친환경자동차과">
      <g transform="translate(300 120)">
        {teeth.map((a) => <rect key={a} x="-11" y="-92" width="22" height="26" rx="4" fill="#f0b417" transform={`rotate(${a})`} />)}
        <circle r="72" fill="none" stroke="#f0b417" strokeWidth="18" />
        <circle r="40" fill="#0b0f16" stroke="#3e5f8a" strokeWidth="4" />
        <g transform="rotate(-40)">
          <rect x="-7" y="-58" width="14" height="96" rx="6" fill="#e8eef5" />
          <path d="M-22 -66 a22 22 0 1 0 44 0 l-10 0 l0 12 l-24 0 l0 -12 z" fill="#e8eef5" />
        </g>
      </g>
      <text x="300" y="268" textAnchor="middle" fill="#ffffff" fontSize="40" fontWeight="800" letterSpacing="6">친환경자동차과</text>
      <text x="300" y="312" textAnchor="middle" fill="#b9c7d8" fontSize="22" fontWeight="600" letterSpacing="8">대구공업고등학교</text>
    </svg>
  )
}
