// RFC 8785 JCS(JSON Canonicalization Scheme) 정규화 + SHA-256 — 설계 05 §7·15 §4
// 규칙: 객체 키는 UTF-16 코드 단위 순 정렬, 공백 없음, 숫자는 ES Number→String, 문자열은 JSON 표준 이스케이프(소문자 \u00xx).
// 거절: 비유한 수(NaN·Infinity), 짝 없는 서로게이트, undefined·함수·symbol·bigint.
// 하지 않는 것: NFC/NFD 정규화, trim, 대소문자 교정, 숫자 재절사, 배열 재정렬.
// 서버(Apps Script) 쪽 Jcs.gs 와 같은 결과를 내야 한다(tests/appsScript.test.ts 에서 대조).

export class JcsError extends Error {
  constructor(public readonly code: 'NON_FINITE_NUMBER' | 'INVALID_UNICODE' | 'UNSUPPORTED_VALUE', detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
  }
}

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/

function str(s: string): string {
  if (LONE_SURROGATE.test(s)) throw new JcsError('INVALID_UNICODE')
  return JSON.stringify(s)
}

export function canonicalize(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean': return value ? 'true' : 'false'
    case 'number':
      if (!Number.isFinite(value)) throw new JcsError('NON_FINITE_NUMBER')
      return JSON.stringify(value)
    case 'string': return str(value)
    case 'object': {
      if (Array.isArray(value)) return '[' + value.map((v) => canonicalize(v)).join(',') + ']'
      const o = value as Record<string, unknown>
      const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort() // 기본 sort = UTF-16 코드 단위 비교
      for (const k of Object.keys(o)) if (o[k] === undefined) throw new JcsError('UNSUPPORTED_VALUE', `undefined at key ${k}`)
      return '{' + keys.map((k) => str(k) + ':' + canonicalize(o[k])).join(',') + '}'
    }
    default: throw new JcsError('UNSUPPORTED_VALUE', typeof value)
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 검증된 payload만 넣는다. envelope·receipt·전송 시각은 해시에 포함하지 않는다. */
export async function payloadHash(payload: unknown): Promise<string> {
  return sha256Hex(canonicalize(payload))
}

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length
}
