// tests/locomotionWiring.test.ts — 걷기 다듬기 연결(설계 2026-11-13 캐릭터와 움직임 §6): Walker·Avatar가 순수 함수를 쓰는지, 프레임마다 새 객체·React 상태를 만들지 않는지 원본 글로 확인한다
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const scene = readFileSync('src/scene/LabScene.tsx', 'utf8')
const model = readFileSync('src/scene/models/CharacterModel.tsx', 'utf8')
const walker = scene.slice(scene.indexOf('function Walker('), scene.indexOf('export function LabScene('))
const walkerFrame = walker.slice(walker.indexOf('useFrame((_, dt) => {'), walker.indexOf('useEffect(() => { onMove(start, false) }'))
const avatar = scene.slice(scene.indexOf('function Avatar('), scene.indexOf('const NPC_FACING'))
const avatarFrame = avatar.slice(avatar.indexOf('useFrame('), avatar.indexOf('const code ='))

describe('Walker는 순수 함수로 속도와 경로를 정한다', () => {
  test('최고 속도는 locomotion.ts 한 곳에만 있다(장면은 속도 계산을 locomotion.ts에서 가져온다)', () => {
    expect(scene).not.toMatch(/WALK_SPEED\s*=/)
    expect(scene).not.toMatch(/WALK_SPEED[^\n]*\* (k|Math\.min\(1, mag\))/)
    expect(scene).toMatch(/import \{[^}]*\bapproachSpeed\b[^}]*\bpathSpeed\b[^}]*\bwalkPlayback\b[^}]*\} from '\.\/locomotion'/)
  })
  test('조이스틱은 목표 속도로 가속·감속하고, 경로는 남은 거리로 도착 감속한다(모션 줄이기 설정을 넘긴다)', () => {
    expect(walkerFrame).toContain('approachSpeed(speed.current, stickTargetSpeed(mag), dt, prefersReducedMotion)')
    expect(walkerFrame).toContain('pathSpeed(speed.current, pathRemaining(posRef.current, pathRef.current, idxRef.current), dt, prefersReducedMotion)')
    expect(walkerFrame).toMatch(/advanceAlongPath\(posRef\.current, pathRef\.current, idxRef\.current, speed\.current, Math\.min\(dt, 0\.1\)\)/)
  })
  test('걷기·서기는 현재 속도로 판정한다(떨림 방지)', () => {
    expect(walkerFrame).toContain('const was = walkingRef.current')
    expect(walkerFrame).toContain('const now = nextWalking(was, speed.current)')
    expect(walkerFrame).toContain('if (now !== was) { walkingRef.current = now; setWalking(now) }')
  })
  test('바닥 누르기·장비로 걸어가기 경로는 다듬은 뒤 따라간다', () => {
    expect(walkerFrame).toContain('const found = findPath(grid, posRef.current, target)')
    // 지금 서 있는 자리에서 곧게 갈 수 있으면 칸 가운데를 거치지 않고 바로 출발한다
    expect(walkerFrame).toContain('const path = found && smoothPath(grid, found, posRef.current)')
  })
  test('서 있는 자리가 곧 목적지면 경로를 바로 끝내고 도착을 한 번 알린다(프레임 끝의 알림이 맡는다)', () => {
    expect(walkerFrame).toContain('if (path && pathArrived(posRef.current, path, 0)) { pathRef.current = null; speed.current = 0; unreported.current = true }')
    expect(walkerFrame).toContain('} else if (was || (unreported.current && speed.current === 0)) {')
  })
  test('발소리 보폭은 체형 배율을 걷기 재생 속도와 똑같이 곱한다', () => {
    expect(walkerFrame).toContain('stepsCrossed(walked.current, walked.current + moved, STEP_STRIDE * bodyScale(look.body))')
  })
  test('몸짓이 시작되면 그 자리에 서고(속도 0), 몸짓은 이번 프레임의 걷기 판정으로만 그친다', () => {
    const cueEffect = walker.slice(walker.indexOf('useEffect(() => {\n    if (!cue) return'), walker.indexOf('}, [cue?.seq])'))
    expect(cueEffect).toContain('speed.current = 0')
    const judged = walkerFrame.indexOf('const now = nextWalking(was, speed.current)')
    const cut = walkerFrame.indexOf('if (shotLeft.current <= 0 || now) { shotLeft.current = 0; setOneShot(null) }')
    expect(judged).toBeGreaterThan(0)
    expect(cut).toBeGreaterThan(judged)
    expect(walkerFrame).not.toContain('walkingRef.current) { shotLeft.current = 0')
  })
  test('대화(frozen)·기록 창(holdStill)이면 감속 없이 바로 선다', () => {
    expect(walkerFrame).toMatch(/if \(frozen \|\| holdStill\) speed\.current = 0/)
  })
  test('안내 방식으로 갈라지는 코드가 없다', () => {
    expect(walker).not.toMatch(/guided|difficultyMode|unguided/)
  })
})

describe('프레임마다 새 객체·React 상태를 만들지 않는다', () => {
  test('Walker의 프레임 콜백에 new·배열 리터럴·훅이 없다', () => {
    expect(walkerFrame.length).toBeGreaterThan(500)
    expect(walkerFrame).not.toMatch(/\bnew |useMemo|useState|\[\{|= \[/)
  })
  test('속도는 ref로 두고 React 상태로 올리지 않는다', () => {
    expect(walker).toContain('const speed = useRef(0)')
    expect(walker).not.toMatch(/useState<number>|setSpeed/)
    expect(walker).toMatch(/<Avatar [^>]*speed=\{speed\}/)
  })
  test('Avatar는 현재 속도 ref로 걷기 동작 재생 속도를 정해 CharacterModel에 ref로 넘긴다', () => {
    expect(avatar).toMatch(/speed: React\.MutableRefObject<number>/)
    expect(avatarFrame).toContain('walkPlayback(speed.current, WALK_CYCLE_DISTANCE * bodyScale(look.body))')
    expect(avatarFrame).not.toMatch(/\bnew |useState|set[A-Z]\w*\(/)
    expect(avatar).toMatch(/<CharacterModel [^>]*rate=\{rate\}/)
    expect(avatar).not.toMatch(/speed=\{moving \?/)
  })
  test('CharacterModel은 rate ref가 있으면 프레임마다 지금 동작의 재생 속도로 쓴다', () => {
    expect(model).toMatch(/rate\?: React\.RefObject<number>/)
    expect(model).toMatch(/if \(rate\) \{ const a = actions\[action\]; if \(a && rate\.current != null\) a\.timeScale = rate\.current \}/)
  })
})
