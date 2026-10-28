// 생성된 수신 규칙 코어가 archive/apps-script 원본과 같은지(재생성 누락 방지), 해시가 학생 화면 계산과 같은지 확인
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import demo from '../docs/design/examples/submission.demo-request.json'
import { payloadHash } from '../src/delivery/jcs'
// @ts-expect-error — 생성 스크립트(.mjs)는 타입 선언이 없다
import { buildCore, buildDts } from '../scripts/build-receiver-core.mjs'
import { jcsCanonicalize, jcsSha256Hex } from '../supabase/functions/_shared/receiverCore.generated.js'

describe('receiverCore.generated', () => {
  test('생성 파일이 최신이다(node scripts/build-receiver-core.mjs)', () => {
    expect(readFileSync('supabase/functions/_shared/receiverCore.generated.js', 'utf8')).toBe(buildCore())
    expect(readFileSync('supabase/functions/_shared/receiverCore.generated.d.ts', 'utf8')).toBe(buildDts())
  })
  test('서버 해시(JCS→SHA-256)가 학생 화면 src/delivery/jcs.ts와 같다', async () => {
    expect(jcsSha256Hex(jcsCanonicalize(demo.payload))).toBe(await payloadHash(demo.payload))
  })
})
