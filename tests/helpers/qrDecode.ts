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
  // 기본 판독기(QRCodeDetector)가 몇몇 올바른 그림(예: REH-USAB·CLS 주소 일부)을 못 읽어 같은 OpenCV의 Aruco 판독기로 한 번 더 읽는다(2026-11-16, 수업용 세션을 더해 고르는 조합이 바뀌며 드러남).
  const py = 'import cv2,sys;i=cv2.imread(sys.argv[1]);t=cv2.QRCodeDetector().detectAndDecode(i)[0]\nif not t and hasattr(cv2,"QRCodeDetectorAruco"):t=cv2.QRCodeDetectorAruco().detectAndDecode(i)[0]\nprint(t,end="")'
  try { return execFileSync('python3', ['-I', '-c', py, file], { encoding: 'utf8' }) } finally { fs.rmSync(dir, { recursive: true }) }
}
