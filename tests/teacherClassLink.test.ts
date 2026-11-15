// 교사 화면 ① 수업 전 — 학생용 수업 주소·복사 버튼·QR(설계 2026-11-14-student-number-and-class-link §3-4·§3-6).
// 교사 화면은 PIN 뒤라 자동 화면 확인에서 열지 않는다. 여기서는 주소 칸을 따로 그려 보고, 화면 연결은 원본 글로 본다.
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { ClassLinkCard } from '../src/screens/ClassLinkCard'
import { classLinkUrl } from '../src/app/classLink'
import { caseKey, type TeacherPreset } from '../src/app/teacherPreset'
import { listTasks } from '../src/app/session'
import { qrMatrix, qrPath } from '../src/teacher/qr'

const PROD = 'https://chassis-3d-lab.vercel.app/'
const preset: TeacherPreset = { sessionCode: 'DEMO-ONLY', caseId: caseKey(listTasks()[1]!), usagePhase: 'preview', difficultyMode: 'guided', vehicleEntryDirection: 'north' }
const render = (p: TeacherPreset | null, base = PROD) => renderToStaticMarkup(createElement(ClassLinkCard, { preset: p, base }))

describe('수업 주소 칸', () => {
  test('저장한 설정의 주소·복사 버튼·QR을 보인다', () => {
    const url = classLinkUrl(PROD, preset)!
    const html = render(preset)
    expect(html).toContain(url.replace(/&/g, '&amp;'))
    expect(html).toMatch(/<button[^>]*>주소 복사<\/button>/)
    const m = qrMatrix(url)
    expect(html).toContain(`viewBox="0 0 ${m.length + 8} ${m.length + 8}"`)
    expect(html).toContain(`d="${qrPath(m)}"`)
    expect(html).toMatch(/aria-label="수업 주소 QR"/)
    // 교사에게 알리는 사실: 학번·이름은 주소에 없고, 주소 값은 고칠 수 있어 보안 장치가 아니다
    expect(html).toMatch(/학번·이름은 없습니다/)
    expect(html).toMatch(/보안 장치가 아닙니다/)
  })

  test('저장한 설정이 없으면 주소를 만들지 않고 저장하라고 알린다', () => {
    const html = render(null)
    expect(html).not.toMatch(/<svg/)
    expect(html).toMatch(/설정을 저장하면/)
  })

  test('바탕 주소가 길어 106자를 넘으면 QR을 만들지 않는다', () => {
    const html = render(preset, `https://example.com/${'a'.repeat(60)}/`)
    expect(html).not.toMatch(/<svg/)
    expect(html).toMatch(/106자/)
  })
})

describe('교사 화면 연결과 글', () => {
  const src = fs.readFileSync('src/screens/TeacherPanel.tsx', 'utf8')
  const before = src.slice(src.indexOf("tab === 'before'"), src.indexOf("tab === 'during'"))
  const after = src.slice(src.indexOf("tab === 'after'"))

  test('① 수업 전에 저장한 설정으로 주소 칸을 붙인다(이 화면의 주소를 바탕으로)', () => {
    expect(before).toMatch(/<ClassLinkCard preset=\{preset\} base=\{`\$\{window\.location\.origin\}\$\{window\.location\.pathname\}`\} \/>/)
  })

  test('‘학생이 바꾸지 못하게’ 체크는 없다(늘 막힘)', () => {
    expect(src).not.toMatch(/학생이 바꾸지 못하게|\.locked|locked:/)
  })

  test('익명·가명 코드라는 말 대신 사실을 적는다: 학번은 학생을 알아볼 수 있고, 서버는 리허설 가상 코드와 수업용 세션 학번만 받고, 시연 학번 기록은 기기에서 내려받는다', () => {
    expect(src).not.toMatch(/익명 코드|가명 코드/)
    expect(before).toMatch(/학번은 학생을 알아볼 수 있는 값입니다/)
    expect(before).toMatch(/리허설 세션은 학생이 가상 코드\(D-01~D-99\)로 들어오고, 서버가 그 기록을 받습니다/)
    expect(before).toMatch(/AI 교관에게 질문하면 서버 대화 기록에 학번이 남습니다/)
    expect(after).toMatch(/요약 CSV·연구용 묶음으로 이 기기에서 내려받으세요/)
  })

  test('수업 자료 모으기(설계 2026-11-15 §3-3): 세션 종류마다 기록이 어디로 가는지 적는다', () => {
    // 수업용: 학번으로 들어오고 마치면 서버로 바로, 못 보내면 기기에 남았다가 다시
    expect(before).toMatch(/kind === 'class'/)
    expect(before).toMatch(/수업용 세션은 학생이 학번 네 자리로 들어오고, 수행을 마치거나 중단하면 기록이 서버로 바로 갑니다/)
    expect(before).toMatch(/서버 기록은 고치거나 지울 수 없으니 시험은 리허설 세션으로 하세요/)
    // 시연: 학번 기록은 서버가 받지 않아 보내지 않는다
    expect(before).toMatch(/서버는 이 세션의 학번 기록을 받지 않아 보내지 않습니다/)
    expect(after).toMatch(/수업용 세션 기록은 학생이 마치면 바로 서버로 갑니다/)
    expect(after).toMatch(/시연 세션에 학번으로 남은 기록은 서버가 받지 않아 보내지 않습니다/)
    expect(after).not.toMatch(/서버 전송은 이 화면의 교사 조작으로만 합니다/)
  })

  test('다른 교사 화면 글에도 익명·가명 코드라는 말이 남지 않는다', () => {
    for (const f of ['src/screens/RecordCheck.tsx', 'src/screens/ServerAdmin.tsx', 'src/screens/ChatReview.tsx', 'src/app/todaySummary.ts'])
      expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/익명 코드|가명 코드/)
  })
})
