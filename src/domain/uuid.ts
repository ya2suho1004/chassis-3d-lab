// UUID v4 만들기 — crypto.randomUUID가 없는 구형 태블릿 브라우저(iOS 15.4 이전 Safari, Chrome 92 이전)에서도 동작하게 한다.
// 대체 경로도 crypto.getRandomValues(보안 난수)를 쓰며 Math.random은 쓰지 않는다. 형식은 RFC 4122 v4(수신점 UUID 검사와 같음).
type CryptoLike = { randomUUID?: () => string; getRandomValues: <T extends Uint8Array>(a: T) => T }

export function newUuid(c: CryptoLike = globalThis.crypto as unknown as CryptoLike): string {
  if (typeof c.randomUUID === 'function') return c.randomUUID()
  const b = c.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40 // 버전 4
  b[8] = (b[8]! & 0x3f) | 0x80 // 변형 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
