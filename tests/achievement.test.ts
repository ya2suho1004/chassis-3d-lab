// 교사 화면 학생별 성취 표 계산(설계 docs/superpowers/specs/2026-11-15-class-records-design.md §3-4)
// 가짜 서버 행만 쓴다(가짜 학번 2211·2212·3999 등). 서버를 부르지 않는다.
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { buildAchievement, durationText, filterAchievement, inspectionText, taskLabel, whenText } from '../src/teacher/achievement'
import { listTasks } from '../src/app/session'
import type { ServerRecordRow } from '../src/teacher/serverAdmin'

const tasks = listTasks()
const [brake1, brake2, turn1] = tasks as [typeof tasks[0], typeof tasks[0], typeof tasks[0]]
let n = 0
function row(o: { code: string; task?: typeof tasks[0]; status?: 'completed' | 'aborted'; npc?: 'passed' | 'needsCorrection' | 'notCompleted'; npcCount?: number; errors?: number; secs?: number; completedAt: string; acceptedAt?: string; session?: string }): ServerRecordRow {
  const t = o.task ?? brake1
  const rid = `60000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  const payload = {
    recordId: rid, anonymousStudentCode: o.code, sessionCode: o.session ?? 'CLS-L12', taskId: t.taskId, versions: { taskDefinitionVersion: t.taskDefinitionVersion },
    completionStatus: o.status ?? 'completed', completedAt: o.completedAt, durationSeconds: o.secs ?? 300, errorCount: o.errors ?? 0,
    npcInspectionResult: o.npc ?? ((o.status ?? 'completed') === 'completed' ? 'passed' : 'notCompleted'), npcInspectionCount: o.npcCount ?? 1,
  }
  return { record_id: rid, receipt_id: 'R' + n, accepted_at: o.acceptedAt ?? o.completedAt, payload_hash: 'a'.repeat(64), payload_json: JSON.stringify(payload), session_code: o.session ?? 'CLS-L12', anonymous_student_code: o.code, run_purpose: 'demo', schema_version: '1.3.0' }
}

describe('칸 값', () => {
  test('검사: 통과(n번째) / 통과 못함(n번 받음) / 검사 안 받음', () => {
    expect(inspectionText('passed', 1)).toBe('통과(1번째)')
    expect(inspectionText('passed', 3)).toBe('통과(3번째)')
    expect(inspectionText('needsCorrection', 2)).toBe('통과 못함(2번 받음)')
    expect(inspectionText('notCompleted', 1)).toBe('통과 못함(1번 받음)')
    expect(inspectionText('notCompleted', 0)).toBe('검사 안 받음')
  })
  test('걸린 시간은 분:초', () => {
    expect(durationText(0)).toBe('0:00')
    expect(durationText(65)).toBe('1:05')
    expect(durationText(754)).toBe('12:34')
    expect(durationText(3600)).toBe('60:00')
    expect(durationText(-1)).toBe('—')
    expect(durationText(Number.NaN)).toBe('—')
  })
  test('시각은 한국 시각 월/일 시:분', () => {
    expect(whenText('2026-11-17T01:05:00Z')).toBe('11/17 10:05')
    expect(whenText('2026-11-16T15:30:00Z')).toBe('11/17 00:30')
    expect(whenText('')).toBe('—')
  })
  test('과제 이름은 짧게(제동력 사례 1 등), 모르는 판이면 과제와 판을 그대로', () => {
    expect(taskLabel(brake1.taskId, brake1.taskDefinitionVersion, tasks)).toBe('제동력 사례 1')
    expect(taskLabel(brake2.taskId, brake2.taskDefinitionVersion, tasks)).toBe('제동력 사례 2')
    expect(taskLabel(turn1.taskId, turn1.taskDefinitionVersion, tasks)).toBe('최소회전반경 사례 1')
    expect(taskLabel('braking-force', '9.9.9-x', tasks)).toBe('braking-force (9.9.9-x)')
  })
})

describe('표 만들기', () => {
  test('한 줄 = 학생 × 과제, 값은 가장 최근에 끝낸 수행, 수행 횟수는 서버 기록 건수, 학번 순', () => {
    const t = buildAchievement([
      row({ code: '2212', completedAt: '2026-11-17T01:00:00Z', errors: 4, secs: 400 }),
      row({ code: '2211', status: 'aborted', npc: 'needsCorrection', npcCount: 2, errors: 3, secs: 125, completedAt: '2026-11-17T01:10:00Z' }),
      row({ code: '2211', status: 'completed', npcCount: 3, errors: 1, secs: 610, completedAt: '2026-11-17T02:00:00Z' }),
      row({ code: '2211', status: 'aborted', npcCount: 0, errors: 0, secs: 30, completedAt: '2026-11-17T00:30:00Z' }),
      row({ code: '2211', task: turn1, status: 'aborted', npcCount: 0, secs: 45, completedAt: '2026-11-17T03:00:00Z' }),
    ], tasks)
    expect(t.skipped).toBe(0)
    expect(t.rows.map((r) => [r.studentCode, r.taskLabel, r.count])).toEqual([['2211', '제동력 사례 1', 3], ['2211', '최소회전반경 사례 1', 1], ['2212', '제동력 사례 1', 1]])
    const r = t.rows[0]!
    expect(r.latest).toMatchObject({ completion: '완료', inspection: '통과(3번째)', errorCount: 1, duration: '10:10' })
    expect(r.attempts.map((a) => a.completedAt)).toEqual(['2026-11-17T00:30:00Z', '2026-11-17T01:10:00Z', '2026-11-17T02:00:00Z'])
    expect(r.attempts.map((a) => a.inspection)).toEqual(['검사 안 받음', '통과 못함(2번 받음)', '통과(3번째)'])
    expect(t.rows[1]!.latest).toMatchObject({ completion: '중단', inspection: '검사 안 받음', duration: '0:45' })
    expect([r.grade, r.classNo]).toEqual(['2', '2'])
  })
  test('서버 접수 시각: 줄에는 가장 최근 접수, 펼친 수행마다 그 수행의 접수 시각(기기 시계와 다를 수 있음)', () => {
    const t = buildAchievement([
      row({ code: '2211', completedAt: '2026-11-17T01:00:00Z', acceptedAt: '2026-11-17T01:00:02Z' }),
      row({ code: '2211', status: 'aborted', completedAt: '2026-11-17T02:00:00Z', acceptedAt: '2026-11-17T05:40:00Z' }), // 기기 시계가 늦음 → 접수가 훨씬 뒤
      row({ code: '2211', status: 'aborted', completedAt: '2026-11-17T03:00:00Z', acceptedAt: '2026-11-17T03:00:01Z' }),
    ], tasks)
    const r = t.rows[0]!
    expect(r.lastAcceptedAt).toBe('2026-11-17T05:40:00Z')
    expect(r.attempts.map((a) => a.acceptedAt)).toEqual(['2026-11-17T01:00:02Z', '2026-11-17T05:40:00Z', '2026-11-17T03:00:01Z'])
  })
  test('가장 최근 수행이 중단이면 그 중단을 보인다(앞서 완료했어도)', () => {
    const t = buildAchievement([
      row({ code: '3999', completedAt: '2026-11-17T01:00:00Z' }),
      row({ code: '3999', status: 'aborted', npc: 'needsCorrection', npcCount: 1, completedAt: '2026-11-17T02:00:00Z' }),
    ], tasks)
    expect(t.rows[0]!.latest).toMatchObject({ completion: '중단', inspection: '통과 못함(1번 받음)' })
    expect(t.rows[0]!.count).toBe(2)
  })
  test('같은 과제라도 사례(과제 판)가 다르면 다른 줄', () => {
    const t = buildAchievement([row({ code: '1101', task: brake1, completedAt: '2026-11-17T01:00:00Z' }), row({ code: '1101', task: brake2, completedAt: '2026-11-17T01:30:00Z' })], tasks)
    expect(t.rows.map((r) => r.taskLabel)).toEqual(['제동력 사례 1', '제동력 사례 2'])
  })
  test('깨진 원본(payload_json)은 건너뛰고 건수를 알린다', () => {
    const good = row({ code: '2211', completedAt: '2026-11-17T01:00:00Z' })
    const broken = { ...row({ code: '2212', completedAt: '2026-11-17T01:00:00Z' }), payload_json: '{not json' }
    const missing = { ...row({ code: '2213', completedAt: '2026-11-17T01:00:00Z' }), payload_json: JSON.stringify({ anonymousStudentCode: '2213' }) }
    const wrongType = { ...row({ code: '2214', completedAt: '2026-11-17T01:00:00Z' }), payload_json: JSON.stringify({ ...JSON.parse(good.payload_json), anonymousStudentCode: '2214', errorCount: '3' }) }
    const t = buildAchievement([good, broken, missing, wrongType, { ...good, payload_json: 'null' }], tasks)
    expect(t.skipped).toBe(4)
    expect(t.rows.map((r) => r.studentCode)).toEqual(['2211'])
  })
  test('고르기 목록: 학년·반·과제는 들어온 값에서', () => {
    const t = buildAchievement([row({ code: '2211', completedAt: '2026-11-17T01:00:00Z' }), row({ code: '1305', task: turn1, completedAt: '2026-11-17T01:00:00Z' }), row({ code: '2101', completedAt: '2026-11-17T01:00:00Z' })], tasks)
    expect(t.grades).toEqual(['1', '2'])
    expect(t.classes).toEqual(['1', '2', '3'])
    expect(t.tasks.map((x) => x.label)).toEqual(['제동력 사례 1', '최소회전반경 사례 1'])
  })
})

describe('거르기', () => {
  const t = buildAchievement([
    row({ code: '2211', completedAt: '2026-11-17T01:00:00Z' }),
    row({ code: '2212', task: turn1, completedAt: '2026-11-17T01:00:00Z' }),
    row({ code: '2311', completedAt: '2026-11-17T01:00:00Z' }),
    row({ code: '1211', completedAt: '2026-11-17T01:00:00Z' }),
  ], tasks)
  test('학년·반·과제로 거른다(비우면 전체)', () => {
    expect(filterAchievement(t.rows, {}).map((r) => r.studentCode)).toEqual(['1211', '2211', '2212', '2311'])
    expect(filterAchievement(t.rows, { grade: '2' }).map((r) => r.studentCode)).toEqual(['2211', '2212', '2311'])
    expect(filterAchievement(t.rows, { grade: '2', classNo: '2' }).map((r) => r.studentCode)).toEqual(['2211', '2212'])
    expect(filterAchievement(t.rows, { classNo: '2' }).map((r) => r.studentCode)).toEqual(['1211', '2211', '2212'])
    expect(filterAchievement(t.rows, { taskKey: turn1.taskDefinitionVersion }).map((r) => r.studentCode)).toEqual(['2212'])
  })
})

describe('화면 연결(소스)', () => {
  const screen = fs.readFileSync('src/screens/AchievementTable.tsx', 'utf8')
  const admin = fs.readFileSync('src/screens/ServerAdmin.tsx', 'utf8')
  test('기존 서버 읽기(listAllServerRecords)만 쓰고, 세션은 수업용 둘에서 고른다', () => {
    expect(screen).toMatch(/listAllServerRecords\(cfg, auth, session\)/)
    expect(screen).toMatch(/SESSIONS\.filter\(\(x\) => x\.kind === 'class'\)/)
    expect(screen).not.toMatch(/fetch\(/)
  })
  test('깨진 행 건수를 알리고, 줄을 누르면 모든 수행이 펼쳐진다', () => {
    expect(screen).toMatch(/data\.skipped > 0/)
    expect(screen).toMatch(/aria-expanded=\{open\}/)
    expect(screen).toMatch(/r\.attempts\.map\(/)
  })
  test('다시 불러오면 학년·반·과제 거르기를 비운다', () => {
    expect(screen).toMatch(/setGrade\(''\); setClassNo\(''\); setTaskKey\(''\); setOpenKey\(null\)/)
  })
  test('최근 접수 칸과 펼친 줄의 접수 시각, 수업 시간과 다르면 수업 밖 기록일 수 있다는 안내', () => {
    expect(screen).toMatch(/<th>최근 접수<\/th>/)
    expect(screen).toMatch(/whenText\(r\.lastAcceptedAt\)/)
    expect(screen).toMatch(/접수 \{whenText\(a\.acceptedAt\)\}/)
    expect(screen).toMatch(/접수 시각이 수업 시간과 다르면 수업 밖에서 들어온 기록일 수 있습니다/)
  })
  test('교사 로그인 뒤 서버 관리(수업 후)에 붙는다', () => {
    expect(admin).toMatch(/<AchievementTable s=\{s\} \/>/)
    expect(admin.indexOf('<AchievementTable')).toBeGreaterThan(admin.indexOf('if (!s.cfg || !s.auth) return <ServerLogin s={s} />', admin.indexOf('export function ServerAfter')))
  })
  test('표는 가로로 밀어 볼 수 있는 상자 안에 있다(태블릿 폭)', () => {
    expect(screen).toMatch(/className="achv-scroll"/)
    expect(fs.readFileSync('src/styles.css', 'utf8')).toMatch(/\.achv-scroll \{[^}]*overflow-x:auto/)
  })
})

describe('표 그리기(서버 없이)', () => {
  test('펼친 줄에는 끝낸 시각과 접수 시각이 함께 나온다', async () => {
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { AchievementGrid } = await import('../src/screens/AchievementTable')
    const t = buildAchievement([row({ code: '2211', completedAt: '2026-11-17T01:00:00Z', acceptedAt: '2026-11-17T01:00:05Z' }), row({ code: '2211', status: 'aborted', completedAt: '2026-11-17T01:20:00Z', acceptedAt: '2026-11-17T01:20:03Z' })], tasks)
    const html = renderToStaticMarkup(createElement(AchievementGrid, { rows: t.rows, openKey: t.rows[0]!.key, onToggle: () => {} }))
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text).toMatch(/최근 접수/)
    expect(text).toMatch(/11\/17 10:20/)
    expect(text).toMatch(/1번째 · 끝냄 11\/17 10:00 · 접수 11\/17 10:00/)
    expect(html).toMatch(/aria-expanded="true"/)
  })
})
