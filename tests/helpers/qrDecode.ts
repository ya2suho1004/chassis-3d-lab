// QR 행렬을 흑백 그림(PGM)으로 그려 OpenCV(python3 cv2)로 읽는 도우미. cv2가 없으면 hasCv가 false라 왕복 시험만 건너뛴다.
// 그림은 운영체제 임시 폴더에 잠깐 만들고 바로 지운다. 외부 서비스로 보내지 않는다.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const hasCv = spawnSync('python3', ['-I', '-c', 'import cv2'], { stdio: 'ignore' }).status === 0

export function decodeWithCv(m: boolean[][]): string {
  const scale = 8, quiet = 4
  const n = (m.length + quiet * 2) * scale
  const px = Buffer.alloc(n * n, 255)
  m.forEach((row, y) => row.forEach((on, x) => {
    if (!on) return
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) px[((y + quiet) * scale + dy) * n + (x + quiet) * scale + dx] = 0
  }))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-'))
  const file = path.join(dir, 'q.pgm')
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`P5\n${n} ${n}\n255\n`), px]))
  const py = 'import cv2,sys;print(cv2.QRCodeDetector().detectAndDecode(cv2.imread(sys.argv[1]))[0],end="")'
  try { return execFileSync('python3', ['-I', '-c', py, file], { encoding: 'utf8' }) } finally { fs.rmSync(dir, { recursive: true }) }
}
