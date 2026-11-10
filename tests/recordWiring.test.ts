// 기록 창 연결(설계 2026-11-10): 화면 시험 도구(jsdom)가 없어 배선은 소스로 고정한다(지금 방식)
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'

const read = (p: string) => fs.readFileSync(p, 'utf8')
/** 주석을 뺀 코드(주석 낱말로 시험이 흔들리지 않게) */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

describe('작업 목록 고치기(§6)', () => {
  const task = read('src/screens/TaskScreen.tsx')
  test('다시 확인할 항목 안내는 칸마다 고치기를 넘기고, 패널 안내 상자가 받는다', () => {
    expect(task).toMatch(/fixItems: wrongIds/)
    expect(task).toMatch(/onFix=\{fixItem\}/)
  })
  test('NPC 보완 목록의 응답 줄에 고치기(칸이 열린 것만)', () => {
    expect(task).toMatch(/i\.kind === 'response' && itemOpen\(run, i\.itemId, true\) && <> <button className="link" onClick=\{\(\) => fixItem\(i\.itemId\)\}>고치기<\/button><\/>/)
  })
  test('주석을 뺀 코드에도 고치기 함수가 있다', () => {
    expect(code('src/screens/TaskScreen.tsx')).toMatch(/const fixItem = /)
  })
})
