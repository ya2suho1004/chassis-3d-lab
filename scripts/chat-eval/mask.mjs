// 저장·외부 전송 전 개인정보 형식 가림 — 전화번호·이메일·주민등록번호·학년반번호 형식. 이름은 형식이 없어 가리지 못한다(교사 열람 후 수동 처리).
const PATTERNS = [
  ['rrn', /\b\d{6}[-\s]?[1-4]\d{6}\b/g],
  ['phone', /(?:\+82[-\s.]?1[016789]|\b01[016789])[-\s.]?\d{3,4}[-\s.]?\d{4}\b/g],
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ['classroom', /[1-3]\s?학년\s?\d{1,2}\s?반(?:\s?\d{1,2}\s?번)?/g],
]
export function maskPersonalInfo(text) {
  const masked = []
  let out = text
  for (const [kind, re] of PATTERNS) {
    out = out.replace(re, () => { masked.push(kind); return '[가림]' })
  }
  return { text: out, masked }
}
