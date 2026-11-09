// 압축 없는(저장 방식) ZIP 만들기 — 새 패키지 없이 연구용 묶음 파일 하나로 내려받으려고 쓴다. 파일 이름은 ASCII만 쓴다.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zipStore(files: Array<{ name: string; text: string }>, when: Date): Uint8Array {
  const enc = new TextEncoder()
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1)
  const dosDate = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()
  const entries = files.map((f) => {
    const data = enc.encode(f.text)
    return { name: enc.encode(f.name), data, crc: crc32(data), offset: 0 }
  })
  const size = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length + 46 + e.name.length, 0) + 22
  const out = new Uint8Array(size)
  const v = new DataView(out.buffer)
  let at = 0
  const common = (p: number, e: (typeof entries)[number]) => { // 버전~파일 이름 길이: 지역 머리와 중앙 목록에 같은 순서로 들어간다
    v.setUint16(p, 20, true)
    v.setUint16(p + 2, 0x0800, true) // 이름은 UTF-8
    v.setUint16(p + 4, 0, true) // 압축 안 함
    v.setUint16(p + 6, dosTime, true)
    v.setUint16(p + 8, dosDate, true)
    v.setUint32(p + 10, e.crc, true)
    v.setUint32(p + 14, e.data.length, true)
    v.setUint32(p + 18, e.data.length, true)
    v.setUint16(p + 22, e.name.length, true)
  }
  for (const e of entries) {
    e.offset = at
    v.setUint32(at, 0x04034b50, true)
    common(at + 4, e)
    out.set(e.name, at + 30)
    out.set(e.data, at + 30 + e.name.length)
    at += 30 + e.name.length + e.data.length
  }
  const dirStart = at
  for (const e of entries) {
    v.setUint32(at, 0x02014b50, true)
    v.setUint16(at + 4, 20, true)
    common(at + 6, e)
    v.setUint32(at + 42, e.offset, true)
    out.set(e.name, at + 46)
    at += 46 + e.name.length
  }
  v.setUint32(at, 0x06054b50, true)
  v.setUint16(at + 8, entries.length, true)
  v.setUint16(at + 10, entries.length, true)
  v.setUint32(at + 12, at - dirStart, true)
  v.setUint32(at + 16, dirStart, true)
  return out
}
