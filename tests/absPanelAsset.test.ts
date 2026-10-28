// 공용 조작부 블렌더 모델 점검: 노드, 압축, 용량, 글자 덧붙임 자리(앱 상수 = 블렌더 스크립트 상수)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ABS_PANEL, fitsAbsPanel } from '../src/scene/models/AbsPanelModel'

const buf = readFileSync(new URL('../public/assets/models/abs-panel.glb', import.meta.url))
const script = readFileSync(new URL('../scripts/blender/build_abs_panel.py', import.meta.url), 'utf8')
const len = buf.readUInt32LE(12)
const j = JSON.parse(buf.toString('utf8', 20, 20 + len)) as { nodes: Array<{ name?: string }>; extensionsUsed?: string[]; images?: unknown[] }

/** 스크립트의 `A, B, C = 1, 2, 3` 줄에서 값 읽기 */
function tuple(names: string): number[] {
  const m = script.match(new RegExp(`^${names.replace(/ /g, '\\s*')}\\s*=\\s*([^#\\n]+)`, 'm'))
  if (!m) throw new Error(`스크립트에 ${names} 없음`)
  return m[1]!.split(',').map((x) => Number(x.trim()))
}

describe('공용 조작부 모델(abs-panel.glb)', () => {
  it('뿌리·몸체 노드가 있다', () => {
    const names = j.nodes.map((n) => n.name)
    expect(names).toContain('AbsPanel'); expect(names).toContain('Body')
  })
  it('meshopt만 쓰고 그림 파일이 없으며 0.3 MB 이하다(글자는 앱이 덧붙임)', () => {
    expect(j.extensionsUsed ?? []).toContain('EXT_meshopt_compression')
    expect(JSON.stringify(j.extensionsUsed ?? [])).not.toContain('draco')
    expect(j.images ?? []).toHaveLength(0)
    expect(buf.length).toBeLessThan(300_000)
  })
  it('글자 덧붙임 자리가 블렌더 스크립트와 같다', () => {
    expect(tuple('W, D, H')).toEqual([ABS_PANEL.w, ABS_PANEL.d, ABS_PANEL.h])
    expect(tuple('FACE_W, FACE_H, FACE_Z')).toEqual([ABS_PANEL.face.w, ABS_PANEL.face.h, ABS_PANEL.face.y])
    expect(tuple('BOX_OUT')).toEqual([ABS_PANEL.face.out])
    expect(tuple('PLATE_W, PLATE_H, PLATE_Z')).toEqual([ABS_PANEL.plate.w, ABS_PANEL.plate.h, ABS_PANEL.plate.y])
  })
  it('배치 조작부 크기(0.7×0.5×1.5)와 같을 때만 모델을 쓴다', () => {
    expect(fitsAbsPanel({ w: 0.7, d: 0.5, h: 1.5 })).toBe(true)
    expect(fitsAbsPanel({ w: 0.9, d: 0.5, h: 1.5 })).toBe(false)
  })
})
