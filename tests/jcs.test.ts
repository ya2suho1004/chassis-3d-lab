import { describe, expect, test } from 'vitest'
import { canonicalize, sha256Hex, payloadHash } from '../src/delivery/jcs'

describe('RFC 8785 JCS 정규화', () => {
  test('RFC 8785 §3.2.3 예시: 숫자·문자열·리터럴', () => {
    const input = JSON.parse('{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/","literals":[null,true,false]}')
    expect(canonicalize(input)).toBe('{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}')
  })
  test('키는 UTF-16 코드 단위 순으로 정렬한다(이모지 < 히브리 문자)', () => {
    const input = { '€': 'Euro Sign', '\r': 'Carriage Return', 'ø': 'Latin Small Letter O With Stroke', 'דּ': 'Hebrew Letter Dalet With Dagesh', '1': 'One', '😀': 'Emoji: Grinning Face', '\u0080': 'Control', 'ö': 'Latin Small Letter O With Diaeresis' }
    expect(canonicalize(input)).toBe('{"\\r":"Carriage Return","1":"One","\u0080":"Control","ö":"Latin Small Letter O With Diaeresis","ø":"Latin Small Letter O With Stroke","€":"Euro Sign","😀":"Emoji: Grinning Face","\ufb33":"Hebrew Letter Dalet With Dagesh"}')
  })
  test('키 순서·공백만 다른 두 문서는 같은 정규형이 된다', () => {
    const a = JSON.parse('{"b": [1, 2], "a": {"y": null, "x": "한글"}}')
    const b = JSON.parse('{"a":{"x":"한글","y":null},"b":[1,2]}')
    expect(canonicalize(a)).toBe(canonicalize(b))
  })
  test('한글 NFC/NFD는 합치지 않는다(다른 문자열은 다른 정규형)', () => {
    expect(canonicalize({ s: '한'.normalize('NFC') })).not.toBe(canonicalize({ s: '한'.normalize('NFD') }))
  })
  test('비유한 수·잘못된 Unicode(짝 없는 서로게이트)·undefined는 거절한다', () => {
    expect(() => canonicalize({ n: Number.NaN })).toThrow(/NON_FINITE/)
    expect(() => canonicalize({ n: Number.POSITIVE_INFINITY })).toThrow(/NON_FINITE/)
    expect(() => canonicalize({ s: '\ud800' })).toThrow(/INVALID_UNICODE/)
    expect(() => canonicalize({ u: undefined })).toThrow(/UNSUPPORTED_VALUE/)
  })
  test('SHA-256은 UTF-8 바이트 기준 소문자 16진수 64자리', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const h = await payloadHash({ b: 1, a: '한글' })
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).toBe(await sha256Hex('{"a":"한글","b":1}'))
  })
})
