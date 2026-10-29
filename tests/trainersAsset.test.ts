// 변속기 시뮬레이터·쇽업소버 분해 장비 블렌더 모델 점검: 노드, 압축, 용량, 치수(앱 상수 = 블렌더 스크립트 상수), 배치 자리 맞춤
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import raw from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { SHOCK_STAND, TRANSMISSION_SIMULATOR, fitsShockStand, fitsTransmissionSimulator } from '../src/scene/models/TrainersModel'

const layout = loadSceneLayout(raw)

function glb(name: string) {
  const buf = readFileSync(new URL(`../public/assets/models/${name}`, import.meta.url))
  const len = buf.readUInt32LE(12)
  const j = JSON.parse(buf.toString('utf8', 20, 20 + len)) as { nodes: Array<{ name?: string }>; extensionsUsed?: string[]; images?: unknown[] }
  return { buf, j }
}

/** 스크립트의 `A, B, C = 1, 2, 3` 줄에서 값 읽기 */
function tuple(script: string, names: string): number[] {
  const m = script.match(new RegExp(`^${names.replace(/ /g, '\\s*')}\\s*=\\s*([^#\\n]+)`, 'm'))
  if (!m) throw new Error(`스크립트에 ${names} 없음`)
  return m[1]!.split(',').map((x) => Number(x.trim()))
}

const cases = [
  { file: 'transmission-simulator.glb', root: 'TransmissionSimulator', script: 'build_transmission_simulator.py' },
  { file: 'shock-stand.glb', root: 'ShockStand', script: 'build_shock_stand.py' },
]

describe.each(cases)('$file', ({ file, root }) => {
  const { buf, j } = glb(file)
  it('뿌리·몸체 노드가 있다', () => {
    const names = j.nodes.map((n) => n.name)
    expect(names).toContain(root); expect(names).toContain('Body')
  })
  it('meshopt만 쓰고 그림 파일이 없으며 0.25 MB 이하다', () => {
    expect(j.extensionsUsed ?? []).toContain('EXT_meshopt_compression')
    expect(JSON.stringify(j.extensionsUsed ?? [])).not.toContain('draco')
    expect(j.images ?? []).toHaveLength(0)
    expect(buf.length).toBeLessThan(250_000)
  })
})

describe('치수와 배치 자리', () => {
  it('앱 상수가 블렌더 스크립트 상수와 같다', () => {
    const sim = readFileSync(new URL('../scripts/blender/build_transmission_simulator.py', import.meta.url), 'utf8')
    const shock = readFileSync(new URL('../scripts/blender/build_shock_stand.py', import.meta.url), 'utf8')
    expect(tuple(sim, 'W, D, H')).toEqual([TRANSMISSION_SIMULATOR.w, TRANSMISSION_SIMULATOR.d, TRANSMISSION_SIMULATOR.h])
    expect(tuple(shock, 'BASE_R, H')).toEqual([SHOCK_STAND.baseR, SHOCK_STAND.h])
  })
  it('지금 배치 자리에 들어간다', () => {
    const sim = layout.equipment.find((e) => e.id === 'transmission-simulator-01')!
    const shock = layout.equipment.find((e) => e.id === 'shock-absorber-stand-01')!
    expect(fitsTransmissionSimulator(sim)).toBe(true)
    expect(fitsShockStand(shock)).toBe(true)
  })
  it('자리가 좁으면 코드 모델로 돌아간다', () => {
    expect(fitsTransmissionSimulator({ w: 1.5, d: 2.3 })).toBe(false)
    expect(fitsShockStand({ w: 0.5, d: 1.5 })).toBe(false)
  })
})
