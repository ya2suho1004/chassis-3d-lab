// Codex 회신 F(2026-10-27) 잔여 C-P2-3: 순서 비교 표현과 경과시간 계산의 분리
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
const mk = (started: string, completed: string, duration = 0) => { const p: any = JSON.parse(JSON.stringify(P)); p.startedAt = started; p.completedAt = completed; p.durationSeconds = duration; p.recordId = `00000000-0000-4000-8000-0000000000${String(70 + ++k).padStart(2, '0')}`; return p }

describe('순서 비교는 원문 소수부를 그대로 쓴다(임의 자릿수)', () => {
  test('59.9999 → 60.000 순방향 수락, 역순 거절; 60.0001 → 60.0002 수락', () => {
    const { post } = server()
    expect(post(reqOf(mk('2016-12-31T23:59:59.9999Z', '2016-12-31T23:59:60.000Z'))).ok).toBe(true)
    expect(post(reqOf(mk('2016-12-31T23:59:60.000Z', '2016-12-31T23:59:59.9999Z')))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(post(reqOf(mk('2016-12-31T23:59:60.0001Z', '2016-12-31T23:59:60.0002Z'))).ok).toBe(true)
    expect(post(reqOf(mk('2016-12-31T23:59:60.99999Z', '2017-01-01T00:00:00.00001Z'))).ok).toBe(true)
    expect(post(reqOf(mk('2017-01-01T00:00:00.00001Z', '2016-12-31T23:59:60.99999Z')))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
  test('순서 비교 함수: 같은 순간의 다른 표기(오프셋)는 같다', () => {
    const { gs } = server()
    expect(gs.compareDateTime_('2017-01-01T09:00:00+09:00', '2017-01-01T00:00:00Z')).toBe(0)
    expect(gs.compareDateTime_('2016-12-31T23:59:60Z', '2017-01-01T00:00:00Z')).toBeLessThan(0)
    expect(gs.compareDateTime_('2016-12-31T23:59:59.9999Z', '2016-12-31T23:59:60Z')).toBeLessThan(0)
  })
})

describe('경과시간 상한은 윤초가 들어갈 수 있는 UTC 자정 횡단마다 1초를 더 허용한다(비교 키 재사용 금지)', () => {
  test('Codex 표본: 윤초 횡단 2.6초/duration 3 수락, 60.100→00:00:00.800 duration 2 수락, 윤초 없는 2.6/3 수락', () => {
    const { post } = server()
    expect(post(reqOf(mk('2016-12-31T23:59:59.200Z', '2017-01-01T00:00:00.800Z', 3))).ok).toBe(true)
    expect(post(reqOf(mk('2016-12-31T23:59:60.100Z', '2017-01-01T00:00:00.800Z', 2))).ok).toBe(true)
    expect(post(reqOf(mk('2000-01-01T00:00:00.200Z', '2000-01-01T00:00:02.800Z', 3))).ok).toBe(true)
  })
  test('여유를 넘는 활성시간은 여전히 거절: 자정 횡단 없는 2.6초에 duration 5, 자정 횡단 1.6초에 duration 4', () => {
    const { post } = server()
    expect(post(reqOf(mk('2000-01-01T00:00:00.200Z', '2000-01-01T00:00:02.800Z', 5)))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(post(reqOf(mk('2016-12-31T23:59:59.200Z', '2017-01-01T00:00:00.800Z', 4)))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
  test('경과시간 함수: 전체 윤초 횡단은 상한 계산에서 자정 1회로 센다', () => {
    const { gs } = server()
    expect(gs.elapsedAllowanceSeconds_('2016-12-31T23:59:59.200Z', '2017-01-01T00:00:00.800Z')).toBeCloseTo(1.6 + 1, 3)
    expect(gs.elapsedAllowanceSeconds_('2000-01-01T00:00:00.200Z', '2000-01-01T00:00:02.800Z')).toBeCloseTo(2.6, 3)
  })
})
