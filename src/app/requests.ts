// src/app/requests.ts
// 손님 의뢰 문구 단일 원본(설계 docs/superpowers/specs/2026-11-06-cozy-workshop-design.md §10-1).
// 짧은 말투, 판정(양호/불량)을 암시하지 않는다. 문구를 바꾸면 MOON 검토. 패널 작업지시(panelWorkOrder)는 따로 둔다.
export interface RequestCopy {
  /** 손님 사연(퀘스트·정비 일지 머리) */
  complaint: string
  /** 검사 통과 뒤 정비 일지의 교관 한마디(고정 — 시간·힌트·오답과 무관) */
  closing: string
}

const COPY: Record<'min-turning-radius' | 'braking-force', RequestCopy> = {
  'min-turning-radius': { complaint: '좁은 길에서 잘 안 돌아요', closing: '앞바퀴 각도를 직접 읽고 판단까지 마쳤구나. 의뢰 끝!' },
  'braking-force': { complaint: '브레이크를 밟으면 한쪽으로 쏠려요', closing: '제동력을 직접 재고 판단까지 마쳤구나. 의뢰 끝!' },
}

export function requestCopy(taskId: string): RequestCopy {
  return taskId === 'min-turning-radius' ? COPY['min-turning-radius'] : COPY['braking-force']
}
