// B1(Codex 회의 2026-11-08): 연구용 내려받기 묶음 — 이미 모은 기록을 풀어 쓴다. 새로 모으는 자료 없음. 원본은 고치지 않는다.
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import lv1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import { createDemoSession } from '../src/app/session'
import { payloadHash as rawHash } from '../src/delivery/jcs'
import { buildRecordPayload, type RecordPayload } from '../src/domain/record'
import { createTaskRun, submitResponse } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'
import { buildResearchBundle, deviceRows, serverRows, ANSWERS_CSV_HEADER, EVENTS_CSV_HEADER, type BundleRow } from '../src/records/researchBundle'
import { crc32, zipStore } from '../src/records/zip'
import { listAllServerRecords, type ServerRecordRow } from '../src/teacher/serverAdmin'
import type { DeliveryEnvelope } from '../src/records/types'

// 실제 저장·전송처럼 JSON을 한 번 거친 뒤 해시한다(undefined 칸이 빠진 모양)
const payloadHash = (p: unknown) => rawHash(JSON.parse(JSON.stringify(p)))
const env = (recordId: string, o: Partial<DeliveryEnvelope> = {}): DeliveryEnvelope => ({ recordId, localSaveStatus: 'saved', uploadStatus: 'pending', uploadedAt: null, receiptId: null, payloadHash: null, uploadAttemptCount: 0, lastErrorCode: null, nextRetryAt: null, ...o })

function makePayload(code = 'D-01'): RecordPayload {
  const session = createDemoSession({ studentCode: code, sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'review' })
  let run = createTaskRun(lv1 as ApprovedTask, { difficultyMode: 'unguided' })
  run = submitResponse(run, 'left', '999', 'a1').run // 최초 오답
  run = submitResponse(run, 'left', String((lv1 as ApprovedTask).measurement.left), 'a2').run // 정정
  return buildRecordPayload(run, session, { completedAtIso: '2026-11-09T05:00:00.000Z', completionStatus: 'aborted' })
}
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [[]]
  let cell = '', q = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c }
    else if (c === '"') q = true
    else if (c === ',') { rows[rows.length - 1]!.push(cell); cell = '' }
    else if (c === '\r') continue
    else if (c === '\n') { rows[rows.length - 1]!.push(cell); cell = ''; rows.push([]) }
    else cell += c
  }
  if (rows[rows.length - 1]!.length === 0) rows.pop()
  return rows
}
const objects = (text: string) => { const [h, ...rest] = parseCsv(text); return rest.map((r) => Object.fromEntries(h!.map((k, i) => [k, r[i] ?? '']))) }
const bundle = (rows: BundleRow[], source: 'device' | 'server' = 'device') => buildResearchBundle({ source, scope: 'DEMO-ONLY', generatedAtIso: '2026-11-09T06:00:00.000Z', rows })
const file = (b: Awaited<ReturnType<typeof bundle>>, name: string) => b.files.find((f) => f.name === name)!.text

describe('항목별 최초·최종 답 표', () => {
  test('최초 오답과 정정 답이 그대로 나오고, 미응답은 0이나 오답으로 바뀌지 않는다', async () => {
    const p = makePayload()
    const rows = objects(file(await bundle(deviceRows([{ payload: p, envelope: env(p.recordId) }])), 'answers.csv'))
    expect(rows.length).toBe(p.measurementInputs.length + p.calculationAnswers.length + p.judgmentAnswers.length)
    const left = rows.find((r) => r.itemId === 'left')!
    expect(left.itemKind).toBe('measurement')
    expect(left.firstInput).toBe('999')
    expect(left.firstCorrect).toBe('false')
    expect(left.firstStatus).toBe('incorrect')
    expect(left.finalCorrect).toBe('true')
    expect(left.finalStatus).toBe('correct')
    expect(left.presentedValue).toBe(String((lv1 as ApprovedTask).measurement.left))
    const un = rows.find((r) => r.itemKind === 'judgment')!
    expect(un.firstAnswer).toBe('')
    expect(un.firstCorrect).toBe('')
    expect(un.firstStatus).toBe('unanswered')
    const calc = rows.find((r) => r.itemKind === 'calculation')!
    expect(calc.firstStatus).toBe('unanswered')
    expect(calc.computedReferenceValue).not.toBe('')
  })

  test('어느 수행인지 알 수 있는 열이 있다(대표 수행을 고르지 않고 모두 싣는다)', () => {
    for (const k of ['recordId', 'anonymousStudentCode', 'classConditionCode', 'sessionCode', 'taskId', 'difficultyMode', 'usagePhase', 'attemptRole', 'retryOfRecordId', 'retryCount', 'runPurpose', 'researchEligible', 'completionStatus', 'schemaVersion']) {
      expect(ANSWERS_CSV_HEADER).toContain(k)
    }
  })
})

describe('사건 표', () => {
  test('사건 하나가 한 행이고 원본 순서와 필드를 그대로 둔다', async () => {
    const p = makePayload()
    const rows = objects(file(await bundle(deviceRows([{ payload: p, envelope: env(p.recordId) }])), 'events.csv'))
    expect(rows.length).toBe(p.stepEvents.length)
    expect(rows.map((r) => r.eventId)).toEqual(p.stepEvents.map((e) => e.eventId))
    expect(rows.map((r) => Number(r.sequence))).toEqual(p.stepEvents.map((e) => e.sequence))
    for (const k of ['eventId', 'sequence', 'elapsedMs', 'type', 'stepId', 'actionId', 'reasonCode', 'itemId', 'feedbackKey', 'feedbackKind', 'fromDisplayMode', 'toDisplayMode']) expect(EVENTS_CSV_HEADER).toContain(k)
  })
})

describe('원본과 요약', () => {
  test('원본 파일은 서버 글자 그대로 한 줄에 한 건이고, 요약은 기존 열과 같다', async () => {
    const p = makePayload()
    const json = JSON.stringify(p)
    const hash = await payloadHash(p)
    const row: ServerRecordRow = { record_id: p.recordId, receipt_id: 'rcpt-1', accepted_at: '2026-11-09T05:00:01Z', payload_hash: hash, payload_json: json, session_code: 'DEMO-ONLY', anonymous_student_code: 'D-01', run_purpose: 'demo', schema_version: '1.1.0' }
    const b = await bundle(serverRows([row]), 'server')
    const lines = file(b, 'records.jsonl').trim().split('\n')
    expect(lines.length).toBe(1)
    const raw = JSON.parse(lines[0]!)
    expect(raw.payloadJson).toBe(json)
    expect(raw).toMatchObject({ source: 'server', recordId: p.recordId, receiptId: 'rcpt-1', payloadHash: hash })
    const sum = objects(file(b, 'summary.csv'))
    expect(sum.length).toBe(1)
    expect(sum[0]!.receiptId).toBe('rcpt-1')
    expect(sum[0]!.anonymousStudentCode).toBe('D-01')
  })
})

describe('손상·충돌은 조용히 빼지 않는다', () => {
  const server = (o: Partial<ServerRecordRow>): ServerRecordRow => ({ record_id: 'r', receipt_id: 'x', accepted_at: '2026-11-09T05:00:01Z', payload_hash: 'h', payload_json: '{}', session_code: 'DEMO-ONLY', anonymous_student_code: 'D-01', run_purpose: 'demo', schema_version: '1.1.0', ...o })

  test('글이 깨졌거나, 구조가 다르거나, 해시·번호가 다르거나, 번호가 겹치면 표에서 분리해 문제 목록에 남긴다', async () => {
    const good = makePayload('D-01')
    const goodHash = await payloadHash(good)
    const tampered = makePayload('D-02')
    const other = makePayload('D-03')
    const dup = makePayload('D-04')
    const dupHash = await payloadHash(dup)
    const b = await bundle(serverRows([
      server({ record_id: good.recordId, payload_json: JSON.stringify(good), payload_hash: goodHash }),
      server({ record_id: 'broken', payload_json: '{"recordId":' }),
      server({ record_id: 'shape', payload_json: '{"recordId":"shape"}' }),
      server({ record_id: tampered.recordId, payload_json: JSON.stringify(tampered), payload_hash: '0'.repeat(64) }),
      server({ record_id: 'wrong-id', payload_json: JSON.stringify(other), payload_hash: await payloadHash(other) }),
      server({ record_id: dup.recordId, payload_json: JSON.stringify(dup), payload_hash: dupHash }),
      server({ record_id: dup.recordId, payload_json: JSON.stringify(dup), payload_hash: dupHash }),
    ]), 'server')
    const problems = objects(file(b, 'problems.csv'))
    expect(problems.map((r) => `${r.recordId}:${r.problem}`).sort()).toEqual([
      `broken:JSON_BROKEN`, `shape:STRUCTURE_INVALID`, `${tampered.recordId}:HASH_MISMATCH`, `wrong-id:RECORD_ID_MISMATCH`, `${dup.recordId}:DUPLICATE_RECORD_ID`, `${dup.recordId}:DUPLICATE_RECORD_ID`,
    ].sort())
    expect(objects(file(b, 'summary.csv')).map((r) => r.recordId)).toEqual([good.recordId])
    expect(file(b, 'records.jsonl').trim().split('\n').length).toBe(7) // 원본은 문제가 있어도 전부 보존
    expect(b.counts).toMatchObject({ received: 7, usable: 1, problem: 6 })
    expect(file(b, 'README.txt')).toContain('문제가 있어 표에서 분리한 줄 6')
  })

  test('기기 기록은 아직 해시가 없으면 대조하지 않음으로 두고, 있으면 대조한다', async () => {
    const p = makePayload()
    const a = await bundle(deviceRows([{ payload: p, envelope: env(p.recordId) }]))
    expect(a.counts).toMatchObject({ usable: 1, problem: 0, hashChecked: 0 })
    const c = await bundle(deviceRows([{ payload: p, envelope: env(p.recordId, { payloadHash: await payloadHash(p) }) }]))
    expect(c.counts).toMatchObject({ usable: 1, problem: 0, hashChecked: 1 })
  })
})

describe('설명서와 건수 대조', () => {
  test('모든 표의 모든 열을 설명하고, 판 정보와 건수를 적는다', async () => {
    const p = makePayload()
    const b = await bundle(deviceRows([{ payload: p, envelope: env(p.recordId) }]))
    const readme = file(b, 'README.txt')
    for (const name of ['answers.csv', 'events.csv', 'summary.csv', 'problems.csv']) {
      const header = parseCsv(file(b, name))[0]!
      for (const col of header) expect(readme, `${name} ${col}`).toContain(col)
    }
    expect(readme).toContain('2026-11-09T06:00:00.000Z')
    expect(readme).toContain('이 기기')
    expect(readme).toContain('DEMO-ONLY')
    expect(readme).toContain(`항목 행 ${b.counts.answerRows}`)
    expect(readme).toContain(`사건 행 ${b.counts.eventRows}`)
    expect(b.counts.eventRows).toBe(p.stepEvents.length)
  })

  test('연구자 전용 주의, 대표 수행 미선택, 대화 미포함, 빈 칸의 뜻을 알린다', async () => {
    const b = await bundle([])
    const readme = file(b, 'README.txt')
    for (const w of ['연구자 전용', '대응표', '대표 수행', 'AI 대화', '빈 칸', '철회']) expect(readme).toContain(w)
    expect(b.counts).toMatchObject({ received: 0, usable: 0, problem: 0 })
  })

  test('수식으로 실행될 입력은 csv 규칙대로 막고 원본 파일은 그대로 둔다', async () => {
    const p = makePayload()
    p.measurementInputs[0]!.firstInput = '=1+1'
    const b = await bundle(deviceRows([{ payload: p, envelope: env(p.recordId) }]))
    expect(objects(file(b, 'answers.csv'))[0]!.firstInput).toBe("'=1+1")
    expect(JSON.parse(JSON.parse(file(b, 'records.jsonl').trim()).payloadJson).measurementInputs[0].firstInput).toBe('=1+1')
  })
})

describe('압축 파일(저장 방식 ZIP)', () => {
  test('CRC32 표준 값', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  test('파일 이름·내용·중앙 목록이 ZIP 형식대로 들어간다', () => {
    const z = zipStore([{ name: 'a.txt', text: '가나다' }, { name: 'b.csv', text: 'x' }], new Date(2026, 10, 9, 15, 4, 6))
    const v = new DataView(z.buffer, z.byteOffset, z.byteLength)
    expect(v.getUint32(0, true)).toBe(0x04034b50)
    const eocd = z.length - 22
    expect(v.getUint32(eocd, true)).toBe(0x06054b50)
    expect(v.getUint16(eocd + 10, true)).toBe(2)
    let at = v.getUint32(eocd + 16, true)
    const seen: Record<string, string> = {}
    for (let i = 0; i < 2; i++) {
      expect(v.getUint32(at, true)).toBe(0x02014b50)
      expect(v.getUint16(at + 10, true)).toBe(0) // 압축 안 함
      const size = v.getUint32(at + 24, true)
      const nameLen = v.getUint16(at + 28, true)
      const local = v.getUint32(at + 42, true)
      const name = new TextDecoder().decode(z.subarray(at + 46, at + 46 + nameLen))
      const dataAt = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
      const data = z.subarray(dataAt, dataAt + size)
      expect(v.getUint32(at + 16, true)).toBe(crc32(data))
      seen[name] = new TextDecoder().decode(data)
      at += 46 + nameLen
    }
    expect(seen).toEqual({ 'a.txt': '가나다', 'b.csv': 'x' })
  })
})

describe('서버 기록 전부 읽기', () => {
  test('서버가 한 번에 주는 줄 수가 적어도 끝까지 이어 읽는다', async () => {
    const all = Array.from({ length: 7 }, (_, i) => ({ record_id: `r${i}` })) as unknown as ServerRecordRow[]
    const urls: string[] = []
    const f = (async (u: string, init?: RequestInit) => {
      urls.push(u)
      expect(init?.method ?? 'GET').toBe('GET')
      const offset = Number(/offset=(\d+)/.exec(u)?.[1] ?? 0)
      return new Response(JSON.stringify(all.slice(offset, offset + 3)), { status: 200 }) // 서버 max_rows 흉내
    }) as unknown as typeof fetch
    const rows = await listAllServerRecords({ url: 'https://x', anonKey: 'k' }, { accessToken: 't', expiresAt: 0, email: 'e' }, 'DEMO-ONLY', f)
    expect(rows.map((r) => r.record_id)).toEqual(all.map((r) => r.record_id))
    expect(urls[0]).toMatch(/order=accepted_at\.asc,record_id\.asc/)
    expect(urls.filter((u) => u.includes('payload_json')).length).toBe(4) // 마지막은 빈 응답으로 끝을 확인(번호 확인 요청은 따로)
  })
})

describe('화면 연결', () => {
  test('교사 화면: 이 기기 묶음과 서버 세션별 묶음을 수업 후 탭에서 내려받는다', () => {
    const t = fs.readFileSync('src/screens/TeacherPanel.tsx', 'utf8')
    expect(t).toMatch(/deviceRows\(/)
    expect(t).toMatch(/<DeviceExports /)
    expect(fs.readFileSync('src/screens/RecordCheck.tsx', 'utf8')).toMatch(/연구용 묶음/)
    const s = fs.readFileSync('src/screens/ServerAdmin.tsx', 'utf8')
    expect(s).toMatch(/serverRows\(await listAllServerRecords\(cfg, auth, x\.session_code\)\)/)
    expect(s).toMatch(/연구용 묶음/)
  })

  test('학생 결과 화면에는 묶음 내려받기를 두지 않는다', () => {
    expect(fs.readFileSync('src/screens/ResultScreen.tsx', 'utf8')).not.toMatch(/researchBundle|연구용 묶음/)
  })
})
