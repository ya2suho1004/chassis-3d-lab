// 수업 주소 QR 생성(설계 docs/superpowers/specs/2026-11-14-student-number-and-class-link-design.md §3-5).
// 바탕: 계획 docs/superpowers/plans/2026-11-09-qr-entry.md Task 2. 새 패키지를 쓰지 않고, 기기 안에서 만들어 외부 서비스로 보내지 않는다.
// 범위: 버전 1~6, 오류 정정 M, 바이트 방식. 내용은 106바이트까지(QR_MAX_BYTES).
/** 버전 6·오류 정정 M·바이트 방식에 담을 수 있는 최대 바이트(데이터 108 코드워드 − 방식·길이 2) */
export const QR_MAX_BYTES = 106

const VERSIONS: Record<number, { total: number; ecPerBlock: number; blocks: number; align: number | null }> = {
  1: { total: 26, ecPerBlock: 10, blocks: 1, align: null },
  2: { total: 44, ecPerBlock: 16, blocks: 1, align: 18 },
  3: { total: 70, ecPerBlock: 26, blocks: 1, align: 22 },
  4: { total: 100, ecPerBlock: 18, blocks: 2, align: 26 },
  5: { total: 134, ecPerBlock: 24, blocks: 2, align: 30 },
  6: { total: 172, ecPerBlock: 16, blocks: 4, align: 34 },
}

function gfMul(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j]!, root)
      if (j + 1 < degree) result[j] = result[j]! ^ result[j + 1]!
    }
    root = gfMul(root, 2)
  }
  return result
}

export function rsRemainder(data: number[], degree: number): number[] {
  const divisor = rsDivisor(degree)
  const result = new Array<number>(degree).fill(0)
  for (const b of data) {
    const factor = b ^ result.shift()!
    result.push(0)
    divisor.forEach((d, i) => { result[i] = result[i]! ^ gfMul(d, factor) })
  }
  return result
}

/** 오류 정정 M(00) + 마스크의 15비트 형식 정보 */
export function formatBits(mask: number): number {
  const data = mask // M의 지시 비트가 00이라 마스크 값과 같다
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  return ((data << 10) | rem) ^ 0x5412
}

function codewords(bytes: Uint8Array, version: number): number[] {
  const v = VERSIONS[version]!
  const capacity = v.total - v.ecPerBlock * v.blocks
  const bits: number[] = []
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
  put(4, 4)
  put(bytes.length, 8)
  bytes.forEach((b) => put(b, 8))
  put(0, Math.min(4, capacity * 8 - bits.length))
  put(0, (8 - (bits.length % 8)) % 8)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad)
  // 이 범위의 M 등급은 블록 길이가 모두 같다
  const dataPerBlock = capacity / v.blocks
  const dataBlocks: number[][] = []
  const ecBlocks: number[][] = []
  for (let b = 0; b < v.blocks; b++) {
    const block = data.slice(b * dataPerBlock, (b + 1) * dataPerBlock)
    dataBlocks.push(block)
    ecBlocks.push(rsRemainder(block, v.ecPerBlock))
  }
  const out: number[] = []
  for (let i = 0; i < dataPerBlock; i++) dataBlocks.forEach((bl) => out.push(bl[i]!))
  for (let i = 0; i < v.ecPerBlock; i++) ecBlocks.forEach((bl) => out.push(bl[i]!))
  return out
}

const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

function penalty(m: boolean[][]): number {
  const n = m.length
  let score = 0
  const lineScore = (line: boolean[]) => {
    let s = 0, run = 1
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++
      else { if (run >= 5) s += run - 2; run = 1 }
    }
    const text = line.map((v) => (v ? '1' : '0')).join('')
    for (const pat of ['10111010000', '00001011101']) for (let at = text.indexOf(pat); at >= 0; at = text.indexOf(pat, at + 1)) s += 40
    return s
  }
  let dark = 0
  for (let y = 0; y < n; y++) {
    score += lineScore(m[y]!)
    score += lineScore(m.map((row) => row[y]!))
    for (let x = 0; x < n; x++) {
      if (m[y]![x]) dark++
      if (x + 1 < n && y + 1 < n && m[y]![x] === m[y]![x + 1] && m[y]![x] === m[y + 1]![x] && m[y]![x] === m[y + 1]![x + 1]) score += 3
    }
  }
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10
  return score
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text)
  const version = Object.keys(VERSIONS).map(Number).find((ver) => {
    const v = VERSIONS[ver]!
    return bytes.length + 2 <= v.total - v.ecPerBlock * v.blocks
  })
  if (!version) throw new Error('QR_TOO_LONG')
  const n = version * 4 + 17
  const mod = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const fixed = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const set = (x: number, y: number, on: boolean) => { mod[y]![x] = on; fixed[y]![x] = true }

  for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy
      if (x < 0 || y < 0 || x >= n || y >= n) continue
      const d = Math.max(Math.abs(dx), Math.abs(dy))
      set(x, y, d !== 2 && d !== 4)
    }
  }
  finder(3, 3); finder(n - 4, 3); finder(3, n - 4)
  const align = VERSIONS[version]!.align
  if (align !== null) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(align + dx, align + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }
  const drawFormat = (bits: number) => {
    const bit = (i: number) => ((bits >>> i) & 1) === 1
    for (let i = 0; i <= 5; i++) set(8, i, bit(i))
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i))
    set(8, n - 8, true)
  }
  drawFormat(0) // 자리 확보

  const data = codewords(bytes, version)
  let i = 0
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const up = ((right + 1) & 2) === 0
        const y = up ? n - 1 - vert : vert
        if (!fixed[y]![x] && i < data.length * 8) {
          mod[y]![x] = ((data[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1
          i++
        }
      }
    }
  }

  const applyMask = (mask: number) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fixed[y]![x] && MASKS[mask]!(x, y)) mod[y]![x] = !mod[y]![x]
  }
  let best = 0, bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask); drawFormat(formatBits(mask))
    const s = penalty(mod)
    if (s < bestScore) { best = mask; bestScore = s }
    applyMask(mask)
  }
  applyMask(best); drawFormat(formatBits(best))
  return mod
}

/** SVG path의 d 값. 칸 하나가 1, 조용한 여백 4칸 포함 viewBox는 `0 0 (n+8) (n+8)` */
export function qrPath(m: boolean[][]): string {
  const parts: string[] = []
  m.forEach((row, y) => row.forEach((on, x) => { if (on) parts.push(`M${x + 4} ${y + 4}h1v1h-1z`) }))
  return parts.join('')
}
