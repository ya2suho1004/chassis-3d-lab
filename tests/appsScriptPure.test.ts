import { describe, expect, test } from 'vitest'
import Ajv from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import demo from '../docs/design/examples/submission.demo-request.json'
import recordSchema from '../docs/design/contracts/record.schema.json'
import { canonicalize, payloadHash } from '../src/delivery/jcs'
import { loadGs, fakeUtilities } from './helpers/gs'

const gs = loadGs(['Jcs.gs', 'JsonStrict.gs', 'Validate.gs', 'Schemas.gs'], { Utilities: fakeUtilities })
const payload = demo.payload

describe('Jcs.gs — 브라우저 jcs.ts와 같은 정규형·해시(D08 대조)', () => {
  const vectors: unknown[] = [
    JSON.parse('{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/","literals":[null,true,false]}'),
    { '\u20ac': 'a', '\r': 'b', '\u00f8': 'c', '\ufb33': 'd', '1': 'e', '\ud83d\ude00': 'f', '\u0080': 'g', '\u00f6': 'h' },
    payload,
    { s: '한'.normalize('NFD'), t: '한'.normalize('NFC'), arr: [3, 1, 2], n: null, e: '' },
  ]
  test('정규형 문자열이 같다', () => { for (const v of vectors) expect(gs.jcsCanonicalize(v)).toBe(canonicalize(v)) })
  test('SHA-256 소문자 16진수가 같다', async () => { for (const v of vectors) expect(gs.jcsPayloadHash(v)).toBe(await payloadHash(v)) })
  test('비유한 수·짝 없는 서로게이트는 서버도 거절한다', () => {
    expect(() => gs.jcsCanonicalize({ n: Number.NaN })).toThrow(/NON_FINITE/)
    expect(() => gs.jcsCanonicalize({ s: '\ud800' })).toThrow(/INVALID_UNICODE/)
  })
})

describe('JsonStrict.gs — 중복 키·다중 문서·잘못된 JSON 거절', () => {
  test('정상 문서는 JSON.parse와 같은 값', () => {
    const txt = JSON.stringify(demo)
    expect(gs.parseJsonStrict(txt)).toEqual(JSON.parse(txt))
  })
  test('중복 객체 키(중첩 포함)는 DUPLICATE_KEY', () => {
    expect(() => gs.parseJsonStrict('{"a":1,"a":2}')).toThrow(/DUPLICATE_KEY/)
    expect(() => gs.parseJsonStrict('{"a":{"b":1,"b":2}}')).toThrow(/DUPLICATE_KEY/)
  })
  test('빈 본문·다중 문서·후행 쓰레기·잘못된 문법은 INVALID_JSON', () => {
    for (const t of ['', '   ', '{} {}', '{"a":1} x', '{a:1}', '[1,]', '{"a":1,}', 'nul']) expect(() => gs.parseJsonStrict(t), JSON.stringify(t)).toThrow(/INVALID_JSON/)
  })
  test('짝 없는 서로게이트 이스케이프·제어 문자 원문은 거절', () => {
    expect(() => gs.parseJsonStrict('{"s":"\\ud800"}')).toThrow(/INVALID_UNICODE|INVALID_JSON/)
    expect(() => gs.parseJsonStrict('{"s":"a\u0001b"}')).toThrow(/INVALID_JSON/)
  })
  test('숫자·문자열 이스케이프·유니코드는 보존한다', () => {
    expect(gs.parseJsonStrict('{"n":[1e30,-0.5,0,12],"s":"\\u20ac\\n한글\\ud83d\\ude00"}')).toEqual({ n: [1e30, -0.5, 0, 12], s: '€\n한글😀' })
  })
})

describe('Validate.gs — record 1.1.0 미니 스키마 검증기 (ajv와 판정 일치)', () => {
  const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv)
  const validate = ajv.compile(recordSchema as object)
  const mutations: Array<[string, (p: any) => void]> = [
    ['정상', () => {}],
    ['추가 필드', (p) => { p.extra = 1 }],
    ['필수 누락', (p) => { delete p.usagePhase }],
    ['잘못된 UUID', (p) => { p.recordId = 'not-a-uuid' }],
    ['잘못된 enum', (p) => { p.difficultyMode = 'hard' }],
    ['잘못된 날짜', (p) => { p.startedAt = '2026-10-26' }],
    ['음수 정수', (p) => { p.errorCount = -1 }],
    ['타입 틀림', (p) => { p.hintCount = '3' }],
    ['스키마 버전 틀림', (p) => { p.schemaVersion = '1.0.0' }],
    ['중첩 객체 추가 필드', (p) => { p.configurationApproval.extra = true }],
    ['배열 항목 틀림', (p) => { p.experiencedDisplayModes = ['threeD', 'vr'] }],
    ['이벤트 항목 필드 누락', (p) => { if (p.stepEvents.length) delete p.stepEvents[0].type; else p.stepEvents = [{}] }],
    ['anyOf null 허용', (p) => { p.retryOfRecordId = null }],
  ]
  for (const [name, mut] of mutations) {
    test(`${name}: ajv 판정과 같다`, () => {
      const p = JSON.parse(JSON.stringify(payload)); mut(p)
      const expected = validate(p)
      const got = gs.validateAgainst(gs.RECORD_SCHEMAS['1.1.0'], p)
      expect(got.ok, name + ' ' + JSON.stringify(got.errors?.slice(0, 2))).toBe(expected)
    })
  }
  test('request envelope: protocolVersion "1"과 payload만 허용', () => {
    expect(gs.validateRequestEnvelope({ protocolVersion: '1', payload: payload }).ok).toBe(true)
    expect(gs.validateRequestEnvelope({ protocolVersion: '2', payload: payload }).ok).toBe(false)
    expect(gs.validateRequestEnvelope({ protocolVersion: '1', payload: payload, deliveryEnvelope: {} }).ok).toBe(false)
    expect(gs.validateRequestEnvelope({ protocolVersion: '1', payload: JSON.stringify(payload) }).ok).toBe(false)
  })
})
