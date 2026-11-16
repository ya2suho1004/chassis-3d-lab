// 도감 창 배선(설계 docs/superpowers/specs/2026-11-16-codex-window-design.md §3-1·§3-2·§3-3): 실습 화면 원본 글로 확인한다.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { HUD_EXCLUDED } from '../src/app/hudLayout'

const read = (p: string) => readFileSync(p, 'utf8')
const lab = read('src/screens/LabScreen.tsx')
const css = read('src/styles.css')

describe('저장: 들어올 때 채우고, 처음 누를 때 더한다', () => {
  test('실습장에 들어올 때 그 코드의 목록으로 도감을 채운다(배치에 없는 번호는 저장 모듈이 버린다). 기록 없이 하기는 읽지 않는다', () => {
    expect(lab).toContain("import { addToCodex, loadCodex } from '../app/codexStore'")
    expect(lab).toContain('const [codex, setCodex] = useState<string[]>(() => (noRecord ? [] : loadCodex(session.anonymousStudentCode, layout.equipment.map((e) => e.id))))')
    expect(lab.match(/loadCodex\(/g)).toHaveLength(1)
    // 배치는 도감 상태보다 먼저 정해진다
    expect(lab.indexOf('const layout = useMemo(')).toBeLessThan(lab.indexOf('const [codex, setCodex]'))
  })
  test('새 장비를 처음 누르면 저장한다. 기록 없이 하기는 쓰지 않는다. 숫자 튐·꼬리표는 지금처럼 새로 등록한 때만', () => {
    expect(lab).toContain("    if (!codex.includes(id)) { setCodex([...codex, id]); if (!noRecord) addToCodex(session.anonymousStudentCode, id); if (!sceneQuiet) fire('codexNew') }")
    expect(lab.match(/addToCodex\(/g)).toHaveLength(1)
  })
  test('저장 결과로 실습을 막지 않는다(돌려준 값을 쓰지 않는다)', () => {
    expect(lab).not.toMatch(/=\s*addToCodex\(|if \(!?addToCodex\(/)
  })
  test('학번을 콘솔에 넣지 않는다', () => {
    expect(lab).not.toMatch(/console\.[a-z]+\([^)]*anonymousStudentCode/)
  })
})

describe('여는 곳', () => {
  test('게임 화면: 이름표 안의 도감 숫자가 버튼이 된다(숫자 튐은 안쪽 글자에 그대로)', () => {
    expect(lab).toContain("<button className=\"g-codexbtn\" aria-haspopup=\"dialog\" disabled={sceneQuiet} onClick={openCodex}><span key={fx.on.codexPop?.seq ?? 'codex'} className={`g-codex ${fx.on.codexPop ? 'pop' : ''}`}>도감 {codex.length}/{layout.equipment.length}</span></button>")
    // 상태 줄은 누름 느낌 구역이다(버튼 누름 느낌만 난다)
    expect(lab).toMatch(/<div className="g-status" data-feel="press">[\s\S]*className="g-codexbtn"/)
  })
  test('기본 화면: 위쪽 줄의 도감 숫자 옆에 "도감 보기"', () => {
    expect(lab).toContain('· 도감 {codex.length}/{layout.equipment.length} <button className="link codex-openbtn" aria-haspopup="dialog" disabled={sceneQuiet} onClick={openCodex}>도감 보기</button>')
  })
  test('가까이 보기·연습·기록 창이 열린 동안(조용한 때)에는 누를 수 없다', () => {
    expect(lab.match(/disabled=\{sceneQuiet\} onClick=\{openCodex\}/g)).toHaveLength(2)
    expect(lab.match(/onClick=\{openCodex\}/g)).toHaveLength(2)
  })
  test('열 때 뒤의 창(메뉴·교관 말풍선·작업 목록·AI 질문 창)을 닫고, 걷던 입력과 교관에게 걸어가던 대화 예약을 거둔다. 화면 상태만 — 사건·과제 진행은 건드리지 않는다', () => {
    expect(lab).toContain('const openCodex = () => {\n    if (sceneQuiet) return\n    joystickRef.current = { x: 0, y: 0 }\n    setTalkOnArrive(false)\n    setMenuOpen(false); setNpcOpen(false); setDrawerOpen(false); setChatOpen(false)\n    setCodexOpen(true)\n  }')
    const body = lab.slice(lab.indexOf('const openCodex = () => {'), lab.indexOf('const closeCodex = '))
    expect(body).not.toMatch(/fire\(|onRunChange|ctx\?*\.|repo\.|gate\.|onFinish/)
    expect(lab).toContain('const closeCodex = () => setCodexOpen(false)')
    expect(lab.indexOf('const sceneQuiet = ')).toBeLessThan(lab.indexOf('const openCodex = '))
  })
})

describe('창', () => {
  test('게임 화면·기본 화면 모두 같은 창을 띄운다(배치 장비 + 모은 번호)', () => {
    const uses = lab.match(/\{codexOpen && <CodexWindow equipment=\{layout\.equipment\} collected=\{codex\} note=\{codexNote\} onClose=\{closeCodex\} \/>\}/g)
    expect(uses).toHaveLength(2)
    expect(lab).toContain("import { CodexWindow } from './CodexWindow'")
  })
  test('저장 방식 안내: 기록 없이 하기는 저장하지 않는다고, 아니면 이 기기에만', () => {
    expect(lab).toContain("const codexNote = noRecord ? '기록 없이 하기라서 도감을 저장하지 않습니다(이번에만 모읍니다).' : '이 기기에만 남고 연구 기록·서버에는 보내지 않습니다.'")
  })
  test('열린 동안 조작 안내 카드를 숨긴다(닫지는 않는다 — 도감을 닫으면 다시 보인다)', () => {
    expect(lab).toMatch(/\{loadedOnce && guideOpen && !talking && !recording && !codexOpen && \(/)
    for (const line of lab.split('\n').filter((l) => /codexOpen|openCodex|closeCodex/.test(l))) expect(line).not.toMatch(/setGuideOpen|closeGuide/)
  })
  test('열린 동안 조이스틱을 그리지 않는다(화살표·W·A·S·D를 가로채지 않아 카드 목록을 키보드로 내려 볼 수 있다)', () => {
    expect(lab).toMatch(/\{!viewing && !practicing && !recording && !codexOpen && <Joystick input=\{joystickRef\} \/>\}/)
    expect(lab.match(/<Joystick /g)).toHaveLength(1)
  })
  test('열린 동안 뒤 장면의 캐릭터는 키보드로도 걷지 않는다', () => {
    expect(lab).toContain('holdStill={recording || codexOpen}')
  })
  test('창을 열고 닫는 함수와 상태는 사건(fire)·기록(repo·onRunChange)에 닿지 않는다', () => {
    for (const line of lab.split('\n').filter((l) => /codexOpen|openCodex|closeCodex/.test(l))) {
      expect(line).not.toMatch(/fire\(|repo\.|onRunChange|sound\./)
    }
  })
})

describe('겉모습', () => {
  test('창 바탕은 화면에 고정되어 게임 화면·기본 화면 모두를 덮고, 작업 목록·질문 창·교관 대화보다 위', () => {
    expect(css).toMatch(/\.codex-wrap \{[^}]*position:fixed; inset:0; z-index:10;/)
  })
  test('기본 화면의 3D 이름표(drei Html, 아주 큰 z-index)가 도감 창 위로 올라오지 않게 장면 틀 안에 가둔다(게임 화면 .g-canvas와 같은 방식)', () => {
    expect(css).toMatch(/\.canvaswrap \{[^}]*isolation:isolate/)
    expect(css).toMatch(/\.game \.g-canvas \{[^}]*isolation:isolate/)
  })
  test('카드 줄은 좁은 폭에서도 가로로 넘치지 않는다(칸 최소 폭이 창 폭을 넘지 않고, 긴 낱말도 끊긴다)', () => {
    expect(css).toMatch(/\.codex-list \{[^}]*grid-template-columns:repeat\(auto-fill, minmax\(min\(220px, 100%\), 1fr\)\)/)
    expect(css).toMatch(/\.codex-text \{[^}]*min-width:0/)
    expect(css).toMatch(/\.codex-card \{[^}]*overflow-wrap:anywhere/)
    expect(css).toMatch(/\.codex-win \{[^}]*width:min\(760px, 100%\)/)
  })
  test('누름 대상은 손가락 크기: 닫기 44px, 도감 버튼은 보이지 않는 누름 영역으로 넓힌다', () => {
    expect(css).toMatch(/\.codex-x \{[^}]*width:44px; min-height:44px/)
    expect(css).toMatch(/\.g-codexbtn::after \{[^}]*position:absolute; inset:-10px -5px/)
  })
  test('움직임 줄이기에서는 창이 뜨는 움직임이 없다', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce) { .codex-win { animation:none } }')
  })
  test('도감 버튼의 덧칠 영역은 겹침 측정에서 빼는 이유가 적혀 있다', () => {
    expect(HUD_EXCLUDED['.g-codexbtn::after']).toBeDefined()
    expect(HUD_EXCLUDED['.codex-wrap']).toBeDefined()
  })
})
