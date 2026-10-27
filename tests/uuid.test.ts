import { describe, expect, test } from 'vitest'
import { webcrypto } from 'node:crypto'
import { newUuid } from '../src/domain/uuid'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('UUID 만들기(구형 태블릿 대비)', () => {
  test('randomUUID가 있으면 그대로 쓴다', () => {
    expect(newUuid({ randomUUID: () => 'from-native', getRandomValues: (a) => a })).toBe('from-native')
  })

  test('randomUUID가 없는 브라우저에서도 보안 난수로 v4 형식을 만든다', () => {
    const old = { getRandomValues: <T extends Uint8Array>(a: T) => webcrypto.getRandomValues(a) }
    const ids = new Set(Array.from({ length: 200 }, () => newUuid(old)))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(V4)
  })

  test('난수가 모두 0이거나 모두 255여도 버전·변형 자리는 v4 규칙을 지킨다', () => {
    expect(newUuid({ getRandomValues: (a) => a.fill(0) })).toBe('00000000-0000-4000-8000-000000000000')
    expect(newUuid({ getRandomValues: (a) => a.fill(255) })).toMatch(V4)
  })
})
