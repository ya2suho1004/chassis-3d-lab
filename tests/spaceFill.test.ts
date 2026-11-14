// tests/spaceFill.test.ts — 공간 채우기(설계 2026-11-14 §4·§5·§7): 이웃 구역 물건과 벽 꾸밈이 걷기·누르기·학습 단서·부담 한도를 지키는지.
// 형상은 node에서 실제로 만들어 정점·바닥 그늘 자리로 재고, 연결(그림자·시선 판정·한 번만 만들기·개발 서버 전용 끄기)은 원본 글로 확인한다.
import fs from 'node:fs'
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import rawLayout from '../src/data/layout/layout.dev-provisional.json'
import { footprintOf, loadSceneLayout } from '../src/scene/layoutModel'
import { hallBounds } from '../src/scene/Surroundings'
import { labZones } from '../src/scene/look/lookConfig'
import { ATLAS_CELLS, ATLAS_GUTTER, ATLAS_H, ATLAS_W, FILL_TEXTURES, SIGN_TEXT, atlasUv, type AtlasCell } from '../src/scene/fill/fillAtlas'
import { fillOffBySearch } from '../src/scene/fill/fillSwitch'
import { HALL_PAINT_SIZE, footShade, hallPaintData, hallPaintTexture } from '../src/scene/fill/hallPaint'
import { ZONE_PAINT } from '../src/scene/fill/neighborZones'
import { buildSpaceFill } from '../src/scene/fill/spaceFillPlan'
import { WALL_CLEAR_H, WALL_MAX_DEPTH, northWallLayout, wallFixtures } from '../src/scene/fill/wallDressing'
import { noRaycast } from '../src/scene/fill/fillShared'
import { hallFalloffAt } from '../src/scene/look/lookTextures'
import { PALETTE } from '../src/scene/look/lookConfig'

const read = (p: string) => fs.readFileSync(p, 'utf8')
const layout = loadSceneLayout(rawLayout)
const b = hallBounds(layout)
const zones = labZones(layout)
const plan = buildSpaceFill(b, layout)
const mz = layout.mainZone
const inside = (x: number, z: number, r: { xMin: number; xMax: number; zMin: number; zMax: number }, pad = 0) => x > r.xMin - pad && x < r.xMax + pad && z > r.zMin - pad && z < r.zMax + pad
const tris = (g: THREE.BufferGeometry | null) => (g ? (g.index ? g.index.count : g.attributes.position!.count) / 3 : 0)

describe('이웃 구역 물건(걷기에 영향 없음)', () => {
  test('바닥에 놓은 물건이 충분히 있다(엔진 스탠드·실습대·배선판·의자 등)', () => {
    expect(plan.feet.length).toBeGreaterThanOrEqual(70)
  })
  test('물건마다 바닥 크기의 네 모서리가 실습장 두 구역에서 0.5 m 넘게 떨어지고 건물 안에 있다', () => {
    for (const f of plan.feet) {
      const c = Math.cos(f.rotY), s = Math.sin(f.rotY)
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const lx = (u * f.w) / 2, lz = (v * f.d) / 2
        const x = f.x + lx * c + lz * s, z = f.z - lx * s + lz * c
        for (const r of zones) expect(inside(x, z, r, 0.5), `(${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(false)
        expect(inside(x, z, b), `(${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(true)
      }
    }
  })
  test('합친 형상의 정점 가운데 벽 꾸밈이 아닌 것은 모두 실습장 두 구역에서 0.5 m 넘게 떨어지고 건물 안에 있다', () => {
    // 벽 꾸밈 = 실습장 북·동 벽에서 0.13 m 안(2.0 m 위에서 더 두꺼운 셔터 감김 상자는 0.4 m 안)
    const onWall = (x: number, y: number, z: number) => {
      const band = y >= WALL_CLEAR_H ? 0.4 : 0.13
      return (x >= mz.xMin - 1e-6 && x <= mz.xMax + 1e-6 && z - mz.zMin <= band) || (z >= mz.zMin - 1e-6 && z <= mz.zMax + 1e-6 && mz.xMax - x <= band)
    }
    let checked = 0
    for (const g of [plan.solid, plan.decal]) {
      const a = g!.attributes.position!
      for (let i = 0; i < a.count; i++) {
        const x = a.getX(i), y = a.getY(i), z = a.getZ(i)
        if (onWall(x, y, z)) continue
        checked++
        for (const r of zones) expect(inside(x, z, r, 0.5), `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`).toBe(false)
        const e = 1e-6
        expect(x >= b.xMin - e && x <= b.xMax + e && z >= b.zMin - e && z <= b.zMax + e, `(${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(true)
      }
    }
    expect(checked).toBeGreaterThan(10000)
  })
  test('구역 바닥 칠은 서쪽 엔진 구역·남쪽 전기 구역 둘이고, 실습장 구역과 겹치지 않는다', () => {
    expect(plan.paint).toHaveLength(2)
    for (const p of plan.paint) for (const r of zones) {
      const overlap = p.rect.xMin < r.xMax && p.rect.xMax > r.xMin && p.rect.zMin < r.zMax && p.rect.zMax > r.zMin
      expect(overlap).toBe(false)
    }
  })
})

describe('벽 꾸밈(학생이 벽에 바짝 붙어 걸을 수 있다)', () => {
  test(`실습장 구역 안의 꾸밈 정점은 높이 ${WALL_CLEAR_H} m 아래에서 북·동 벽에서 ${WALL_MAX_DEPTH} m 안에 있다(합친 형상 전체)`, () => {
    let checked = 0
    for (const g of [plan.solid, plan.decal]) {
      const a = g!.attributes.position!
      for (let i = 0; i < a.count; i++) {
        const x = a.getX(i), y = a.getY(i), z = a.getZ(i)
        if (y >= WALL_CLEAR_H || !zones.some((r) => inside(x, z, r))) continue
        checked++
        const fromNorth = z - mz.zMin, fromEast = mz.xMax - x
        expect(Math.min(fromNorth, fromEast), `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`).toBeLessThanOrEqual(WALL_MAX_DEPTH + 1e-6)
      }
    }
    expect(checked).toBeGreaterThan(100)
  })
  test('바닥 가까이 내려오는 벽 꾸밈(문·셔터·소화기함·게시판·표지·콘센트)은 벽 앞 장비에 가려지지 않는다', () => {
    const fx = wallFixtures()
    expect(fx.map((f) => f.name)).toEqual(expect.arrayContaining(['door', 'shutter', 'extinguisher-north', 'extinguisher-east', 'bulletin']))
    for (const f of fx) {
      for (const e of layout.equipment) {
        const r = footprintOf(e)
        // 그 벽에서 1 m 안에 서 있고, 꾸밈 아래 끝보다 높은 장비
        const near = f.wall === 'north' ? r.zMin - mz.zMin < 1 : mz.xMax - r.xMax < 1
        if (!near || e.h <= f.y0) continue
        const [a0, a1] = f.wall === 'north' ? [r.xMin, r.xMax] : [r.zMin, r.zMax]
        expect(a1 <= f.from || a0 >= f.to, `${f.name}과 ${e.id}`).toBe(true)
      }
    }
  })
})

describe('북쪽 벽 꾸밈끼리 겹치지 않는다', () => {
  const { openings, drops, pipes } = northWallLayout()
  const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1
  test('내려오는 관(콘센트·공기 꼭지)은 창·시계 앞을 지나지 않고 창 사이 벽으로 내려온다', () => {
    expect(drops).toHaveLength(3)
    for (const d of drops) for (const o of openings) expect(overlap(d.from, d.to, o.from, o.to), `${d.name}과 ${o.name}`).toBe(false)
  })
  test('벽을 따라가는 전선관·공기 배관은 창틀·시계 높이와 겹치지 않는다', () => {
    for (const p of pipes) for (const o of openings) expect(overlap(p.from, p.to, o.y0, o.y1), `${p.name}과 ${o.name}`).toBe(false)
    for (let i = 0; i < pipes.length; i++) for (let j = i + 1; j < pipes.length; j++) expect(overlap(pipes[i]!.from, pipes[i]!.to, pipes[j]!.from, pipes[j]!.to)).toBe(false)
  })
})

describe('학습 단서 없음: 표지 글', () => {
  const allowed = ['보안경 착용', '정리 정돈', '안전제일', '소화기', '비상구']
  test('표지 글은 허용 목록(일반 안전·시설 표지)뿐이다', () => {
    expect(Object.values(SIGN_TEXT).sort()).toEqual([...allowed].sort())
  })
  test('그림판 코드의 한글 글자는 모두 허용 목록 안이다(주석 제외) — 게시판·패널은 읽을 수 없는 줄·점뿐', () => {
    const code = read('src/scene/fill/fillAtlas.ts').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n')
    const literals = [...code.matchAll(/(['"`])((?:(?!\1).)*[가-힣](?:(?!\1).)*)\1/g)].map((m) => m[2])
    expect(literals.length).toBeGreaterThan(0)
    for (const s of literals) expect(allowed, s).toContain(s)
    expect(code).not.toMatch(/fillText\(\s*['"`]/)
  })
  test('그림판 밖의 꾸밈 파일은 글자를 그리지 않는다', () => {
    for (const f of ['fillProps.ts', 'neighborZones.ts', 'wallDressing.ts', 'hallPaint.ts', 'SpaceFill.tsx', 'spaceFillPlan.ts', 'partKit.ts', 'fillShared.ts']) {
      expect(read(`src/scene/fill/${f}`), f).not.toMatch(/fillText|strokeText|getContext/)
    }
  })
})

describe('누를 수 없는 장식', () => {
  const src = read('src/scene/fill/SpaceFill.tsx')
  test('꾸밈 메시는 그림자를 드리우지 않는다(바닥 그림자 굽기에서도 빠진다) — 이름표·누르기 처리도 없다', () => {
    expect(src).not.toMatch(/castShadow/)
    expect(src).not.toMatch(/onClick|onPointer|<Html|label3d|onSelect/)
    const meshes = src.match(/<mesh [^>]*>/g) ?? []
    expect(meshes).toHaveLength(2)
    for (const m of meshes) expect(m).toContain('raycast={noRaycast}')
  })
  test('시선 판정(광선 검사)에 잡히지 않는다', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const hit = new THREE.Mesh(geo), skip = new THREE.Mesh(geo)
    skip.raycast = noRaycast
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1))
    expect(ray.intersectObject(hit)).not.toHaveLength(0)
    expect(ray.intersectObject(skip)).toHaveLength(0)
  })
  test('배치 자료(장비·이름표 대상)를 바꾸지 않는다', () => {
    const before = JSON.stringify(layout)
    buildSpaceFill(b, layout)
    expect(JSON.stringify(layout)).toBe(before)
  })
})

describe('한 번만 만든다(걷는 동안 다시 만들지 않는다)', () => {
  test('형상은 배치가 바뀔 때만 만들고, 재질은 부품이 붙을 때 한 번, 그리는 동안 프레임마다 하는 일이 없다', () => {
    const sur = read('src/scene/Surroundings.tsx')
    expect(sur).toMatch(/const fill = useSpaceFill\(b, layout\)/)
    expect(sur).toMatch(/\{fill && <SpaceFillMeshes plan=\{fill\} \/>\}/)
    const src = read('src/scene/fill/SpaceFill.tsx')
    // 만드는 곳과 내려놓는 곳이 같다(한 훅 안). 꺼 두면 만들지 않는다
    expect(src).toMatch(/const plan = useMemo\(\(\) => \(FILL_ON \? buildSpaceFill\(b, layout\) : null\), \[b, layout\]\)\n  useEffect\(\(\) => \(\) => \{ plan\?\.solid\?\.dispose\(\); plan\?\.decal\?\.dispose\(\) \}, \[plan\]\)/)
    expect(src.match(/dispose\(\)/g)).toHaveLength(4)
    expect(sur).not.toMatch(/buildSpaceFill/)
    expect(src).toMatch(/const mats = useMemo\(\(\) => \{[\s\S]*?\}, \[\]\)/)
    expect(src).not.toMatch(/useFrame|useState/)
  })
  test('그림판·바닥 그림은 한 번 만들어 함께 쓴다(같은 값이면 같은 그림)', () => {
    expect(read('src/scene/fill/fillAtlas.ts')).toMatch(/if \(made\) return made/)
    const line = { color: ZONE_PAINT.line, width: ZONE_PAINT.lineWidth }
    const t1 = hallPaintTexture(b, zones, plan.paint, plan.feet, line)
    const t2 = hallPaintTexture(b, zones, plan.paint, plan.feet, line)
    expect(t2).toBe(t1)
    expect(t1.image.width).toBe(HALL_PAINT_SIZE)
  })
})

describe('운영 묶음', () => {
  test('주소로 끄는 길(?fill=0)은 개발 서버에서만 읽는다', () => {
    const src = read('src/scene/fill/fillSwitch.ts')
    expect(src).toMatch(/export const FILL_ON: boolean = import\.meta\.env\.DEV \? /)
    expect(src.match(/location/g)?.length).toBe(1)
    expect(fillOffBySearch('?fill=0')).toBe(true)
    expect(fillOffBySearch('?fill=1')).toBe(false)
    expect(fillOffBySearch('?q=low&fill=0')).toBe(true)
    expect(fillOffBySearch('')).toBe(false)
  })
})

describe('부담 한도(설계 §6)', () => {
  test('합친 두 메시의 삼각형은 30,000개 아래', () => {
    expect(tris(plan.solid) + tris(plan.decal)).toBeLessThan(30000)
  })
  test('늘어나는 그림 메모리(밉맵 포함 추정)는 12 MB 이내', () => {
    const bytes = (w: number, h: number) => w * h * 4 * (4 / 3)
    const added = FILL_TEXTURES.reduce((a, t) => a + bytes(t.w, t.h), 0) + bytes(HALL_PAINT_SIZE, HALL_PAINT_SIZE) - bytes(128, 128)
    expect(added / 2 ** 20).toBeLessThan(12)
  })
})

describe('그림판 칸(밉맵에서 번지지 않게)', () => {
  const cells = Object.entries(ATLAS_CELLS) as Array<[AtlasCell, [number, number, number, number]]>
  test(`칸마다 둘레 ${ATLAS_GUTTER} px 여백이 그림판 안에 있고, 여백끼리도 겹치지 않는다`, () => {
    const G = ATLAS_GUTTER
    for (const [name, [x, y, w, h]] of cells) {
      expect(x - G >= 0 && y - G >= 0 && x + w + G <= ATLAS_W && y + h + G <= ATLAS_H, name).toBe(true)
    }
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
      const [a, [ax, ay, aw, ah]] = cells[i]!, [c, [bx, by, bw, bh]] = cells[j]!
      const sep = ax + aw + G <= bx - G || bx + bw + G <= ax - G || ay + ah + G <= by - G || by + bh + G <= ay - G
      expect(sep, `${a}과 ${c}`).toBe(true)
    }
  })
  test('UV는 칸 가장자리에서 반 텍셀 안쪽', () => {
    for (const [name, [x, y, w, h]] of cells) {
      const uv = atlasUv(name)
      expect(uv.u0 * ATLAS_W).toBeCloseTo(x + 0.5, 6)
      expect(uv.u1 * ATLAS_W).toBeCloseTo(x + w - 0.5, 6)
      expect((1 - uv.v1) * ATLAS_H).toBeCloseTo(y + 0.5, 6)
      expect((1 - uv.v0) * ATLAS_H).toBeCloseTo(y + h - 0.5, 6)
    }
  })
})

describe('바깥 바닥 그림(구역 칠·구획선·그늘)', () => {
  const line = { color: ZONE_PAINT.line, width: ZONE_PAINT.lineWidth }
  const data = hallPaintData(b, zones, plan.paint, plan.feet, line)
  const N = HALL_PAINT_SIZE
  const px = (x: number, z: number) => {
    const i = Math.floor(((x - b.xMin) / (b.xMax - b.xMin)) * N), j = Math.floor(((b.zMax - z) / (b.zMax - b.zMin)) * N), o = (j * N + i) * 4
    return [data[o]!, data[o + 1]!, data[o + 2]!]
  }
  const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)
  /** 색 hex × 밝기 흐름(그 점) → sRGB 0~255 — 공간 채우기 전 바닥 재질(색 × 밝기 그림)과 같은 셈 */
  const expected = (hex: string, x: number, z: number) => {
    const g = toLin(Math.round(hallFalloffAt(x, z, zones)) / 255)
    return [1, 3, 5].map((k) => Math.round(toSrgb(toLin(parseInt(hex.slice(k, k + 2), 16) / 255) * g) * 255))
  }
  const near = (got: number[], want: number[], tol = 3) => got.forEach((v, k) => expect(Math.abs(v - want[k]!), `${got} ≈ ${want}`).toBeLessThanOrEqual(tol))
  /** 어느 물건의 그늘도 닿지 않는 점 */
  const clear = (x: number, z: number) => plan.feet.every((f) => footShade(f, x, z) === 0)
  const [engine, electric] = plan.paint

  test('크기와 불투명', () => {
    expect(data.length).toBe(N * N * 4)
    for (let o = 3; o < data.length; o += 4 * 9973) expect(data[o]).toBe(255)
  })
  test('구역 밖(물건 없는 곳)은 예전 바닥(바깥 바닥 색 × 밝기 흐름)과 같다', () => {
    for (const [x, z] of [[16.1, 28.5], [-0.3, 3.0], [-9.6, 29.0], [10, 14.4], [17.5, 26]] as const) {
      expect(clear(x, z)).toBe(true)
      near(px(x, z), expected(PALETTE.hallFloor, x, z))
    }
  })
  test('구역 안(물건·구획선 없는 곳)은 그 구역 색 × 밝기 흐름', () => {
    for (const [p, pts] of [[engine!, [[-1.5, 8.6], [-8.2, 8.6]]], [electric!, [[0.0, 15.3], [5.35, 20.3]]]] as const) {
      for (const [x, z] of pts) { expect(clear(x, z), `${x},${z}`).toBe(true); near(px(x, z), expected(p.color, x, z)) }
    }
  })
  test('구획선 자리(구역 가장자리 안쪽 0.1 m)는 노란 선 색', () => {
    const r = engine!.rect
    for (const [x, z] of [[r.xMin + 0.04, (r.zMin + r.zMax) / 2 + 0.3], [r.xMax - 0.04, 8.6], [-2.0, r.zMin + 0.04]] as const) near(px(x, z), expected(ZONE_PAINT.line, x, z))
  })
  test('물건 밑은 둘레보다 어둡다(그늘)', () => {
    const lum = (c: number[]) => c[0]! + c[1]! + c[2]!
    for (const f of plan.feet.filter((f) => f.dark >= 0.4).slice(0, 10)) {
      const out = Math.max(f.w, f.d) / 2 + 0.45
      const ring = [[out, 0], [-out, 0], [0, out], [0, -out]].map(([dx, dz]) => lum(px(f.x + dx!, f.z + dz!)))
      expect(lum(px(f.x, f.z)), `${f.x.toFixed(2)},${f.z.toFixed(2)}`).toBeLessThan(Math.max(...ring) * 0.8)
    }
  })
})
