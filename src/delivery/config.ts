// 전송 주소 설정 — 빌드 시 고정(VITE_SUBMIT_ENDPOINT). 학생·교사 화면에서 바꾸지 않는다(설계 15 §3).
// 개발: .env.development → /__fake-submit (vite dev 가짜 수신점). 운영: .env.production 에 시험 배포 /exec URL.
export function getSubmitEndpoint(): string | null {
  const v = (import.meta.env.VITE_SUBMIT_ENDPOINT as string | undefined)?.trim()
  return v ? v : null
}
export const SUBMIT_IS_FAKE = (import.meta.env.VITE_SUBMIT_ENDPOINT as string | undefined)?.startsWith('/__fake-submit') ?? false
