// src/screens/WorkLog.tsx
// 결과 화면 맨 위 '정비 일지'(설계 2026-11-06 §4): 손님 사연 → 측정·계산·판정(원래 색) → 의뢰 완료 도장(검사 통과일 때만).
// 아래의 기존 요약·최초/최종 표·상세 기록은 그대로 둔다.
// 통과 연출(설계 2026-11-12 §4.6): 도장이 내려앉으며 잉크 고리가 퍼지고 종이 조각 14개가 날린다. 소리를 켠 채 넘어왔으면 도장 소리와 축하음이 난다.
import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { TaskRun } from '../domain/taskEngine'
import { summarizeResponses } from '../domain/grading'
import { requestCopy } from '../app/requests'
import { workLogGroups } from '../app/workLog'
import { prefersReducedMotion, resultReaction } from '../app/reactions'
import type { LabSound } from '../scene/sound'

/** 종이 조각 수 */
const CONFETTI = 14

/** k번째 종이 조각: 자리·늦춤·길이·옆으로 흐르는 폭을 조각마다 다르게(늦춤 + 길이는 1.5초 이하). 짝수는 네모, 홀수는 동그라미 */
function confettiStyle(k: number): CSSProperties {
  const style: CSSProperties & { '--dx': string } = { left: `${3 + k * 7}%`, animationDelay: `${(k % 5) * 0.05}s`, animationDuration: `${1 + (k % 3) * 0.15}s`, '--dx': `${((k * 37) % 41) - 20}px` }
  return style
}

export function WorkLog({ run, passed, nickname, sound }: {
  run: TaskRun
  passed: boolean
  nickname?: string
  /** 소리 엔진(실습 화면에서 켠 채 넘어왔을 때만 소리가 난다). 없으면 연출만 */
  sound?: Pick<LabSound, 'enabled' | 'play'>
}) {
  const copy = requestCopy(run.task.taskId)
  const groups = workLogGroups(summarizeResponses(run.responses))
  // 결과 화면에는 소리 버튼이 없어서 켬 상태가 이 화면에서는 바뀌지 않는다. 그래서 처음 그릴 때의 값을 한 번 읽어 쓴다(설계 2026-11-12 §4.6)
  const reaction = useMemo(() => resultReaction(passed, { reducedMotion: prefersReducedMotion(), sound: !!sound?.enabled }), [passed, sound])
  const fx = reaction?.effects ?? []
  // 도장 소리와 축하음: 이 화면이 뜰 때 한 번만 낸다(통과가 아니면 아무 소리도 없다)
  const played = useRef(false)
  useEffect(() => {
    if (played.current || !reaction || !sound) return
    played.current = true
    for (const c of reaction.cues) sound.play(c.name, c.delay)
  }, [reaction, sound])
  return (
    <section className={`card worklog ${fx.includes('stamp') ? 'stamped' : ''}`} aria-label="정비 일지">
      <div className="wl-head"><span className="wl-tag">정비 일지</span><b>“{copy.complaint}”</b>{nickname && <span className="wl-who">정비: {nickname}</span>}</div>
      <div className="wl-flow">
        {groups.map((g, i) => (
          <div key={g.title} className="wl-cell">
            <div className="wl-step"><small>{g.title}</small>{g.lines.map((l) => <b key={l}>{l}</b>)}</div>
            {i < groups.length - 1 && <span className="wl-arrow" aria-hidden>→</span>}
          </div>
        ))}
      </div>
      {fx.includes('stamp') && <span className={`wl-stamp ${fx.includes('confetti') ? 'anim' : ''}`}>의뢰 완료</span>}
      {fx.includes('confetti') && <div className="wl-confetti" aria-hidden>{Array.from({ length: CONFETTI }, (_, k) => <i key={k} className={k % 2 ? 'dot' : ''} style={confettiStyle(k)} />)}</div>}
      {passed && <p className="wl-closing">교관: “{copy.closing}”</p>}
    </section>
  )
}
