// 독립 검토(2026-11-09) 1번, MOON A안: 공통 PIN만으로 기기의 학생 원본을 받지 못하게 한다.
// 요약 CSV·연구용 묶음·기록별 목록은 교사 서버 로그인 뒤에만 열린다. 건수는 로그인 없이 보인다.
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import type { RecordPayload } from '../src/domain/record'
import { summarizeDevice } from '../src/records/reconcile'
import type { StoredRecord } from '../src/records/repository'
import type { DeliveryEnvelope } from '../src/records/types'
import { DeviceExports, DeviceSummaryView } from '../src/screens/RecordCheck'
import { loginValid } from '../src/teacher/serverAdmin'

const stored = (code: string, recordId: string): StoredRecord => ({
  recordId,
  frozenAt: '2026-11-09T00:00:00.000Z',
  payload: { ...(demo.payload as unknown as RecordPayload), recordId, anonymousStudentCode: code },
  envelope: { recordId, localSaveStatus: 'saved', uploadStatus: 'pending', receiptId: null, acceptedAt: null, payloadHash: null, attempts: 0, lastErrorCode: null } as unknown as DeliveryEnvelope,
})

describe('교사 로그인 유효 판단', () => {
  const auth = { accessToken: 't', expiresAt: 1000, email: 'e' }
  test('로그인하지 않았거나 만료됐으면 닫힌다', () => {
    expect(loginValid(null, 500)).toBe(false)
    expect(loginValid(auth, 1000)).toBe(false)
    expect(loginValid(auth, 1001)).toBe(false)
  })
  test('만료 전 로그인은 열린다', () => {
    expect(loginValid(auth, 999)).toBe(true)
  })
})

describe('기기 전송 상태', () => {
  const summary = summarizeDevice([stored('D-77', '00000000-0000-4000-8000-000000000077')], [])

  test('목록 표시를 따로 주지 않으면 닫힌 쪽이 기본이다: 건수만 보이고 코드·기록 번호는 보이지 않는다', () => {
    const html = renderToStaticMarkup(createElement(DeviceSummaryView, { summary }))
    expect(html).toMatch(/확정 기록 1건/)
    expect(html).toMatch(/전송 대기 1/)
    expect(html).not.toMatch(/D-77/)
    expect(html).not.toMatch(/00000000/)
  })

  test('교사 로그인 뒤에는 기록별 목록이 보인다', () => {
    const html = renderToStaticMarkup(createElement(DeviceSummaryView, { summary, showList: true }))
    expect(html).toMatch(/D-77/)
  })
})

describe('이 기기 기록 내려받기', () => {
  const handlers = { onCsv: () => {}, onBundle: () => {} }

  test('로그인 전: 내려받기 버튼이 없고, 로그인이 필요하다는 것과 기록이 남아 있다는 것을 말한다', () => {
    const html = renderToStaticMarkup(createElement(DeviceExports, { open: false, hasRecords: true, ...handlers }))
    expect(html).not.toMatch(/<button/)
    expect(html).toMatch(/교사 계정으로 로그인/)
    expect(html).toMatch(/그대로/)
  })

  test('로그인 뒤: 요약 CSV와 연구용 묶음을 받을 수 있다', () => {
    const html = renderToStaticMarkup(createElement(DeviceExports, { open: true, hasRecords: true, ...handlers }))
    expect(html).toMatch(/요약 CSV 내려받기/)
    expect(html).toMatch(/연구용 묶음\(ZIP\) 내려받기/)
  })
})

describe('교사 화면 연결', () => {
  const src = fs.readFileSync('src/screens/TeacherPanel.tsx', 'utf8')

  test('기기 원본 내려받기와 기록별 목록이 같은 로그인 판단을 쓴다', () => {
    expect(src).toMatch(/loginValid\(server\.auth, Date\.now\(\)\)/)
    expect(src).toMatch(/<DeviceExports open=\{deviceOpen\}/)
    expect(src).toMatch(/<DeviceRecordCheck repo=\{repo\} refreshKey=\{sendLog\} showList=\{deviceOpen\} \/>/)
  })

  test('PIN 화면에 내려받기 버튼을 직접 두지 않는다', () => {
    expect(src).not.toMatch(/<button[^>]*downloadCsv/)
    expect(src).not.toMatch(/<button[^>]*downloadBundle/)
  })

  test('버튼이 남아 있어도 누르는 순간 로그인 만료를 다시 확인한다', () => {
    expect(src).toMatch(/const whileLoggedIn = /)
    expect(src).toMatch(/onCsv=\{whileLoggedIn\(downloadCsv\)\}/)
    expect(src).toMatch(/onBundle=\{whileLoggedIn\(downloadBundle\)\}/)
    expect(src).toMatch(/server\.expire\(\)/)
  })
})
