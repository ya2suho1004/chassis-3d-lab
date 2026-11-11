// 빛과 재질 배선(설계 2026-11-11): 장면이 새 부품을 쓰는지, 태블릿 묶음·계측부·운영 묶음을 지키는지 소스 글로 확인한다
import fs from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const read = (p: string) => fs.readFileSync(p, 'utf8')
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []))

describe('실습장 장면', () => {
  const scene = read('src/scene/LabScene.tsx')
  test('색 보정 곡선 · 주된 빛 · 실습장 반사광 · 구운 바닥 그림자를 쓴다', () => {
    expect(scene).toMatch(/<ToneSetup \/>/)
    expect(scene).toMatch(/<KeyLight bounds=\{shadowBounds\} castShadow=\{tier\.realtimeShadows\} \/>/)
    expect(scene).toMatch(/<WorkshopEnv layout=\{layout\} resolution=\{tier\.envResolution\} \/>/)
    expect(scene).toMatch(/<FloorShadowBake bounds=\{shadowBounds\} sun=\{tier\.sunShadow\} contact=\{tier\.contactShadow\} stateKey=/)
    expect(scene).toMatch(/<Surroundings layout=\{layout\} halo=\{tier\.halo\} \/>/)
    expect(scene).toMatch(/const tier = useMemo\(\(\) => lookFor\(lowSpec\), \[lowSpec\]\)/)
  })
  test('실시간 그림자는 품질 높음에서만, 번짐을 조절할 수 있는 종류로', () => {
    expect(scene).toMatch(/<Canvas shadows=\{tier\.realtimeShadows \? 'percentage' : false\}/)
  })
  test('정비소 사진·예전 닿는 그늘·예전 바닥 무늬를 쓰지 않는다', () => {
    expect(scene).not.toMatch(/Environment files=/)
    expect(scene).not.toMatch(/LAB_HDRI|ContactShadows|BakedFloorShadows|epoxyFloorTexture|Lightformer/)
    expect(scene).toMatch(/makeFloorMaterial\(/)
  })
  test('바닥 표시선은 조명을 받는 칠 색이다(형광 초록 아님)', () => {
    expect(scene).not.toMatch(/#1fbf6b/)
    expect(scene.match(/<meshStandardMaterial color=\{PALETTE\.line\} roughness=\{0\.5\} \/>/g)).toHaveLength(2)
  })
  test('품질 낮음의 계단 줄이기는 주소 인자로만 켠다', () => {
    expect(scene).toMatch(/antialias: !lowSpec \|\| antialias,/)
    const lab = read('src/screens/LabScreen.tsx')
    expect(lab).toMatch(/const \[antialias\] = useState\(\(\) => typeof window !== 'undefined' && antialiasRequested\(window\.location\.search\)\)/)
    expect(lab.match(/lowSpec=\{lowSpec\} antialias=\{antialias\}/g)).toHaveLength(2)
  })
})

describe('태블릿 묶음 보호', () => {
  test('postprocessing을 들여오는 파일은 Effects.tsx 하나뿐이다', () => {
    const users = walk('src').filter((f) => /from '(@react-three\/)?postprocessing'/.test(read(f)))
    expect(users).toEqual([join('src', 'scene', 'Effects.tsx')])
  })
  test('화면 효과는 품질 높음에서만 따로 불러온다', () => {
    const scene = read('src/scene/LabScene.tsx')
    expect(scene).toMatch(/const Effects = lazy\(\(\) => import\('\.\/Effects'\)\)/)
    expect(scene).toMatch(/\{tier\.postEffects && <Suspense fallback=\{null\}><Effects \/><\/Suspense>\}/)
  })
  test('화면 효과 순서: 구석 그늘 → 빛 번짐 → 색 보정 곡선 → 계단 줄이기 → 가장자리', () => {
    const fx = read('src/scene/Effects.tsx')
    const order = ['<N8AO ', '<Bloom ', '<primitive object={softClip}', '<SMAA />', '<Vignette '].map((t) => fx.indexOf(t))
    expect(order.every((i) => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(fx).toMatch(/luminanceThreshold=\{LOOK\.bloomThreshold\}/)
    expect(fx).not.toMatch(/ToneMappingMode|ACES/)
  })
})

describe('계측부는 조명·색 보정과 무관한 재질 그대로', () => {
  test('계기 화면·조작부 글자', () => {
    const abs = read('src/scene/models/AbsPanelModel.tsx')
    expect(abs).toMatch(/new THREE\.MeshBasicMaterial\(\{ map: tex, toneMapped: false \}\)/)
    expect(abs).toMatch(/new THREE\.MeshBasicMaterial\(\{ map: absTesterLabelTexture\(\), transparent: true, depthWrite: false, toneMapped: false \}\)/)
  })
  test('측정판 눈금·바늘', () => {
    const tt = read('src/scene/models/TurntableDial.tsx')
    expect(tt).toMatch(/<meshBasicMaterial map=\{tex\} transparent depthWrite=\{false\} toneMapped=\{false\} \/>/)
    expect(tt).toMatch(/<meshBasicMaterial color="#d50000" toneMapped=\{false\} \/>/)
  })
})

describe('그 밖의 배선', () => {
  test('개발용 조정 인자 ?look= 는 개발 서버에서만 읽는다(운영 묶음에서 빠진다)', () => {
    const cfg = read('src/scene/look/lookConfig.ts')
    expect(cfg).toMatch(/export const LOOK: LookValues = import\.meta\.env\.DEV && typeof location !== 'undefined' \? withOverrides\(LOOK_DEFAULTS, new URLSearchParams\(location\.search\)\.get\('look'\)\) : LOOK_DEFAULTS/)
    const readers = walk('src').filter((f) => /\.get\('look'\)/.test(read(f)))
    expect(readers).toEqual([join('src', 'scene', 'look', 'lookConfig.ts')])
  })
  test('굽기 통계도 개발 서버에서만 낸다', () => {
    const bake = read('src/scene/look/FloorShadowBake.tsx')
    expect(bake.match(/__lookdev/g)!.length).toBeGreaterThan(0)
    expect(bake.indexOf('if (import.meta.env.DEV) {')).toBeGreaterThan(0)
    expect(bake.indexOf('if (import.meta.env.DEV) {')).toBeLessThan(bake.indexOf('__lookdev'))
  })
  test('실습장 반사광은 한 번만 그린다: 내용이 그대로면 같은 것을 넘기고, 그래픽 장치 연결이 돌아오면 다시 그린다', () => {
    const env = read('src/scene/look/WorkshopEnv.tsx')
    expect(env).toMatch(/export const WorkshopEnv = memo\(function WorkshopEnv\(/)
    expect(env).toMatch(/const shell = useMemo\(\(\) => \{/)
    expect(env).toMatch(/<Environment key=\{restored\} resolution=\{resolution\} frames=\{1\} [^>]*>\{shell\}<\/Environment>/)
    expect(env).toMatch(/addEventListener\('webglcontextrestored', again\)/)
  })
  test('바닥 그림자 굽기: 점 수는 값 표에서 받고, 셰이더가 만들어지지 않으면 실패로 처리하고, 연결이 돌아오면 다시 굽는다', () => {
    const bake = read('src/scene/look/FloorShadowBake.tsx')
    expect(bake).toContain('`#define SEARCH_TAPS ${BAKE.searchTaps}\\n#define FILTER_TAPS ${BAKE.filterTaps}\\n`')
    expect(bake).not.toMatch(/i < (32|64);/)
    expect(bake).toMatch(/gl\.debug\.onShaderError = \(glc, program\) => \{ broken = true;/)
    expect(bake).toMatch(/if \(broken \|\| gl\.getContext\(\)\.isContextLost\(\)\) throw new Error\(/)
    expect(bake).toMatch(/gl\.debug\.onShaderError = prevShaderError/)
    expect(bake).toMatch(/addEventListener\('webglcontextrestored', again\)/)
  })
  test('캐릭터 만들기 화면도 같은 색 보정 곡선', () => {
    expect(read('src/screens/AvatarScreen.tsx')).toMatch(/<SeeCharacters \/>\n\s+<ToneSetup \/>/)
  })
  test('조명판과 빛 판은 묶어서 그린다(메시 2개)', () => {
    const sur = read('src/scene/Surroundings.tsx')
    expect(sur).toMatch(/new THREE\.InstancedMesh\(geometry, material, spots\.length\)/)
    expect(sur.match(/<CeilingInstances /g)).toHaveLength(2)
    expect(sur).not.toMatch(/panels\.map\(/)
  })
  test('그림은 캔버스 번짐·흐림 없이 만든다', () => {
    const tex = read('src/scene/look/lookTextures.ts')
    expect(tex).not.toMatch(/createRadialGradient|createLinearGradient|\.filter = |getContext/)
  })
})
