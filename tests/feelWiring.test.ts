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
