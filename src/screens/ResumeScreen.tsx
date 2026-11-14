import { kstDateTime } from '../app/resultLabels'
import { LESSON_SHORT } from '../app/lesson'
import type { Draft } from '../records/repository'

/** todayLine: 이 기기의 교사 설정이 초안과 다를 때만 오는 '오늘 과제(선생님이 정함) …' 줄(app/todayTask.ts). linkFailed: 앱이 열릴 때 수업 주소를 읽지 못함.
 *  어느 버튼을 누르라고 권하지 않고 사실만 보인다(설계 2026-11-14-student-number-and-class-link §7) */
export function ResumeScreen({ draft, keepDraft = false, todayLine = null, linkFailed = false, onResume, onDiscard }: { draft: Draft; keepDraft?: boolean; todayLine?: string | null; linkFailed?: boolean; onResume: () => void; onDiscard: () => void }) {
  const s = draft.snapshot
  return (
    <main className="screen start wa">
      <h1>끝내지 않은 수행이 있습니다</h1>
      {linkFailed && <p className="error" role="alert">수업 주소를 읽지 못했어요. 선생님께 알려 주세요.</p>}
      <section className="card">
        <p>코드 <b>{draft.session.anonymousStudentCode}</b> · {s.task.title} · {LESSON_SHORT[draft.session.usagePhase]} · {s.difficultyMode === 'guided' ? '안내 있음' : '안내 없음'}</p>
        {todayLine && <p className="resume-today">{todayLine}</p>}
        <p>완료한 단계 {s.completedSteps.length} / {s.task.steps.length} · 마지막 저장 {kstDateTime(draft.savedAt)}</p>
        <p className="small">같은 수행 번호(recordId {draft.recordId.slice(0, 8)}…)로 이어 갑니다. 새로고침·숨김 시간은 학습시간에 넣지 않으며, 장비는 안전한 정지 상태에서 다시 시작합니다. 본인 수행이 아니면 ‘새 수행’을 고르세요.</p>
      </section>
      <div className="row">
        <button className="primary" onClick={onResume}>이어서 하기</button>
        <button onClick={onDiscard}>{keepDraft ? '새 수행 시작 (이 초안은 그대로 둠)' : '새 수행 시작 (이 초안 버리기)'}</button>
      </div>
    </main>
  )
}
