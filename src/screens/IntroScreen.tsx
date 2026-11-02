// 인트로 화면(설계 docs/superpowers/specs/2026-11-03-intro-loading-design.md)
// 로고(처음 한 번) → 타이틀(닫힌 셔터, "화면을 눌러 시작") → 셔터 열림(소리) → 하얗게 밝아지며 onDone.
// 어느 단계든 누르면 다음으로 넘어간다. 연구 기록과 무관하다.
import { useEffect, useRef, useState } from 'react'
import { loadIntroPrefs, saveIntroPrefs, type IntroPlan } from '../app/intro'
import { playEngine, playShutter } from '../app/introSound'
import { IntroArt, IntroLogo } from './IntroArt'

type Stage = 'logo' | 'title' | 'opening' | 'flash'
const LOGO_MS = 1700, OPEN_MS = 3000, FLASH_MS = 550

export function IntroScreen({ plan, onDone }: { plan: Exclude<IntroPlan, 'none'>; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>(plan === 'full' ? 'logo' : 'title')
  const done = useRef(false)
  const finish = () => { if (!done.current) { done.current = true; onDone() } }

  // 타이틀까지 왔으면 '본 적 있음'(다음부터 로고 생략)
  useEffect(() => {
    if (stage !== 'title') return
    const p = loadIntroPrefs()
    if (!p.seen) saveIntroPrefs({ ...p, seen: true })
  }, [stage])

  useEffect(() => {
    if (stage === 'logo') { const t = setTimeout(() => setStage('title'), LOGO_MS); return () => clearTimeout(t) }
    if (stage === 'opening') { const t = setTimeout(() => setStage('flash'), OPEN_MS); return () => clearTimeout(t) }
    if (stage === 'flash') { const t = setTimeout(finish, FLASH_MS); return () => clearTimeout(t) }
  }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps

  const tap = () => {
    if (stage === 'logo') return setStage('title')
    if (stage === 'title') {
      playShutter(2.2)
      playEngine(1.7)
      return setStage('opening')
    }
    finish()
  }

  return (
    <main className={`intro intro-${stage}`} onClick={tap} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') tap() }} role="button" tabIndex={0}
      aria-label={stage === 'title' ? '화면을 눌러 시작' : '눌러서 건너뛰기'}>
      {stage === 'logo' ? (
        <div className="intro-logo"><IntroLogo /></div>
      ) : (
        <>
          <IntroArt phase={stage === 'title' ? 'closed' : 'opening'} />
          {stage === 'title' && <p className="intro-press">화면을 눌러 시작</p>}
          <p className="intro-sub">섀시 가상 실습장</p>
        </>
      )}
      {stage === 'flash' && <div className="intro-flash" />}
      {stage !== 'title' && <span className="intro-skip">눌러서 건너뛰기</span>}
    </main>
  )
}
