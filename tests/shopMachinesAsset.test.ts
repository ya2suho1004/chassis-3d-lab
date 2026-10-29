// 휠 밸런서·타이어 탈착기 블렌더 모델 점검: 노드, 압축, 용량, 앱 치수 상수 = 블렌더 스크립트 상수
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { TIRE_CHANGER, WHEEL_BALANCER, fitsTireChanger, fitsWheelBalancer } from '../src/scene/models/ShopMachinesModel'

function load(glb: string, py: string) {
  const buf = readFileSync(new URL(`../public/assets/models/${glb}`, import.meta.url))
  const script = readFileSync(new URL(`../scripts/blender/${py}`, import.meta.url), 'utf8')
  const len = buf.readUInt32LE(12)
  const j = JSON.parse(buf.toString('utf8', 20, 20 + len)) as { nodes: Array<{ name?: string }>; extensionsUsed?: string[]; images?: unknown[] }
  const m = script.match(/^W,\s*D,\s*H\s*=\s*([^#\n]+)/m)
  if (!m) throw new Error(`${py}에 W, D, H 없음`)
  return { buf, j, whd: m[1]!.split(',').map((x) => Number(x.trim())) }
}

const layout = loadSceneLayout(raw)
const cases = [
  { name: '휠 밸런서', glb: 'wheel-balancer.glb', py: 'build_wheel_balancer.py', root: 'WheelBalancer', spec: WHEEL_BALANCER, id: 'wheel-balancer-01' },
  { name: '타이어 탈착기', glb: 'tire-changer.glb', py: 'build_tire_changer.py', root: 'TireChanger', spec: TIRE_CHANGER, id: 'tire-changer-01' },
] as const

describe.each(cases)('$name 모델($glb)', ({ glb, py, root, spec }) => {
  const { buf, j, whd } = load(glb, py)
  it('뿌리·몸체·도는 부분 노드가 있다', () => {
    const names = j.nodes.map((n) => n.name)
    expect(names).toContain(root); expect(names).toContain('Body'); expect(names).toContain(spec.spinNode)
  })
  it('meshopt만 쓰고 그림 파일이 없으며 0.25 MB 이하다', () => {
    expect(j.extensionsUsed ?? []).toContain('EXT_meshopt_compression')
    expect(JSON.stringify(j.extensionsUsed ?? [])).not.toContain('draco')
    expect(j.images ?? []).toHaveLength(0)
    expect(buf.length).toBeLessThan(250_000)
  })
  it('앱 치수 상수가 블렌더 스크립트와 같다', () => {
    expect(whd).toEqual([spec.w, spec.d, spec.h])
  })
})

describe('배치와 맞을 때만 모델을 쓴다', () => {
  it('지금 배치(밸런서 1.4×1.4×1.2, 탈착기 1.4×1.7)에 맞는다', () => {
    const b = layout.equipment.find((e) => e.id === 'wheel-balancer-01')!
    const c = layout.equipment.find((e) => e.id === 'tire-changer-01')!
    expect(fitsWheelBalancer(b)).toBe(true)
    expect(fitsTireChanger(c)).toBe(true)
  })
  it('크기가 다르면 코드 모델', () => {
    expect(fitsWheelBalancer({ w: 1.0, d: 1.4, h: 1.2 })).toBe(false)
    expect(fitsTireChanger({ w: 1.4, d: 1.2 })).toBe(false)
  })
})
