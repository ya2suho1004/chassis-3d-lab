// tests/feelWiring.test.ts — 손맛 배선(설계 2026-11-12 §4.2·§4.7·§5): 소리와 반응이 정해진 길로만 나는지 원본 글로 확인한다
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const app = read('src/App.tsx')
const lab = read('src/screens/LabScreen.tsx')

describe('소리 엔진과 켬 상태는 앱이 갖는다(실습 화면 → 결과 화면까지 이어지게)', () => {
  test('엔진은 앱에서 한 번만 만든다', () => {
    expect(app).toContain("import { LabSound } from './scene/sound'")
    expect(app.match(/new LabSound\(\)/g)).toHaveLength(1)
    expect(app).toContain('const sound = useMemo(() => new LabSound(), [])')
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
    expect(app).not.toMatch(/localStorage[^\n]*sound/i)
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
    expect(lab).toContain("    setSelectedId(id)\n    if (!id) return\n    const e = layout.equipment.find((x) => x.id === id)\n    fire('sceneTap', e ? tapSpotOf(e) : undefined)")
    expect(lab).toContain("const tapNpc = () => fire('sceneTap', { x: layout.npc.x, z: layout.npc.z, r: NPC_TAP_RADIUS })")
    expect(lab).toContain('onNpcTap={() => { tapNpc(); if (!gate.closed) setNpcOpen(true) }}')
    expect(lab).toContain('if (aimId === NPC_AIM) { tapNpc(); setNpcOpen(true) } else selectEquipment(aimId)')
    // 기본 화면의 장면에서도 같다(소리는 꺼져 있어 고리만 뜬다)
    expect(lab).toContain('onNpcTap={() => { tapNpc(); setNpcOpen(true) }}')
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
    expect(lab).toContain("<main className={`game wa ${talking ? 'talking' : ''}`} onClickCapture={(e) => { if (isPressTarget(e.target as Element)) fire('uiPress') }}>")
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
    expect(lab).toContain("    if (!codex.includes(id)) { setCodex([...codex, id]); fire('codexNew') }")
    expect(lab.match(/fire\('codexNew'\)/g)).toHaveLength(1)
  })
  test('도감 숫자는 처음 누른 장비일 때 튄다(끄는 것은 연출 수명이 맡는다)', () => {
    expect(lab).toContain("<span key={fx.on.codexPop?.seq ?? 'codex'} className={`g-codex ${fx.on.codexPop ? 'pop' : ''}`}>도감 {codex.length}/{layout.equipment.length}</span>")
  })
  test("'도감에 등록' 꼬리표는 둘러보기에서, 방금 등록한 그 장비의 카드에만 붙는다. 1.6초 뒤 사라지는 것은 연출 수명이 맡는다(움직임 줄이기에서도 같다)", () => {
    expect(lab).toContain("{fx.on.codexChip && !run && codex[codex.length - 1] === selected.id && <span key={fx.on.codexChip.seq} className=\"g-chip\" role=\"status\">도감에 등록</span>}")
    expect(read('src/app/cozyState.ts')).toContain('codexChip: 1600')
  })
  test('움직임 줄이기에서는 숫자 튐과 꼬리표의 움직임이 없다', () => {
    expect(read('src/styles.css')).toContain('@media (prefers-reduced-motion: reduce) { .g-codex.pop, .g-chip { animation:none } }')
  })
})
