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

describe('과제 패널의 기록 창(§3)', () => {
  const task = read('src/screens/TaskScreen.tsx')
  test('게임 화면(창 자리 있음)에서만 칸이 빈 단계 시도를 기록 창으로 연다', () => {
    expect(task).toMatch(/if \(recordHost && record !== stepId && res\.reasonCode\?\.startsWith\('NEEDS_RESPONSE_'\)\) return openRecord\(stepId\)/)
  })
  test('창은 게임 화면이 준 자리에 portal로 그리고, 단계 완료는 같은 doStep을 거쳐 끝나면 창을 닫는다', () => {
    expect(task).toMatch(/recordHost && record && createPortal\(/)
    expect(task).toMatch(/<RecordWindow title=\{recordLabel\(task, record\) \?\? '기록'\} onClose=\{closeRecord\} onAskAi=\{onAskAi\}/)
    expect(task).toMatch(/<button className="primary" onClick=\{\(\) => doStep\(record\)\}>단계 완료<\/button>/)
    expect(task).toMatch(/if \(res\.outcome === 'completed'\) \{ setRun\(res\.run\); setShown\(null\); if \(record === stepId\) closeRecord\(\); return \}/)
  })
  test('창 칸은 작업 목록과 같은 값·제출 함수를 쓰고 id만 다르다. 창 안 안내는 창 칸으로 가고 고치기는 다른 칸 창을 연다', () => {
    expect(task).toMatch(/const recIo: FieldIo = \{ \.\.\.listIo, idOf: recordInputId \}/)
    expect(task).toMatch(/onFocusItem=\{\(id\) => focusRecordField\(document, id\)\} onFix=\{openRecordFor\}/)
    expect(task).toMatch(/revealInBody\(document\.querySelector\('\.g-record \.rec-feedback'\)\)/)
  })
  test('게임 화면에 창 열림과 칸 열기를 알리고, 창 자리가 바뀌면 다시 알린다', () => {
    expect(task).toMatch(/recordOpen: record !== null, openRecordFor,/)
    expect(task).toMatch(/gauge\.hold, saveStatus, record, recordHost\]\)/)
  })
  test('고치기: 게임 화면은 기록 창, 그 밖은 칸으로 이동. 칸이 열리지 않았으면 열지 않는다', () => {
    expect(task).toMatch(/const fixItem = \(itemId: string\) => \(recordHost \? openRecordFor\(itemId\) : void focusResponse\(document, itemId\)\)/)
    expect(task).toMatch(/if \(st && itemOpen\(run, itemId, true\)\) openRecord\(st\)/)
  })
})
