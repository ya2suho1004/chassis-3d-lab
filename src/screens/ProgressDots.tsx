// src/screens/ProgressDots.tsx
// 진행 점 줄(설계 2026-11-12 §4.3): 의뢰 패널에서 끝난 단계 수를 점으로 보인다.
// 점은 "몇 개 끝났는지"만 나타낸다. 끝난 수만큼 왼쪽부터 채우고, 몇 번째 점이 어느 단계인지는 나타내지 않는다 —
// 지금까지의 글자("3/12 단계 완료")가 주던 것과 같은 정보다. 그래서 안내가 있든 없든 똑같이 보인다.

/** pop: 방금 끝난 단계가 있어 새로 채워진 점을 튀게 할지(켜고 끄는 것은 부르는 쪽의 연출 상태가 맡는다) */
export function ProgressDots({ done, total, pop }: { done: number; total: number; pop: boolean }) {
  const n = Math.max(0, Math.min(done, total))
  return (
    <p className="g-progress">
      <span className="g-dots" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <i key={i} className={i < n ? (pop && i === n - 1 ? 'on new' : 'on') : ''} />)}
      </span>
      <span className="g-count">{n}/{total}<span className="sr-only"> 단계 완료</span></span>
    </p>
  )
}
