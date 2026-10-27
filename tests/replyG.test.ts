// Codex 회신 G(2026-10-27): 윤초 내부 종료/시작의 경과시간(P2), 긴 소수부 원문 비교(P3)
import { describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import { loadGs, fakeUtilities } from './helpers/gs'
import { fakeSheetServices } from './helpers/gsServices'

const PROPS = { SHEET_ID: 'SHEET-TEST', TAB_NAME: 'canonical', ACCEPT_UNTIL: '2027-12-31T00:00:00Z', MAX_NEW_ROWS: '50', LOCK_WAIT_MS: '10000' }
const FILES = ['Jcs.gs', 'JsonStrict.gs', 'Validate.gs', 'Schemas.gs', 'DemoSnapshots.gs', 'Code.gs']
function server() {
  const svc = fakeSheetServices({ props: PROPS })
  const gs = loadGs(FILES, { ...svc, Utilities: { ...fakeUtilities, _n: 0 } })
  const post = (body: string) => JSON.parse(gs.doPost({ postData: { contents: body, type: 'text/plain;charset=UTF-8', length: body.length } }).text)
  return { gs, svc, post }
}
const reqOf = (p: unknown) => JSON.stringify({ protocolVersion: '1', payload: p })
const P = demo.payload
let k = 0
const mk = (started: string, completed: string, duration = 0) => { const p: any = JSON.parse(JSON.stringify(P)); p.startedAt = started; p.completedAt = completed; p.durationSeconds = duration; p.recordId = `00000000-0000-4000-8000-0000000000${String(80 + ++k).padStart(2, '0')}`; return p }

describe('P2 경과시간: 끝점이 윤초 안이면 그 윤초는 정확히 세고, 모르는 자정만 1초 여유', () => {
  test('Codex 표본: 59.200→60.800(1.6초) duration 2 수락, 58.200→60.800(2.6초) duration 3 수락, +09:00 표기도 동일', () => {
    const { post, gs } = server()
    expect(gs.elapsedAllowanceSeconds_('2016-12-31T23:59:59.200Z', '2016-12-31T23:59:60.800Z')).toBeCloseTo(1.6, 6)
    expect(post(reqOf(mk('2016-12-31T23:59:59.200Z', '2016-12-31T23:59:60.800Z', 2))).ok).toBe(true)
    expect(post(reqOf(mk('2016-12-31T23:59:58.200Z', '2016-12-31T23:59:60.800Z', 3))).ok).toBe(true)
    expect(post(reqOf(mk('2017-01-01T08:59:59.200+09:00', '2017-01-01T08:59:60.800+09:00', 2))).ok).toBe(true)
  })
  test('시작이 윤초 안(60.100→00:00:00.800, 실제 1.7초): 상한 1.7, duration 2 수락·3 거절; 같은 윤초 안 60.1→60.6: 0.5, duration 1 수락·2 거절', () => {
    const { post, gs } = server()
    expect(gs.elapsedAllowanceSeconds_('2016-12-31T23:59:60.100Z', '2017-01-01T00:00:00.800Z')).toBeCloseTo(1.7, 6)
    expect(post(reqOf(mk('2016-12-31T23:59:60.100Z', '2017-01-01T00:00:00.800Z', 2))).ok).toBe(true)
    expect(post(reqOf(mk('2016-12-31T23:59:60.100Z', '2017-01-01T00:00:00.800Z', 3)))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(gs.elapsedAllowanceSeconds_('2016-12-31T23:59:60.100Z', '2016-12-31T23:59:60.600Z')).toBeCloseTo(0.5, 6)
    expect(post(reqOf(mk('2016-12-31T23:59:60.100Z', '2016-12-31T23:59:60.600Z', 1))).ok).toBe(true)
    expect(post(reqOf(mk('2016-12-31T23:59:60.100Z', '2016-12-31T23:59:60.600Z', 2)))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
  test('끝점이 윤초가 아닌 자정 횡단은 종전대로 1초 여유, 2일 기록은 2초', () => {
    const { gs } = server()
    expect(gs.elapsedAllowanceSeconds_('2016-12-31T23:59:59.200Z', '2017-01-01T00:00:00.800Z')).toBeCloseTo(2.6, 6)
    expect(gs.elapsedAllowanceSeconds_('2000-01-01T12:00:00.200Z', '2000-01-03T12:00:00.800Z')).toBeCloseTo(172802.6, 3)
  })
})

describe('P3 순서 비교의 소수부는 원문 숫자열로 비교한다(Number 정밀도 무관)', () => {
  test('.9000000000000004 > .9000000000000003, 18자리 역순 거절, .1 == .100', () => {
    const { gs, post } = server()
    expect(gs.compareDateTime_('2016-12-31T23:59:60.9000000000000004Z', '2016-12-31T23:59:60.9000000000000003Z')).toBe(1)
    expect(gs.compareDateTime_('2000-01-01T00:00:00.123456789012345679Z', '2000-01-01T00:00:00.123456789012345678Z')).toBe(1)
    expect(gs.compareDateTime_('2000-01-01T00:00:00.1Z', '2000-01-01T00:00:00.100Z')).toBe(0)
    expect(post(reqOf(mk('2000-01-01T00:00:00.123456789012345679Z', '2000-01-01T00:00:00.123456789012345678Z')))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
})
