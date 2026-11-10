// 기록 창 연결(설계 2026-11-10): 화면 시험 도구(jsdom)가 없어 배선은 소스로 고정한다(지금 방식)
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'

const read = (p: string) => fs.readFileSync(p, 'utf8')
/** 주석을 뺀 코드(주석 낱말로 시험이 흔들리지 않게) */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

describe('작업 목록 고치기(§6)', () => {
  const task = read('src/screens/TaskScreen.tsx')
  test('다시 확인할 항목 안내는 칸마다 고치기를 넘기고, 패널 안내 상자가 받는다', () => {
    expect(task).toMatch(/fixItems: wrongIds/)
    expect(task).toMatch(/onFix=\{fixItem\}/)
  })
  test('NPC 보완 목록의 응답 줄에 고치기(칸이 열린 것만)', () => {
    expect(task).toMatch(/i\.kind === 'response' && itemOpen\(run, i\.itemId, true\) && <> <button className="link" onClick=\{\(\) => fixItem\(i\.itemId\)\}>고치기<\/button><\/>/)
  })
  test('주석을 뺀 코드에도 고치기 함수가 있다', () => {
    expect(code('src/screens/TaskScreen.tsx')).toMatch(/const fixItem = /)
  })
})

describe('과제 패널의 기록 창(§3)', () => {
  const task = code('src/screens/TaskScreen.tsx')
  test('게임 화면(창 자리 있음)에서만 칸이 빈 단계 시도를 기록 창으로 연다', () => {
    expect(task).toMatch(/if \(recordHost && record !== stepId && res\.reasonCode\?\.startsWith\('NEEDS_RESPONSE_'\)\) return openRecord\(stepId\)/)
  })
  test('창은 게임 화면이 준 자리에 portal로 그리고, 단계 완료는 같은 doStep을 거쳐 끝나면 창을 닫는다', () => {
    expect(task).toMatch(/recordHost && record && createPortal\(/)
    expect(task).toMatch(/<RecordWindow title=\{recordLabel\(task, record\) \?\? '기록'\} onClose=\{requestClose\} onAskAi=\{onAskAi\}/)
    expect(task).toMatch(/<button type="button" className="primary" onClick=\{\(\) => \{ if \(!warnUnsaved\(record\)\) doStep\(record\) \}\}>단계 완료<\/button>/)
    // 아래 줄: 끝낸 단계는 닫기만(다시 완료할 일이 없다), 아직이면 단계 완료
    expect(task).toContain('done(record) ? <button type="button" onClick={requestClose}>닫기</button> : <button type="button" className="primary" onClick={() => { if (!warnUnsaved(record)) doStep(record) }}>단계 완료</button>')
    expect(task).toMatch(/if \(res\.outcome === 'completed'\) \{ setRun\(res\.run\); setShown\(null\); if \(record === stepId\) closeRecord\(\); return \}/)
  })
  test('✕·닫기로 창을 닫아도 다시 확인할 항목 목록은 남긴다(단계 완료 길은 doStep이 먼저 비운다)', () => {
    expect(task).toMatch(/const closeRecord = \(\) => \{ if \(!shown\?\.fixItems\) setShown\(null\); setReview\(false\); setUnsavedWarned\(false\); setRecord\(null\) \}/)
  })
  test('다시 보기는 조건이 사라지면 꺼 둔다(각도가 다시 틀려도 저절로 켜지지 않게). 훅은 조건 없이 return 앞에', () => {
    expect(task).toMatch(/const needles = [^\n]*\n\s*useEffect\(\(\) => \{ if \(!canReview && review\) setReview\(false\) \}, \[canReview, review\]\)/)
  })
  test('창 칸은 작업 목록과 같은 값·제출 함수를 쓰고 id만 다르다. 창 안 안내는 창 칸으로 가고 고치기는 다른 칸 창을 연다', () => {
    expect(task).toMatch(/const recIo: FieldIo = \{ \.\.\.listIo, idOf: recordInputId \}/)
    expect(task).toMatch(/onFocusItem=\{\(id\) => focusRecordField\(document, id\)\} onFix=\{openRecordFor\}/)
    expect(task).toMatch(/revealInBody\(document\.querySelector\('\.g-record \.rec-feedback'\)\)/)
  })
  test('게임 화면에 창 열림과 칸 열기를 알리고, 창 자리가 바뀌면 다시 알린다', () => {
    expect(task).toMatch(/recordOpen: record !== null && recordHost !== null, openRecordFor,/)
    expect(task).toMatch(/gauge\.hold, saveStatus, record, recordHost\]\)/)
  })
  test('고치기: 게임 화면은 기록 창, 그 밖은 칸으로 이동. 칸이 열리지 않았으면 열지 않는다', () => {
    expect(task).toMatch(/const fixItem = \(itemId: string\) => \(recordHost \? openRecordFor\(itemId\) : void focusResponse\(document, itemId\)\)/)
    expect(task).toMatch(/if \(!st \|\| !recordHost \|\| !itemOpen\(run, itemId, true\)\) return/)
    expect(task).toMatch(/if \(st === record\) \{ focusRecordField\(document, itemId\); return \}/)
    expect(task).toMatch(/openRecord\(st, true\)/)
  })
  test('고치기로 다른 창으로 옮길 때 다시 확인할 목록을 남기고, 옮긴 직후엔 안내를 끌어오지 않으며, 장비가 멀면 창을 닫고 이동하라고 알린다', () => {
    expect(task).toMatch(/if \(!keepFixList \|\| !shown\?\.fixItems\) setShown\(null\)/)
    expect(task).toMatch(/if \(record && shown && !switched\) revealInBody/)
    expect(task).toContain('창을 닫고 ${far} 접근점으로 이동한 뒤 다시 누르세요.')
  })
})

describe('3D 장면 걷기 멈춤(§3.3)', () => {
  const scene = read('src/scene/LabScene.tsx')
  test('창이 열리면 가던 길과 이동 요청을 버리고 조이스틱을 무시한다', () => {
    expect(scene).toMatch(/holdStill\?: boolean/)
    expect(scene).toMatch(/if \(holdStill\) \{\n\s+requestRef\.current = null\n\s+if \(pathRef\.current\) \{ pathRef\.current = null; onMove\(posRef\.current, false\) \}/)
    expect(scene).toMatch(/const mag = j && !frozen && !holdStill \? Math\.hypot\(j\.x, j\.y\) : 0/)
    expect(scene).toMatch(/<Walker [^\n]*frozen=\{camBusy\} holdStill=\{holdStill\}/)
  })
  test('학생 모습은 숨기지 않는다(숨김은 대화·확대 때의 frozen만)', () => {
    expect(scene).toMatch(/<group visible=\{!frozen && view !== 'first'\}>/)
  })
})

describe('게임 화면 연결(§3.3·§6)', () => {
  const lab = read('src/screens/LabScreen.tsx')
  test('기록 창 자리를 작업 목록 밖에 두고 과제 패널에 넘긴다(AI 질문은 비기록 모드 제외)', () => {
    expect(lab).toMatch(/<div className="g-recordhost" ref=\{setRecordHost\} \/>/)
    expect(lab).toMatch(/recordHost=\{recordHost\} onAskAi=\{noRecord \? undefined : askAiFromRecord\}/)
    expect(lab.match(/recordHost=\{recordHost\}/g)?.length).toBe(1)
  })
  test('창이 열린 동안 조이스틱·행동 버튼·가운데 버튼·바깥 질문 버튼을 숨기고 3D 장면에 멈춤을 알린다', () => {
    expect(lab).toMatch(/const recording = !!ctx\?\.recordOpen/)
    expect(lab).toMatch(/\{!viewing && !practicing && !recording && <Joystick/)
    expect(lab).toMatch(/\{!ttSide && !recording && <div className="g-actions">/)
    expect(lab).toMatch(/!noRecord && !recording && <button className="g-chatbtn"/)
    expect(lab).toMatch(/holdStill=\{recording\}/)
    expect(lab).toMatch(/joystickRef\.current = \{ x: 0, y: 0 \}/)
    const all = lab.match(/className="g-gaugebtn/g)?.length ?? 0
    expect(all).toBeGreaterThan(0)
    expect(lab.match(/!recording && [^\n]*className="g-gaugebtn/g)?.length).toBe(all)
  })
  test('창이 열리면 교관에게 걷던 걸음·조작 안내가 창 위로 뜨지 않고, 질문 창은 창 위에서 열고 닫으면 창으로 초점이 돌아온다', () => {
    expect(lab).toMatch(/joystickRef\.current = \{ x: 0, y: 0 \}\n\s+setTalkOnArrive\(false\)/)
    expect(lab).toMatch(/guideOpen && !talking && !recording && \(/)
    expect(lab).toMatch(/onClick=\{closeChat\}/)
    expect(lab).toMatch(/if \(recording\) setTimeout\(\(\) => document\.querySelector<HTMLElement>\('\.g-record \.rec-ai'\)/)
  })
  test('창이 열리면 멀리서 누른 교관 말풍선도 닫는다(창을 덮지 않게)', () => {
    expect(code('src/screens/LabScreen.tsx')).toMatch(/if \(recording\) \{\n\s+joystickRef\.current = \{ x: 0, y: 0 \}\n\s+setTalkOnArrive\(false\)\s*\n\s+setNpcOpen\(false\)/)
  })
  test('목록에서 열었으면 창을 닫을 때 목록을 다시 연다', () => {
    expect(lab).toMatch(/if \(drawerOpen\) \{ reopenDrawer\.current = true; setDrawerOpen\(false\) \}/)
    expect(lab).toMatch(/reopenDrawer\.current = false\n\s+setDrawerOpen\(true\)/)
  })
})

describe('창 모양·오래된 크롬(§8)', () => {
  const css = read('src/styles.css')
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '')
  test('층은 게임 부품(4~6) 위, 작업 목록·질문 창(8) 아래', () => {
    expect(css).toMatch(/\.g-recordwrap \{ position:absolute; inset:0; z-index:7;/)
  })
  test('누르기 크기: 닫기 버튼 폭 44px', () => {
    expect(css).toMatch(/\.rec-head \.rec-x \{ width:44px;/)
    expect(css).toMatch(/\.rec-row\.led \.gauge div \{ flex-wrap:wrap;/)
    expect(css).toMatch(/\.g-record label\.radio \{ min-height:44px;/)
    expect(css).toMatch(/\.field label, \.field \.flabel \{ word-break:keep-all; overflow-wrap:break-word; \}/) // 칸 이름이 낱말 가운데서 끊기지 않게(좌측 바퀴 조/향각), 띄어쓰기 없는 긴 이름(최소회전반경(m))은 넘치지 않게
    expect(css).toMatch(/\.g-record \.field \{ grid-template-columns:90px minmax\(0, 1fr\) auto 36px; \}/) // 창 안 표시 칸: '저장'이 두 줄로 쌓이지 않게(기본 24px)
  })
  test('새 화면 높이 단위·:has()·HTML 대화 상자·비활성 속성·form·브라우저 스크롤 함수를 쓰지 않는다', () => {
    expect(cssCode).not.toMatch(/\d(dvh|svh|lvh)\b/)
    expect(cssCode).not.toContain(':has(')
    for (const f of ['src/screens/RecordWindow.tsx', 'src/screens/RecordSheet.tsx', 'src/screens/RecordFields.tsx']) {
      const c = code(f)
      expect(c, f).not.toMatch(/<dialog|\binert\b|<form|scrollIntoView\(/)
    }
  })
})

describe('고친 값 경고(마무리 §3)', () => {
  const task = code('src/screens/TaskScreen.tsx')
  const css = read('src/styles.css')
  test('작업 목록·기록 창 칸 표시는 fieldMark(입력 전이 정오보다 먼저)', () => {
    expect(task).toMatch(/mark: \(id\) => fieldMark\(run, inputs, id\)/)
    expect(task).toMatch(/const mark = \(id: string\) => fieldMark\(run, inputs, id\)\.text/)
    expect(task).toMatch(/const markClass = \(id: string\) => fieldMark\(run, inputs, id\)\.cls/)
  })
  test('창 닫기·단계 완료는 고친 값이 있으면 처음 한 번 멈추고 알린다, 입력을 누르면 경고를 처음으로', () => {
    expect(task).toMatch(/const left = unsavedEdits\(run, inputs, recordItems\(task, stepId\)\)/)
    expect(task).toMatch(/if \(left\.length === 0 \|\| unsavedWarned\) return false/)
    expect(task).toMatch(/const requestClose = \(\) => \{ if \(record && warnUnsaved\(record\)\) return; closeRecord\(\) \}/)
    expect(task).toMatch(/const submit = \(itemId: string\) => \{\n\s+setUnsavedWarned\(false\)/)
  })
  test('표시 칸 36px, 입력 전은 작은 글자 한 줄', () => {
    expect(css).toMatch(/\.field \{ display:grid; grid-template-columns:90px 1fr auto 36px;/)
    expect(css).toMatch(/\.mark\.dirty \{ color:var\(--warn\); font-weight:700; font-size:12px; white-space:nowrap; \}/)
  })
})
