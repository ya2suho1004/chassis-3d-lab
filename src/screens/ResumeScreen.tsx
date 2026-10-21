import type { Draft } from '../records/repository'

export function ResumeScreen({ draft, onResume, onDiscard }: { draft: Draft; onResume: () => void; onDiscard: () => void }) {
  const s = draft.snapshot
  return (
    <main className="screen start">
      <h1>끝내지 않은 수행이 있습니다</h1>
      <section className="card">
        <p>코드 <b>{draft.session.anonymousStudentCode}</b> · {s.task.title} · {s.difficultyMode === 'guided' ? '안내 있음' : '안내 없음'}</p>
        <p>완료한 단계 {s.completedSteps.length} / {s.task.steps.length} · 마지막 저장 {draft.savedAt}</p>
        <p className="small">같은 수행 번호(recordId {draft.recordId.slice(0, 8)}…)로 이어 갑니다. 새로고침·숨김 시간은 학습시간에 넣지 않으며, 장비는 안전한 정지 상태에서 다시 시작합니다. 본인 수행이 아니면 ‘새 수행’을 고르세요.</p>
      </section>
      <div className="row">
        <button className="primary" onClick={onResume}>이어서 하기</button>
        <button onClick={onDiscard}>새 수행 시작 (이 초안 버리기)</button>
      </div>
    </main>
  )
}
