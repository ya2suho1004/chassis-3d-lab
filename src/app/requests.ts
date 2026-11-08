// src/app/requests.ts
// 과제별 손님 의뢰·작업지시 문구의 단일 원본(설계 docs/superpowers/specs/2026-11-06-cozy-workshop-design.md §10-1).
// 퀘스트 사연·정비 일지·교관 첫 대사·기본 화면 작업지시가 모두 여기서 문구를 가져온다(2026-11-07 한 곳으로 모음).
// 판정(양호/불량)을 암시하지 않는다. 문구를 바꾸면 MOON 검토 + tests/copyGolden.test.ts 함께 고침.
export interface RequestCopy {
  /** 손님 사연(퀘스트·정비 일지 머리) — 짧은 말투 */
  complaint: string
  /** 검사 통과 뒤 정비 일지의 교관 한마디(고정 — 시간·힌트·오답과 무관) */
  closing: string
  /** 교관 첫 대사의 오늘 할 일(인사 뒤에 붙음) */
  npcToday: string
  /** 교관 첫 대사의 손님 호소 + 할 일 */
  npcAsk: string
  /** 기본 화면(패널)의 작업지시 한 줄 */
  workOrder: string
}

type CopyTaskId = 'min-turning-radius' | 'braking-force'

const COPY: Record<CopyTaskId, RequestCopy> = {
  'min-turning-radius': {
    complaint: '조향 장치 점검 받으러 왔어요',
    closing: '앞바퀴 각도를 직접 읽고 판단까지 마쳤구나. 의뢰 끝!',
    npcToday: '오늘은 회전반경 측정판으로 최소회전반경을 측정해 볼 거야.',
    npcAsk: '손님이 조향 장치 점검을 맡겼어. 앞바퀴 최대 조향각을 읽어 최소회전반경을 산출하고, 차량 상태를 판정해 줘.',
    workOrder: '손님 차량 입고, 조향 장치 점검 의뢰. 앞바퀴 최대 조향각을 읽어 최소회전반경을 산출하고 차량 상태를 판정하세요.',
  },
  'braking-force': {
    complaint: '브레이크 점검 받으러 왔어요',
    closing: '제동력을 직접 재고 판단까지 마쳤구나. 의뢰 끝!',
    npcToday: '오늘은 제동력 시험기로 뒤축 제동력을 측정해 볼 거야.',
    npcAsk: '손님이 브레이크 점검을 맡겼어. 좌·우 제동력을 재서 편차와 합을 계산하고, 차량 상태를 판정해 줘.',
    workOrder: '손님 차량 입고, 브레이크 점검 의뢰. 뒤축 제동력을 측정해 편차와 합을 계산하고 차량 상태를 판정하세요.',
  },
}

/** 과제 ID별 문구. 최소회전반경이 아니면(없음·모르는 ID 포함) 제동력 문구 */
export function requestCopy(taskId?: string): RequestCopy {
  return taskId === 'min-turning-radius' ? COPY['min-turning-radius'] : COPY['braking-force']
}

/** 검사 통과 끄덕임 때 교관 한마디(과제·모드 무관, 통과일 때만 뜸). 문구를 한 곳에 모은다(독립 검토 6번) */
export const NOD_LINE = '좋아, 검사 통과야. 수고했어!'
