// 앱 판 번호(H1, 2026-11-08 Codex 회의): 기록의 clientAppVersion에 빌드한 커밋을 넣는다.
// 사용성 평가판·현장 적용판을 기록만으로 구분하려는 것. 기록 형식은 그대로(값만 정확히), 계약 상한 64자.
// 커밋은 vite.config.ts가 빌드 때 __APP_COMMIT__로 넣는다(Vercel 커밋 변수 → git → unknown).
declare const __APP_COMMIT__: string | undefined

// 0.3.1-demo(2026-11-10): 계산 답 채점 규칙 가(학생 값을 다시 절사하지 않음)부터. judgeEngineVersion은 0.1.0 그대로라 규칙은 이 판으로 가른다
// 0.3.2-demo(2026-11-11): 계산·판정 장면 전자계산기와 계산기 기록(기록 판 1.3.0)부터. 계산 오답이 달라질 수 있어 이 판으로 가른다
// 0.3.3-demo(2026-11-11): 빛과 재질 다듬기(조명·그림자·바닥·색 보정)부터. 채점·기록은 그대로이고 겉모습만 달라 이 판으로 가른다
export const APP_BASE_VERSION = '0.3.3-demo'
const MAX = 64

/** 커밋을 모르면 숨기지 않고 'unknown'으로 드러낸다 */
export function appVersionString(base: string, commit: string | null | undefined): string {
  return `${base}+${commit && commit.trim() ? commit.trim() : 'unknown'}`.slice(0, MAX)
}

export const APP_COMMIT: string = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : ''
