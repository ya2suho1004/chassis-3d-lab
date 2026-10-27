// Codex 회신 H(2026-10-27): 자정 직전 7자리 소수부가 epoch 덧셈 반올림으로 자정 횟수를 지우던 P2
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
const mk = (started: string, completed: string, duration = 0) => { const p: any = JSON.parse(JSON.stringify(P)); p.startedAt = started; p.completedAt = completed; p.durationSeconds = duration; p.recordId = `00000000-0000-4000-8000-0000000000${String(90 + ++k).padStart(2, '0')}`; return p }

describe('날짜·윤초 분기는 정수 분·초로만 판정한다(소수부 반올림 무관)', () => {
  test('59.9999999 → 00:00:00.800: 상한 1.8000001(자정 1회 포함), duration 2 수락; 00:00:00.600도 1.6000001', () => {
    const { gs, post } = server()
    expect(gs.elapsedAllowanceSeconds_('2016-12-31T23:59:59.9999999Z', '2017-01-01T00:00:00.800Z')).toBeCloseTo(1.8000001, 6)
    expect(gs.elapsedAllowanceSeconds_('2016-12-31T23:59:59.9999999Z', '2017-01-01T00:00:00.600Z')).toBeCloseTo(1.6000001, 6)
    expect(post(reqOf(mk('2016-12-31T23:59:59.9999999Z', '2017-01-01T00:00:00.800Z', 2))).ok).toBe(true)
    expect(post(reqOf(mk('2016-12-31T23:59:59.9999999Z', '2017-01-01T00:00:00.600Z', 2))).ok).toBe(true)
    expect(post(reqOf(mk('2016-12-31T23:59:59.9999999Z', '2017-01-01T00:00:00.800Z', 3)))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
  test('20자리 소수부도 자정 분기를 바꾸지 않고, 윤초 끝점 표본은 그대로(1.6·1.7·0.5·172802.7)', () => {
    const { gs } = server()
    expect(gs.elapsedAllowanceSeconds_('2016-12-31T23:59:59.99999999999999999999Z', '2017-01-01T00:00:00.000Z')).toBeCloseTo(1.0, 6)
    expect(gs.elapsedAllowanceSeconds_('2016-12-31T23:59:59.200Z', '2016-12-31T23:59:60.800Z')).toBeCloseTo(1.6, 6)
    expect(gs.elapsedAllowanceSeconds_('2016-12-31T23:59:60.100Z', '2017-01-01T00:00:00.800Z')).toBeCloseTo(1.7, 6)
    expect(gs.elapsedAllowanceSeconds_('2016-12-31T23:59:60.100Z', '2016-12-31T23:59:60.600Z')).toBeCloseTo(0.5, 6)
    expect(gs.elapsedAllowanceSeconds_('2016-12-31T23:59:60.100Z', '2017-01-02T23:59:60.800Z')).toBeCloseTo(172802.7, 3)
  })
})
