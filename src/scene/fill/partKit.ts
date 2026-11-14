// 공간 채우기 꾸밈을 한 덩어리 메시로 모으는 도구. 상자·원기둥·판을 실제 좌표에 놓고, 색은 정점 색으로 넣어
// 물건이 수십 개여도 재질 하나 = 그리기 호출 하나로 그린다. 한 번 만들어 재사용한다(걷는 동안 다시 만들지 않는다).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type Vec3 = [number, number, number]
/** 그림 한 장(꾸밈 그림판) 안의 칸: 왼쪽 아래 u0·v0, 오른쪽 위 u1·v1(0~1) */
export interface UvRect { u0: number; v0: number; u1: number; v1: number }
export interface PartOpts { rotX?: number; rotY?: number; rotZ?: number }

const ONE = new THREE.Vector3(1, 1, 1)

/** 바닥 그늘을 그릴 자리(바닥에 닿는 물건의 바닥 크기, 회전, 진하기 0~1) */
export interface Footprint { x: number; z: number; w: number; d: number; rotY: number; dark: number }

export class PartKit {
  private parts: THREE.BufferGeometry[] = []
  private frames: THREE.Matrix4[] = [new THREE.Matrix4()]
  /** 바닥 그늘 자리(바깥 바닥 그림이 가져다 그린다) */
  readonly feet: Footprint[] = []
  private frameY: number[] = [0]

  /** 지금 자리 위에 지역 좌표계를 하나 올린다(바닥 위 x·z, 세로축 회전). fn 안의 좌표는 지역 좌표다 */
  at(x: number, z: number, rotY: number, fn: () => void): void {
    const top = this.frames[this.frames.length - 1]!
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), ONE)
    this.frames.push(top.clone().multiply(m))
    this.frameY.push(this.frameY[this.frameY.length - 1]! + rotY)
    try { fn() } finally { this.frames.pop(); this.frameY.pop() }
  }

  /** 지역 좌표의 바닥 크기(w × d)를 세계 좌표 그늘 자리로 적어 둔다 */
  foot(w: number, d: number, dark = 0.45, cx = 0, cz = 0): void {
    const p = new THREE.Vector3(cx, 0, cz).applyMatrix4(this.frames[this.frames.length - 1]!)
    this.feet.push({ x: p.x, z: p.z, w, d, rotY: this.frameY[this.frameY.length - 1]!, dark })
  }

  private add(g: THREE.BufferGeometry, at: Vec3, color: THREE.ColorRepresentation, o: PartOpts = {}): void {
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rotX ?? 0, o.rotY ?? 0, o.rotZ ?? 0, 'YXZ')), ONE)
    g.applyMatrix4(this.frames[this.frames.length - 1]!.clone().multiply(local))
    const c = new THREE.Color(color)
    const n = g.attributes.position!.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    this.parts.push(g)
  }

  /** 상자(가운데 자리) */
  box(w: number, h: number, d: number, at: Vec3, color: THREE.ColorRepresentation, o?: PartOpts): void {
    this.add(new THREE.BoxGeometry(w, h, d), at, color, o)
  }
  /** 바닥(지역 y)에서 위로 세운 상자: at의 y가 밑면 높이 */
  block(w: number, h: number, d: number, at: Vec3, color: THREE.ColorRepresentation, o?: PartOpts): void {
    this.box(w, h, d, [at[0], at[1] + h / 2, at[2]], color, o)
  }
  /** 원기둥(축은 axis 방향, 가운데 자리). seg: 둘레 칸 수 */
  cyl(r: number, len: number, at: Vec3, color: THREE.ColorRepresentation, axis: 'x' | 'y' | 'z' = 'y', seg = 10, rEnd = r): void {
    const rot: PartOpts = axis === 'x' ? { rotZ: Math.PI / 2 } : axis === 'z' ? { rotX: Math.PI / 2 } : {}
    this.add(new THREE.CylinderGeometry(rEnd, r, len, seg), at, color, rot)
  }
  /** 판 한 장(앞면 = 지역 +z, o로 돌린다). uv를 주면 꾸밈 그림판의 그 칸을 붙인다 */
  quad(w: number, h: number, at: Vec3, uv: UvRect | null, o?: PartOpts, color: THREE.ColorRepresentation = '#ffffff'): void {
    const g = new THREE.PlaneGeometry(w, h)
    if (uv) {
      const a = g.attributes.uv!
      for (let i = 0; i < a.count; i++) a.setXY(i, uv.u0 + a.getX(i) * (uv.u1 - uv.u0), uv.v0 + a.getY(i) * (uv.v1 - uv.v0))
    }
    this.add(g, at, color, o)
  }

  /** 모은 것을 한 형상으로 합친다(모은 조각은 버린다). 아무것도 없으면 null */
  build(): THREE.BufferGeometry | null {
    if (this.parts.length === 0) return null
    const merged = mergeGeometries(this.parts, false)
    for (const p of this.parts) p.dispose()
    this.parts = []
    if (!merged) throw new Error('꾸밈 형상을 합치지 못했습니다')
    merged.computeBoundingSphere()
    return merged
  }
}
