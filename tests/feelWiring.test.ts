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
