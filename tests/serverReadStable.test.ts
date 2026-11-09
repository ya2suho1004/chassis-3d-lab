// 독립 검토(2026-11-09) 2번: 이어 읽는 도중 접수가 끼어들면 줄이 빠지고 겹칠 수 있다.
// 다 읽은 뒤 번호 목록과 맞춰 보고, 다르면 다시 읽고, 그래도 안 맞으면 일부를 돌려주지 않고 오류를 낸다.
import { describe, expect, test } from 'vitest'
import { errText } from '../src/screens/ServerAdmin'
import { listAllServerRecords, listChatLogs, listServerReceipts, ServerError, type ChatLogRecord, type ServerRecordRow } from '../src/teacher/serverAdmin'

const cfg = { url: 'https://x', anonKey: 'k' }
const auth = { accessToken: 't', expiresAt: 0, email: 'e' }
type Row = { record_id: string; accepted_at: string; payload_json?: string }
const row = (n: number): Row => ({ record_id: `r${n}`, accepted_at: `2026-11-09T00:00:${String(n).padStart(2, '0')}Z`, payload_json: '{}' })
const sortRows = (rows: Row[]) => [...rows].sort((a, b) => a.accepted_at.localeCompare(b.accepted_at))

/** max_rows를 흉내 내는 가짜 서버. 요청 직전에 onRequest로 기록을 끼워 넣을 수 있다. */
function fakeServer(initial: Row[], pageSize: number, onRequest: (callNo: number, rows: Row[]) => Row[] = (_, r) => r) {
  let rows = sortRows(initial)
  let calls = 0
  const urls: string[] = []
  const f = (async (u: string, init?: RequestInit) => {
    expect(init?.method ?? 'GET').toBe('GET')
    calls++
    urls.push(u)
    rows = sortRows(onRequest(calls, rows))
    const offset = Number(/offset=(\d+)/.exec(u)?.[1] ?? 0)
    return new Response(JSON.stringify(rows.slice(offset, offset + pageSize)), { status: 200 })
  }) as unknown as typeof fetch
  return { f, urls, calls: () => calls }
}
const ids = (rows: ServerRecordRow[]) => rows.map((r) => r.record_id)

describe('읽는 도중 접수가 끼어들 때', () => {
  test('앞쪽에 늦게 저장된 기록이 끼면 다시 읽어 빠짐·겹침 없이 돌려준다', async () => {
    const late = row(0) // 접수 시각은 가장 이르지만 저장은 늦음
    const s = fakeServer([row(1), row(2), row(3)], 2, (n, rows) => (n === 2 ? [...rows, late] : rows))
    const rows = await listAllServerRecords(cfg, auth, 'S', s.f)
    expect(ids(rows)).toEqual(['r0', 'r1', 'r2', 'r3'])
  })

  test('마지막 쪽을 읽은 뒤 끼어든 기록도 번호 맞추기에서 잡아 다시 읽는다', async () => {
    // 쪽 3회(2+1+빈) 뒤, 번호 확인 첫 요청에 끼어든다
    const s = fakeServer([row(1), row(2), row(3)], 2, (n, rows) => (n === 4 ? [...rows, row(0)] : rows))
    const rows = await listAllServerRecords(cfg, auth, 'S', s.f)
    expect(ids(rows)).toEqual(['r0', 'r1', 'r2', 'r3'])
  })

  test('읽을 때마다 새 접수가 끼면 일부를 돌려주지 않고 오류를 낸다', async () => {
    let n = 100
    const s = fakeServer([row(1), row(2), row(3)], 2, (_, rows) => [...rows, { ...row(0), record_id: `late${n++}` }])
    await expect(listAllServerRecords(cfg, auth, 'S', s.f)).rejects.toMatchObject({ code: 'READ_UNSTABLE' })
  })

  test('다시 읽기는 정해진 횟수에서 멈춘다(끝없이 요청하지 않음)', async () => {
    let n = 100
    const s = fakeServer([row(1)], 1000, (_, rows) => [...rows, { ...row(0), record_id: `late${n++}` }])
    await expect(listAllServerRecords(cfg, auth, 'S', s.f)).rejects.toBeInstanceOf(ServerError)
    expect(s.calls()).toBeLessThanOrEqual(3 * 4)
  })

  test('번호 확인 중 로그인이 만료되면 그 오류를 그대로 낸다', async () => {
    let calls = 0
    const f = (async () => {
      calls++
      if (calls === 1) return new Response(JSON.stringify([row(1)]), { status: 200 })
      if (calls === 2) return new Response('[]', { status: 200 })
      return new Response('{}', { status: 401 })
    }) as unknown as typeof fetch
    await expect(listAllServerRecords(cfg, auth, 'S', f)).rejects.toMatchObject({ code: 'NOT_TEACHER' })
  })
})

describe('번호 확인 요청', () => {
  test('수행 기록: 원본을 다시 받지 않고 같은 세션·같은 정렬로 번호만 받는다', async () => {
    const s = fakeServer([row(1)], 1000)
    await listAllServerRecords(cfg, auth, 'A&B', s.f)
    const check = s.urls.filter((u) => /select=record_id&/.test(u))
    expect(check.length).toBeGreaterThan(0)
    for (const u of check) {
      expect(u).not.toMatch(/payload_json/)
      expect(u).toMatch(/session_code=eq\.A%26B/)
      expect(u).toMatch(/order=accepted_at\.asc,record_id\.asc/)
    }
  })

  test('대화 기록은 대화 번호로 맞춰 본다', async () => {
    const urls: string[] = []
    const all = [{ chat_id: 'c1' }] as unknown as ChatLogRecord[]
    const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify(/offset=0/.test(u) ? all : []), { status: 200 }) }) as unknown as typeof fetch
    expect((await listChatLogs(cfg, auth, 'S', f)).length).toBe(1)
    expect(urls.some((u) => /chat_logs\?select=chat_id&/.test(u))).toBe(true)
  })

  test('대조용 접수 조회도 같은 확인을 거친다', async () => {
    const s = fakeServer([row(1)], 1000)
    await listServerReceipts(cfg, auth, 'S', s.f)
    expect(s.urls.some((u) => /select=record_id&/.test(u))).toBe(true)
  })

  test('평소에는 다시 읽지 않는다: 본문 2회 + 번호 2회', async () => {
    const s = fakeServer([row(1)], 1000)
    expect((await listAllServerRecords(cfg, auth, 'S', s.f)).length).toBe(1)
    expect(s.calls()).toBe(4)
  })
})

describe('오류 문구', () => {
  test('파일을 만들지 않았고 잠시 뒤 다시 하면 된다고 말한다', () => {
    const t = errText(new ServerError('READ_UNSTABLE', 0))
    expect(t).toMatch(/접수/)
    expect(t).toMatch(/파일을 만들지 않았/)
    expect(t).not.toMatch(/READ_UNSTABLE/)
  })
})

describe('접수가 끝없이 이어질 때', () => {
  test('맨 뒤에 계속 붙어도 요청을 멈추고 오류를 낸다', async () => {
    let n = 100
    const s = fakeServer([row(1)], 1000, (_, rows) => [...rows, { ...row(99), record_id: `new${n++}`, accepted_at: `2026-11-09T01:00:00.${n}Z` }])
    await expect(listAllServerRecords(cfg, auth, 'S', s.f)).rejects.toMatchObject({ code: 'READ_UNSTABLE' })
  }, 20000)
})
