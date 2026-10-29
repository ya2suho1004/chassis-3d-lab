// 세워 둔 실습 차량 모델 2종 점검(k3.glb·pride.glb): 노드·재질 이름, 압축, 용량, 앱 상수 = 블렌더 스크립트 상수
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { K3_SPEC, PRIDE_SPEC, fitsK3, fitsPride } from '../src/scene/models/ParkedCarsModel'

interface Gltf { nodes: Array<{ name?: string }>; materials: Array<{ name?: string }>; extensionsUsed?: string[]; images?: unknown[] }
function load(name: string): { buf: Buffer; j: Gltf } {
  const buf = readFileSync(new URL(`../public/assets/models/${name}.glb`, import.meta.url))
  const len = buf.readUInt32LE(12)
  return { buf, j: JSON.parse(buf.toString('utf8', 20, 20 + len)) as Gltf }
}
/** 스크립트의 `A, B = 1, 2` 줄에서 값 읽기 */
function tuple(script: string, names: string): number[] {
  const m = script.match(new RegExp(`^${names.replace(/ /g, '\\s*')}\\s*=\\s*([^#\\n]+)`, 'm'))
  if (!m) throw new Error(`스크립트에 ${names} 없음`)
  return m[1]!.split(',').map((x) => Number(x.trim()))
}

const CASES = [
  { name: 'k3', root: 'K3', spec: K3_SPEC, fits: fitsK3, extra: ['Turntables'] },
  { name: 'pride', root: 'Pride', spec: PRIDE_SPEC, fits: fitsPride, extra: [] as string[] },
] as const

describe.each(CASES)('$name.glb', ({ name, root, spec, fits, extra }) => {
  const { buf, j } = load(name)
  const script = readFileSync(new URL(`../scripts/blender/build_${name}.py`, import.meta.url), 'utf8')
  it('뿌리·몸체·바퀴 4개 노드가 있다', () => {
    const names = j.nodes.map((n) => n.name)
    for (const n of [root, 'Body', 'Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR', ...extra]) expect(names).toContain(n)
  })
  it('재질 이름이 정리되어 있다(차체색·유리·타이어·휠)', () => {
    const mats = j.materials.map((m) => m.name)
    for (const m of ['Paint', 'Glass', 'Tire', 'Rim', 'Machined', 'HeadLight', 'TailLight']) expect(mats).toContain(m)
  })
  it('meshopt만 쓰고 그림 파일이 없으며 0.65 MB 이하다', () => {
    expect(j.extensionsUsed ?? []).toContain('EXT_meshopt_compression')
    expect(JSON.stringify(j.extensionsUsed ?? [])).not.toContain('draco')
    expect(j.images ?? []).toHaveLength(0)
    expect(buf.length).toBeLessThan(650_000)
  })
  it('앱 치수가 블렌더 스크립트 상수와 같다', () => {
    const [L, halfW] = tuple(script, 'L, HALF_W')
    const [wheelR] = tuple(script, 'WHEEL_R, WHEEL_X')
    const [axF, axR] = tuple(script, 'AXLE_F, AXLE_R')
    expect(spec.d).toBeCloseTo(L!, 6)
    expect(spec.w).toBeCloseTo(2 * halfW!, 6)
    expect(spec.wheelR).toBeCloseTo(wheelR!, 6)
    expect(spec.wheelbase).toBeCloseTo(axF! - axR!, 6)
  })
  it('배치 크기가 맞을 때만 모델을 쓴다(길이 방향은 x·z 어느 쪽이든)', () => {
    expect(fits({ w: spec.d, d: spec.w })).toBe(true)
    expect(fits({ w: spec.w, d: spec.d })).toBe(true)
    expect(fits({ w: 2.9, d: 1.7 })).toBe(false)
  })
})
