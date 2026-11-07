// src/screens/WorkLog.tsx
// 결과 화면 맨 위 '정비 일지'(설계 2026-11-06 §4): 손님 사연 → 측정·계산·판정(원래 색) → 의뢰 완료 도장(검사 통과일 때만).
// 아래의 기존 요약·최초/최종 표·상세 기록은 그대로 둔다.
import { useMemo } from 'react'
import type { TaskRun } from '../domain/taskEngine'
import { summarizeResponses } from '../domain/grading'
import { requestCopy } from '../app/requests'
import { workLogGroups } from '../app/workLog'
import { prefersReducedMotion, reactionsFor } from '../app/reactions'

export function WorkLog({ run, passed, nickname }: { run: TaskRun; passed: boolean; nickname?: string }) {
  const copy = requestCopy(run.task.taskId)
  const groups = workLogGroups(summarizeResponses(run.responses))
  const fx = useMemo(() => (passed ? reactionsFor('inspectionPassed', { mode: run.difficultyMode, reducedMotion: prefersReducedMotion(), sound: false }) : []), [passed, run.difficultyMode])
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
      {fx.includes('confetti') && <div className="wl-confetti" aria-hidden>{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ left: `${8 + k * 11}%`, animationDelay: `${(k % 4) * 0.08}s` }} />)}</div>}
      {passed && <p className="wl-closing">교관: “{copy.closing}”</p>}
    </section>
  )
}
