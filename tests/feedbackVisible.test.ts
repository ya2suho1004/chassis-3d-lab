// 값을 넣은 뒤 안내가 보이는 곳에 뜨게(2026-11-10, MOON 플레이 지적·Codex 회의).
// 재현: 서랍 안 안내는 화면 위로 914px 밖에 떴고, 게임 알림은 서랍 뒤(z-index 6 < 8)에 가려져 칸 옆 ✗만 보였다.
// "값을 먼저 입력하세요" 알림에는 그 칸으로 가는 버튼을 붙인다(정답·다음 단계는 알려 주지 않음).
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { focusResponse, responseInputId } from '../src/app/focusResponse'
import { FeedbackBox } from '../src/screens/FeedbackBox'

describe('안내 상자', () => {
  test('값이 필요하다는 안내에는 그 칸으로 가는 버튼이 있다', () => {
    const html = renderToStaticMarkup(createElement(FeedbackBox, { className: 'x', shown: { kind: 'guidance', title: '이 단계를 끝내려면 값을 먼저 입력하세요', text: null, plain: '축중 입력이 필요합니다.', focusItem: 'axleWeight' }, onFocusItem: () => {} }))
    expect(html).toContain('축중 입력이 필요합니다.')
    expect(html).toMatch(/입력칸으로/)
  })
  test('칸 정보가 없는 안내에는 버튼이 없고, 무엇·왜·어떻게를 그대로 보인다', () => {
    const html = renderToStaticMarkup(createElement(FeedbackBox, { className: 'x', shown: { kind: 'safety', title: '안전 위반', text: { what: '가', why: '나', how: '다' } }, onFocusItem: () => {} }))
    expect(html).not.toMatch(/입력칸으로/)
    expect(html).toMatch(/무엇: 가/)
    expect(html).toMatch(/어떻게: 다/)
  })
  test('닫기 처리가 있으면 닫기 버튼을 둔다', () => {
    const shown = { kind: 'hint' as const, title: '힌트', text: null, plain: '다음' }
    expect(renderToStaticMarkup(createElement(FeedbackBox, { className: 'x', shown, onClose: () => {} }))).toMatch(/aria-label="안내 닫기"/)
    expect(renderToStaticMarkup(createElement(FeedbackBox, { className: 'x', shown }))).not.toMatch(/안내 닫기/)
  })
  test('다시 확인할 항목 안내에는 항목마다 고치기 버튼이 있다(처리 함수가 있을 때만)', () => {
    const shown = { kind: 'explanatory' as const, title: '최초 응답이 모두 저장되었습니다', text: null, plain: '다시 확인할 항목: 좌측 바퀴 조향각.', fixItems: ['leftAngle', 'radius'] }
    const h = renderToStaticMarkup(createElement(FeedbackBox, { className: 'x', shown, onFix: () => {} }))
    expect(h).toContain('>고치기: 좌측 바퀴 조향각</button>')
    expect(h).toContain('>고치기: 최소회전반경(m)</button>')
    expect(renderToStaticMarkup(createElement(FeedbackBox, { className: 'x', shown }))).not.toContain('고치기')
  })
})

describe('칸으로 이동', () => {
  test('해당 칸을 가운데로 보이고 초점을 준다. 칸이 없으면 아무것도 하지 않는다', () => {
    const calls: string[] = []
    const el = { scrollIntoView: (o: unknown) => calls.push(`scroll ${JSON.stringify(o)}`), focus: (o: unknown) => calls.push(`focus ${JSON.stringify(o)}`) }
    const doc = { getElementById: (id: string) => (id === 'resp-axleWeight' ? el : null) } as unknown as Document
    expect(focusResponse(doc, 'axleWeight')).toBe(true)
    expect(calls).toEqual(['scroll {"block":"center"}', 'focus {"preventScroll":true}'])
    expect(focusResponse(doc, 'radius')).toBe(false)
    expect(responseInputId('axleWeight')).toBe('resp-axleWeight')
  })
})

describe('화면 연결', () => {
  const task = fs.readFileSync('src/screens/TaskScreen.tsx', 'utf8')
  const lab = fs.readFileSync('src/screens/LabScreen.tsx', 'utf8')
  const css = fs.readFileSync('src/styles.css', 'utf8')

  test('값이 필요한 단계 안내는 어느 칸인지 함께 넘긴다', () => {
    expect(task).toMatch(/focusItem: item/)
  })
  test('패널 안내는 교관 칸 밖에 두고, 서랍을 내려도 위에 붙어 보인다', () => {
    expect(task).toMatch(/<FeedbackBox className=\{`panel-feedback feedback \$\{shown\.kind\}`\}/)
    const npcStart = task.indexOf('<section className="npc card">')
    expect(task.indexOf('<FeedbackBox')).toBeLessThan(npcStart)
    expect(task.slice(npcStart, task.indexOf('</section>', npcStart))).not.toMatch(/shown\./)
    expect(css).toMatch(/\.panel-feedback \{ position:sticky; top:0;/)
  })
  test('모든 기록 칸에 이동용 번호가 있다', () => {
    // 판독 칸은 공용 칸(RecordFields)이 io.idOf로 번호를 단다(설계 2026-11-10 §9)
    expect(task).toMatch(/idOf: \(id\) => responseInputId\(id\)/)
    expect(task.match(/<NumberField key=\{id\} itemId=\{id\} io=\{listIo\} \/>/g)?.length).toBe(2)
    for (const item of ['radius', 'deviation', 'sum']) expect(task).toContain(`id={responseInputId('${item}')}`)
    expect(task.match(/id=\{responseInputId\('vehicleCondition'\)\}/g)?.length).toBe(2)
  })
  test('서랍이나 기록 창이 열려 있으면 게임 알림을 띄우지 않고, 알림의 칸 이동·고치기는 그 칸의 기록 창을 연다', () => {
    expect(lab).toMatch(/ctx\?\.shown && !drawerOpen && !recording && \(/)
    expect(lab).toMatch(/onFocusItem=\{\(id\) => ctx\?\.openRecordFor\(id\)\} onFix=\{\(id\) => ctx\?\.openRecordFor\(id\)\}/)
  })
  test('계기·측정판을 크게 볼 때, 연습 중, 기록 창이 열렸을 때는 안내 줄을 숨기고, 장비 이름은 괄호 설명을 빼고 쓴다', () => {
    expect(lab).toMatch(/className="g-hud" hidden=\{practicing \|\| viewing \|\| recording\}/)
    expect(lab).toMatch(/근처: \$\{nearIds\.map\(\(id\) => shortLabel\(/)
  })
})
