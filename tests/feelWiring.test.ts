// tests/feelWiring.test.ts — 손맛 배선(설계 2026-11-12 §4.2·§4.7·§5): 소리와 반응이 정해진 길로만 나는지 원본 글로 확인한다
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const app = read('src/App.tsx')
const lab = read('src/screens/LabScreen.tsx')

describe('소리 엔진과 켬 상태는 앱이 갖는다(실습 화면 → 결과 화면까지 이어지게)', () => {
  test('엔진은 앱에서 한 번만 만든다', () => {
    expect(app).toContain("import { LabSound } from './scene/sound'")
    expect(app.match(/new LabSound\(\)/g)).toHaveLength(1)
    // 엔진은 장치와 타이머를 가진 객체라 useMemo(값을 버릴 수 있다)가 아니라 useState의 처음 값으로 한 번만 만든다
    expect(app).toContain('const [sound] = useState(() => new LabSound())')
    expect(lab).not.toMatch(/new LabSound\(/)
    expect(lab).toContain("import type { LabSound } from '../scene/sound'")
  })
  test('켜기·끄기는 엔진과 화면 상태를 함께 바꾼다(누른 그 순간에 엔진을 켜야 브라우저가 소리를 허락한다). 화면의 켬 표시는 엔진을 따른다(장치를 못 만들면 켜지지 않는다)', () => {
    expect(app).toContain('const changeSound = useCallback((on: boolean) => { sound.setEnabled(on); setSoundOn(sound.enabled) }, [sound])')
  })
  test('새 수행은 늘 꺼진 채 시작한다: 실습 화면·결과 화면이 아니면 끈다', () => {
    expect(app).toContain("const inRun = screen.name === 'lab' || screen.name === 'result'")
    expect(app).toContain('useEffect(() => { if (!inRun) changeSound(false) }, [inRun, changeSound])')
    expect(app).toMatch(/const \[soundOn, setSoundOn\] = useState\(false\)/)
    // 켬 상태는 기기에 저장하지 않는다: 엔진은 저장소를 건드리지 않고, 앱에서 soundOn은 상태 선언과 실습 화면에 넘기는 속성에만 나온다
    expect(read('src/scene/sound.ts')).not.toMatch(/localStorage|sessionStorage|indexedDB/)
    expect(app.match(/\bsoundOn\b/g)).toHaveLength(3)
  })
  test('화면이 가려지면(다른 앱·탭으로 가거나 화면이 꺼지면) 소리를 끄고, 돌아와도 꺼진 채로 둔다 — 뒤로 보낸 태블릿이 교실에서 소리를 내지 않게', () => {
    expect(app).toContain("    const onHide = () => { if (document.hidden) changeSound(false) }\n    document.addEventListener('visibilitychange', onHide)\n    return () => document.removeEventListener('visibilitychange', onHide)\n  }, [changeSound])")
    expect(app).not.toMatch(/visibilitychange[\s\S]{0,200}changeSound\(true\)/) // 돌아왔다고 다시 켜지 않는다
  })
  test('실습 화면에 엔진·상태·바꾸는 함수를 넘긴다', () => {
    expect(app).toMatch(/<LabScreen\n\s+sound=\{sound\} soundOn=\{soundOn\} onSoundChange=\{changeSound\}/)
    expect(lab).toMatch(/sound: LabSound\n\s+soundOn: boolean\n\s+onSoundChange: \(on: boolean\) => void/)
    expect(lab).toContain('const toggleSound = () => onSoundChange(!soundOn)')
  })
  test('실습 화면을 떠날 때 소리를 끄지 않는다(결과 화면의 도장 소리까지 이어진다). 이어지는 소리만 멈춘다', () => {
    expect(lab).not.toMatch(/sound\.setEnabled\(/)
    expect(lab).toContain('useEffect(() => { sound.setAmbience(true); return () => { sound.setAmbience(false); sound.setRollers(false) } }, [sound])')
  })
})

describe('사건은 한 곳(fire)에서 낸다', () => {
  test('fire: 이미 일어난 일(사건) → 규칙표 → 소리와 화면 연출', () => {
    expect(lab).toMatch(/const fire = useCallback\(\(ev: ReactionEvent/)
    expect(lab).toContain('const r = reactionsFor(ev, { reducedMotion: prefersReducedMotion(), sound: sound.enabled })\n    for (const c of r.cues) sound.play(c.name, c.delay)')
  })
  test('규칙표를 읽는 곳도, 한 번 나는 소리를 부르는 곳도 fire 하나뿐이다(발소리는 걸음 수로 따로 센다)', () => {
    expect(lab.match(/reactionsFor\(/g)).toHaveLength(1)
    expect(lab.match(/sound\.play\(/g)).toHaveLength(1)
    expect(lab.match(/sound\.step\(/g)).toHaveLength(1)
  })
  test('끝난 단계의 사건을 fire로 낸다', () => {
    expect(lab).toContain('for (const ev of eventsForStep(step, advanced)) fire(ev)')
  })
})

describe('장비 움직임의 소리', () => {
  test('제동 장치 모습의 앞뒤를 견주어 사건을 낸다. 과제가 없으면 앞 모습을 비운다', () => {
    expect(lab).toContain('    if (!run) { rigPrev.current = null; return }\n    const evs = rigEvents(rigPrev.current, rig)\n    rigPrev.current = rig\n    for (const ev of evs) fire(ev)')
  })
  test('롤러 회전음은 사건이 아니라 상태를 따른다(도는 도중에 소리를 켜도 난다)', () => {
    expect(lab).toContain('useEffect(() => { sound.setRollers(rig.rollersSpinning) }, [sound, rig.rollersSpinning])')
  })
  test('보기용 리프트를 올리거나 내리면 사건을 낸다', () => {
    expect(lab).toMatch(/const toggleLift = \(id: string\) => \{ setRaisedLifts\([^\n]+\); fire\('bigLiftMove'\) \}/)
    // fire를 쓰는 함수는 fire보다 아래에 둔다(선언하기 전에 불리는 일이 없게)
    expect(lab.indexOf('const toggleLift = ')).toBeGreaterThan(lab.indexOf('const fire = useCallback('))
  })
})

describe('소리가 나는 화면', () => {
  test('게임 화면(3D)을 벗어나면 소리를 끈다(기본 화면·도식 모드에는 소리 버튼이 없다)', () => {
    expect(lab).toContain('useEffect(() => { if (!gameUi && soundOn) onSoundChange(false) }, [gameUi, soundOn, onSoundChange])')
  })
})

describe('누름 고리(설계 §4.3)', () => {
  const scene = read('src/scene/LabScene.tsx')
  const ring = read('src/scene/feel/TapRing.tsx')
  /** 고리 부품이 화면마다 하는 일 */
  const frame = ring.slice(ring.indexOf('useFrame('), ring.indexOf('return <mesh'))
  test('장비를 고르면 그 자리에서, 교관을 누르면 교관 자리에서 장면 누름 사건을 낸다. 고르기를 풀 때는 내지 않는다', () => {
    expect(lab).toContain("    setSelectedId(id)\n    if (!id) return\n    const e = layout.equipment.find((x) => x.id === id)\n    if (!sceneQuiet) fire('sceneTap', e ? tapSpotOf(e) : undefined)")
    expect(lab).toContain("const tapNpc = () => { if (!sceneQuiet) fire('sceneTap', { x: layout.npc.x, z: layout.npc.z, r: NPC_TAP_RADIUS }) }")
    expect(lab).toContain('onNpcTap={() => { tapNpc(); if (!gate.closed) setNpcOpen(true) }}')
    expect(lab).toContain('if (aimId === NPC_AIM) { tapNpc(); setNpcOpen(true) } else selectEquipment(aimId)')
    // 기본 화면의 장면에서도 같다(소리는 꺼져 있어 고리만 뜬다)
    expect(lab).toContain('onNpcTap={() => { tapNpc(); setNpcOpen(true) }}')
  })
  test('가까이 보기·연습·기록 창이 열린 동안에는 장면 누름에 반응하지 않는다(고리도 소리도 도감 반응도 없다 — 답을 읽고 적는 곳은 조용하다, 설계 §5-3·§5-9). 고르기와 도감 등록은 그대로 한다', () => {
    expect(lab).toContain('const sceneQuiet = viewing || practicing || recording')
    expect(lab.match(/fire\('sceneTap'/g)).toHaveLength(2)
    expect(lab.match(/if \(!sceneQuiet\) fire\('sceneTap'/g)).toHaveLength(2)
    expect(lab).toContain("    if (!codex.includes(id)) { setCodex([...codex, id]); if (!sceneQuiet) fire('codexNew') }")
    // 그 값들은 장비 선택 함수보다 먼저 정해진다
    for (const name of ['const viewing = ', 'const practicing = ', 'const recording = ']) expect(lab.indexOf(name), name).toBeLessThan(lab.indexOf('const sceneQuiet = '))
    expect(lab.indexOf('const sceneQuiet = ')).toBeLessThan(lab.indexOf('const selectEquipment = '))
  })
  test('fire는 규칙표가 고리를 내라고 할 때만 고리를 보낸다(움직임 줄이기면 없다). 고리는 장면으로 가고, CSS 연출 상태는 고리를 담지 않는다(tests/cozyState.test.ts)', () => {
    // 시각은 상태 갱신 함수 밖에서 읽고, fire는 엔진만 따른다
    expect(lab).toContain("    if (at && r.effects.includes('tapRing')) setTapPulse((p) => nextPulse(p, at))\n    const now = performance.now() // 상태 갱신 함수 안에서 시각을 읽지 않는다(갱신 함수는 두 번 돌 수 있다)\n    setFx((f) => addEffects(f, r.effects, now))\n  }, [sound])")
    expect(lab.match(/ tapPulse=\{tapPulse\}/g)).toHaveLength(2)
  })
  test('장면에는 고리가 하나만 있다', () => {
    expect(scene).toContain('<TapRing pulse={tapPulse} />')
    expect(scene.match(/<TapRing /g)).toHaveLength(1)
  })
  test('고리의 모양과 재질은 한 번만 만들고, 매 화면에는 값만 바꾼다(걷는 동안 새로 만드는 것이 없게)', () => {
    expect(ring).toMatch(/const parts = useMemo\(\(\) => \(\{\n[\s\S]+?\n  \}\), \[\]\)/)
    expect(ring.match(/new THREE\./g)).toHaveLength(2)
    expect(frame).not.toMatch(/new |useMemo|useState/)
    expect(ring).toContain('useEffect(() => () => { parts.geo.dispose(); parts.mat.dispose() }, [parts])')
  })
  test('고리는 이 부품이 장면에 붙은 뒤의 누름에만 뜬다 — 화면을 바꿨다 돌아와도 예전 고리가 다시 뜨지 않는다(계산은 tests/tapPulse.test.ts)', () => {
    expect(ring).toContain('const [run] = useState(() => ringRunFrom(pulse))')
    expect(frame).toContain('const k = advanceRing(run, pulse, clock.elapsedTime)')
    // 효과는 버릴 때의 정리 하나뿐이다. 누름 번호를 효과로 받으면 붙는 순간의 번호에도 고리가 뜬다
    expect(ring.match(/useEffect\(/g)).toHaveLength(1)
  })
  test('고리는 흰색이고 색 보정·깊이 기록에서 빠진다(주황은 선택, 노랑은 가까움, 파랑은 목적지라서 흰색을 쓴다)', () => {
    expect(ring).toContain("new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false })")
  })
})

describe('버튼 누름 소리의 허용 구역(설계 §4.1)', () => {
  const npc = read('src/screens/NpcDialog.tsx')
  test("게임 화면 맨 위에서 누름을 한 번만 듣고, 허용 구역의 버튼이면 'uiPress'를 낸다", () => {
    expect(lab).toContain("<main className={`game wa ${talking ? 'talking' : ''}`} onClickCapture={(e) => { if (isPressTarget(e.target instanceof Element ? e.target : null)) fire('uiPress') }}>")
    expect(lab.match(/fire\('uiPress'\)/g)).toHaveLength(1)
  })
  test('소리가 나는 곳: 상태 막대와 메뉴, 의뢰 패널의 버튼, 장비 정보 카드, 작업 버튼, 작업 목록의 닫기 버튼, 여는 버튼 다섯, 교관 대화', () => {
    for (const s of [
      '<div className="g-status" data-feel="press">',
      '<div className="g-quest-btns" data-feel="press">',
      '<div className="g-info" data-feel="press">',
      '<div className="g-actions" data-feel="press">',
      '<button className="g-x" data-feel="press" aria-label="작업 목록 닫기" onClick={() => setDrawerOpen(false)}>✕</button>',
      '<button className="g-gaugebtn" data-feel="press" onClick={() => setCloseUp(true)}>',
      '<button className="g-gaugebtn" data-feel="press" onClick={() => setTtSide(\'left\')}>',
      '<button className="g-gaugebtn" data-feel="press" onClick={() => { setDiscOpen(true); setDiscMsg(null) }}>',
      '<button className="g-gaugebtn" data-feel="press" onClick={() => { setBlOpen(true); setBlMsg(null) }}>',
      '<button className="g-chatbtn" data-feel="press" onClick={() => setChatOpen(true)}>',
    ]) expect(lab, s).toContain(s)
    expect(lab.match(/data-feel="press"/g)).toHaveLength(10)
    expect(npc).toContain('<div className="g-dialog" role="dialog" aria-label="교관과 대화" data-feel="press">')
  })
  test('표시(data-feel)를 다는 파일은 실습 화면·교관 대화·과제 패널 셋뿐이다(판정 파일은 표시의 이름만 안다). 다른 화면에 표시가 붙으면 여기서 걸린다', () => {
    const found: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`
        if (e.isDirectory()) walk(p)
        else if (/\.(ts|tsx|css)$/.test(e.name) && read(p).includes('data-feel')) found.push(p)
      }
    }
    walk('src')
    expect(found.sort()).toEqual(['src/app/feelZones.ts', 'src/screens/LabScreen.tsx', 'src/screens/NpcDialog.tsx', 'src/screens/TaskScreen.tsx'])
  })
  test('소리 버튼은 허용 구역 안에 있어도 조용하다(켜졌다는 확인음은 엔진이 한 번 낸다. 끌 때는 소리가 없다)', () => {
    expect(lab).toMatch(/<button className="g-icon" data-feel="none" aria-label=\{soundOn \? '소리 끄기' : '소리 켜기'\}/)
    expect(lab.match(/data-feel="none"/g)).toHaveLength(1)
  })
  test('작업 목록 서랍은 통째로 허용 구역이 아니다: 단계 줄(수행·힌트 버튼)만 소리가 나고, 같은 서랍의 판독·기록 칸과 계산기는 조용하다(답을 적고 내는 곳 — 설계 §5-3)', () => {
    const task = read('src/screens/TaskScreen.tsx')
    expect(lab).toContain("<aside className={`g-drawer ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}>")
    expect(task).toContain('<section className="card" data-feel="press">\n          <h2>검사 작업 순서</h2>')
    expect(task.match(/data-feel/g)).toHaveLength(1)
  })
  test('조용한 곳: 기록 창, 계산기, 기록 칸, 질문 창, 알림창에는 표시가 없다', () => {
    for (const f of ['RecordWindow', 'RecordSheet', 'RecordFields', 'RecordCheck', 'Calculator', 'FeedbackBox']) expect(read(`src/screens/${f}.tsx`), f).not.toContain('data-feel')
    expect(read('src/chat/ChatPanel.tsx')).not.toContain('data-feel')
  })
  test('조용한 곳: 연습 창, 측정판 보기 막대, 계기 닫기, 알림, 조작 안내에는 표시가 없다', () => {
    for (const s of ['className="g-practice"', 'className="g-ttbar"', 'className="g-gaugebtn on"', 'className="g-guide"', 'className={`g-toast']) {
      const line = lab.split('\n').find((l) => l.includes(s))
      expect(line, s).toBeDefined()
      expect(line!.slice(line!.indexOf(s), line!.indexOf(s) + s.length + 60), s).not.toContain('data-feel')
    }
  })
})

describe('도감(설계 §4.1·§4.3)', () => {
  test("처음 누른 장비면 'codexNew'를 낸다", () => {
    expect(lab).toContain("{ setCodex([...codex, id]); if (!sceneQuiet) fire('codexNew') }")
    expect(lab.match(/fire\('codexNew'\)/g)).toHaveLength(1)
  })
  test('도감 숫자는 처음 누른 장비일 때 튄다(끄는 것은 연출 수명이 맡는다)', () => {
    expect(lab).toContain("<span key={fx.on.codexPop?.seq ?? 'codex'} className={`g-codex ${fx.on.codexPop ? 'pop' : ''}`}>도감 {codex.length}/{layout.equipment.length}</span>")
  })
  test("'도감에 등록' 꼬리표는 둘러보기에서, 방금 등록한 그 장비의 카드에만 붙는다. 1.6초 뒤 사라지는 것은 연출 수명이 맡는다(움직임 줄이기에서도 같다)", () => {
    expect(lab).toContain("const chipOn = !!fx.on.codexChip && !run && !!selected && codex[codex.length - 1] === selected.id")
    expect(lab).toContain("{chipOn && <span key={fx.on.codexChip?.seq} className=\"g-chip\" aria-hidden=\"true\">도감에 등록</span>}")
    // 낭독용 알림 칸(role="status")은 상태 막대에 늘 있고 글자만 들어왔다 나간다 — 카드와 함께 새로 붙는 알림 칸은 화면 낭독기가 읽지 않는 일이 많다
    expect(lab).toContain("<span className=\"sr-only\" role=\"status\">{chipOn ? '도감에 등록' : ''}</span>")
    expect(lab).not.toMatch(/className="g-chip"[^>]*role="status"/) // 꼬리표 자신은 알림 칸이 아니다(보이기만 한다)
    expect(read('src/app/cozyState.ts')).toContain('codexChip: 1600')
  })
  test('움직임 줄이기에서는 숫자 튐과 꼬리표의 움직임이 없다', () => {
    expect(read('src/styles.css')).toContain('@media (prefers-reduced-motion: reduce) { .g-codex.pop, .g-chip { animation:none } }')
  })
})

describe('목적지 표식(설계 §4.5) — 안내 있음에서만', () => {
  const scene = read('src/scene/LabScene.tsx')
  const beacon = read('src/scene/feel/GoalBeacon.tsx')
  const css = read('src/styles.css')
  test('실습 화면은 표식에 쓸 장비를 nextHighlightId에서만 얻는다(안내 없음·시간 제한 평가·둘러보기에서는 값이 없다)', () => {
    expect(lab).toContain('const requiredNow = nextHighlightId(run)')
    expect(lab.match(/highlightIds=\{requiredNow \? \[requiredNow\] : \[\]\}/g)).toHaveLength(2)
    expect(lab.match(/highlightIds=/g)).toHaveLength(2)
  })
  test('장면은 그 값으로만 표식을 붙인다. 값이 없으면 표식 물체가 장면에 없다', () => {
    expect(scene).toContain('const goalId = highlightIds[0] ?? null')
    expect(scene).toContain('const goal = useMemo(() => goalSpotOf(layout.equipment, goalId), [layout, goalId])')
    expect(scene).toContain('{goal && <GoalBeacon x={goal.x} z={goal.z} w={goal.w} d={goal.d} h={goal.h} hidden={camBusy} arrow={goalArrow} track={arrowTrack} />}')
    expect(scene.match(/<GoalBeacon /g)).toHaveLength(1)
  })
  test('파랑은 목적지 표식에만 쓴다: 예전 파란 바닥 테두리를 떼고, 시험기 선택 테두리는 다른 장비처럼 주황', () => {
    expect(scene).not.toContain('#2d6cdf')
    expect(scene).toContain('{selected && <FootprintFrame w={w} d={d} color="#ff9800" />}')
    expect(scene).toContain('{testerSelected && <FootprintFrame w={tester.w} d={tester.d} color="#ff9800" />}')
    expect(scene).toContain('testerSelected={selectedId === tester.id}')
    expect(scene).not.toContain('testerHighlight')
    expect(beacon).toContain("const GOAL_COLOR = '#2d6cdf'")
  })
  test('가까이 보기 중에는 표식과 화살표를 숨긴다(눈금을 가리지 않게)', () => {
    expect(beacon).toContain('<group name="goalBeacon" position={[x, 0, z]} visible={!hidden}>')
    expect(beacon).toContain('if (hidden || !tr) { hideArrow(el); last.current = null; return }')
    expect(beacon).toContain("const hideArrow = (el: HTMLDivElement): void => { if (el.style.visibility !== 'hidden') { el.style.opacity = '0'; el.style.visibility = 'hidden' } }")
  })
  test('표식의 부품은 미리 만들어 두고 매 화면에는 값만 바꾼다. 바닥 테두리 도형만 목적지 크기가 바뀔 때 새로 만들고 앞의 것은 버린다', () => {
    expect(beacon).toMatch(/const fixed = useMemo\(\(\) => \(\{\n[\s\S]+?\n  \}\), \[\]\)/)
    expect(beacon).toMatch(/const frameGeo = useMemo\(\(\) => \{\n[\s\S]+?\n  \}, \[w, d\]\)/)
    expect(beacon).toContain('useEffect(() => () => frameGeo.dispose(), [frameGeo])')
    expect(beacon).toContain('useEffect(() => () => { for (const p of Object.values(fixed)) p.dispose() }, [fixed])')
    const frame = beacon.slice(beacon.indexOf('useFrame('), beacon.indexOf('return ('))
    expect(frame).not.toMatch(/new THREE|useMemo|useState/)
    expect(frame).not.toMatch(/placeEdgeArrow\(\{/) // 화면 좌표를 담는 그릇도 화면마다 새로 만들지 않는다
  })
  test('표식은 색 보정·그림자·깊이 기록에서 빠진다(그림자를 만들지도 받지도 않는다)', () => {
    expect(beacon.match(/toneMapped: false/g)).toHaveLength(4)
    expect(beacon).not.toMatch(/castShadow|receiveShadow/)
  })
  test('움직임 줄이기에서는 표식이 멈춰 있다', () => {
    expect(beacon).toContain('const still = prefersReducedMotion()')
    expect(beacon).toMatch(/still \? /)
  })
  test('방향 화살표: 게임 화면이 요소와 띠를 주고, 3D의 매 화면에는 모양 값만 바꾼다(React 상태를 쓰지 않는다)', () => {
    expect(lab).toContain('const goalArrow = useRef<HTMLDivElement>(null)')
    expect(lab).toContain('const arrowTrack = useRef<ArrowTrack | null>(null)')
    expect(lab).toContain('goalArrow={goalArrow} arrowTrack={arrowTrack}')
    expect(lab.match(/goalArrow=\{goalArrow\}/g)).toHaveLength(1) // 게임 화면에서만. 기본 화면에는 "다음 단계 장비로 이동" 글이 있다
    expect(beacon).toContain('el.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) translate(-50%, -50%) rotate(${a.angle.toFixed(3)}rad)`')
    // 앞 화면의 자리를 이어받는다: 경계에서 깜빡이거나 가운데 요소의 양 끝을 오가지 않게(계산은 tests/edgeArrow.test.ts)
    expect(beacon).toContain('const a = placeEdgeArrow(probe, tr, last.current)\n    last.current = a')
    expect(beacon).toContain('if (!el) { last.current = null; return }')
    expect(beacon).toContain('useEffect(() => { last.current = null }, [x, z])') // 목적지가 바뀌면 비운다
  })
  test('화살표는 걷기 조작이 되는 상태에서만 그린다(대화·가까이 보기·연습·기록 창·작업 목록·질문 창에서는 없다). 누를 수 없고 낭독에서 뺀다', () => {
    expect(lab).toContain('{requiredNow && !talking && !viewing && !practicing && !recording && !drawerOpen && !chatOpen && <div ref={goalArrow} className="g-goalarrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 4l15 8-15 8 4-8z" fill="currentColor" /></svg></div>}')
    expect(css).toMatch(/\.g-goalarrow \{[^}]*pointer-events:none; visibility:hidden; opacity:0;[^}]*\}/)
    expect(css).toMatch(/\.g-goalarrow \{[^}]*z-index:3;[^}]*\}/) // 캔버스(0) 위, HUD(4 이상) 아래
  })
  test('띠는 화살표가 그려져 있을 때, 화면을 다시 그릴 때와 창 크기가 바뀔 때만 잰다. 함께 떠 있는 HUD 부품을 재고 화살표 자신은 뺀다', () => {
    expect(lab).toContain('useLayoutEffect(() => { arrowTrack.current = measureTrack(goalArrow.current?.parentElement ?? null) })')
    expect(lab).toMatch(/window\.addEventListener\('resize', on\)/)
    const fn = lab.slice(lab.indexOf('function measureTrack('), lab.indexOf('export function LabScreen('))
    expect(fn).toContain('const boxes = hudBoxes(root).filter((b) => b.name !== ARROW_PART_NAME).map((b) => ({ x0: b.left - r.left, y0: b.top - r.top, x1: b.right - r.left, y1: b.bottom - r.top }))')
    expect(fn).toContain('return buildTrack({ w: r.width, h: r.height }, boxes)')
  })
})
