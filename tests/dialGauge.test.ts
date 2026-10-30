// 다이얼 게이지: 눈금 계산(0.01 mm, 1바퀴 1 mm), 런아웃(최대−최소), 모델 노드
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DIAL, counterAngle, dialDivision, discTravel, needleAngle, reading, runout } from '../src/scene/dialGauge'

describe('다이얼 게이지 눈금', () => {
  it('큰 바늘 1바퀴 = 1 mm = 100눈금, 1눈금 = 0.01 mm', () => {
    expect(DIAL.division).toBe(0.01)
    expect(needleAngle(1)).toBeCloseTo(2 * Math.PI, 9)
    expect(needleAngle(0.25)).toBeCloseTo(Math.PI / 2, 9)
    expect(dialDivision(0.37)).toBeCloseTo(37, 6)
    expect(dialDivision(1.37)).toBeCloseTo(37, 6) // 큰 바늘은 1바퀴마다 같은 자리
  })
  it('회전계는 1 mm마다 1칸(10칸 = 1바퀴)', () => {
    expect(counterAngle(1)).toBeCloseTo((2 * Math.PI) / 10, 9)
    expect(counterAngle(10)).toBeCloseTo(2 * Math.PI, 9)
  })
  it('베젤을 돌려 영점을 맞추면 그 자리가 0이 된다', () => {
    expect(dialDivision(0.5, 50)).toBeCloseTo(0, 6)
    expect(dialDivision(0.53, 50)).toBeCloseTo(3, 6)
    expect(dialDivision(0.47, 50)).toBeCloseTo(97, 6) // 0 아래로 3눈금
  })
  it('영점 뒤 읽음값은 0.01 단위', () => {
    expect(reading(0.5371, 0.5)).toBeCloseTo(0.04, 9)
    expect(reading(0.48, 0.5)).toBeCloseTo(-0.02, 9)
  })
  it('런아웃 = 최대 − 최소', () => {
    expect(runout([0, 0.02, 0.05, 0.01, -0.01])).toBeCloseTo(0.06, 9)
    expect(runout([])).toBeNull()
  })
  it('연습용 디스크 모형: 한 바퀴 돌리면 전체 흔들림이 tir', () => {
    const vals = Array.from({ length: 360 }, (_, i) => discTravel((i * Math.PI) / 180, 0.5, 0.04, 1))
    expect(Math.max(...vals) - Math.min(...vals)).toBeCloseTo(0.04, 4)
    expect(Math.min(...vals)).toBeCloseTo(0.5, 4)
  })
})

describe('다이얼 게이지 모델(dial-gauge.glb)', () => {
  const buf = readFileSync(new URL('../public/assets/models/dial-gauge.glb', import.meta.url))
  const len = buf.readUInt32LE(12)
  const j = JSON.parse(buf.toString('utf8', 20, 20 + len)) as { nodes: Array<{ name?: string }>; materials: Array<{ name?: string; alphaMode?: string }>; extensionsUsed?: string[]; images?: unknown[] }
  it('움직이는 노드(바늘·회전계·측정축·베젤)와 접촉점이 있다', () => {
    const names = j.nodes.map((n) => n.name)
    for (const n of ['DialGauge', 'Stand', 'Indicator', 'Needle', 'CounterNeedle', 'Spindle', 'Bezel', 'ContactPoint']) expect(names).toContain(n)
  })
  it('유리는 반투명, meshopt만, 그림 없음, 150 KB 이하', () => {
    expect(j.materials.find((m) => m.name === 'Crystal')?.alphaMode).toBe('BLEND')
    expect(j.extensionsUsed ?? []).toContain('EXT_meshopt_compression')
    expect(j.images ?? []).toHaveLength(0)
    expect(buf.length).toBeLessThan(150_000)
  })
  it('스크립트 치수와 앱 상수가 같다', async () => {
    const py = readFileSync(new URL('../scripts/blender/build_dial_gauge.py', import.meta.url), 'utf8')
    const { DIAL_GAUGE } = await import('../src/scene/models/DialGaugeModel')
    expect(py).toContain(`DIAL_R = ${DIAL_GAUGE.dialR}`)
    expect(py).toContain(`FACE_R = ${DIAL_GAUGE.faceR}`)
    expect(py).toContain(`IND_POS = Vector((${DIAL_GAUGE.indicator.x}, 0.0, ${DIAL_GAUGE.indicator.y}))`)
  })
})
