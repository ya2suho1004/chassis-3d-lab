// 앱 판 번호(H1, 2026-11-08 Codex 회의): 기록의 clientAppVersion에 빌드한 커밋을 넣는다.
// 사용성 평가판·현장 적용판을 기록만으로 구분하려는 것. 기록 형식은 그대로(값만 정확히), 계약 상한 64자.
// 커밋은 vite.config.ts가 빌드 때 __APP_COMMIT__로 넣는다(Vercel 커밋 변수 → git → unknown).
declare const __APP_COMMIT__: string | undefined

export const APP_BASE_VERSION = '0.3.0-demo'
const MAX = 64

/** 커밋을 모르면 숨기지 않고 'unknown'으로 드러낸다 */
export function appVersionString(base: string, commit: string | null | undefined): string {
  return `${base}+${commit && commit.trim() ? commit.trim() : 'unknown'}`.slice(0, MAX)
}

export const APP_COMMIT: string = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : ''
