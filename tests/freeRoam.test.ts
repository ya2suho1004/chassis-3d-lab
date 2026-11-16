// tests/freeRoam.test.ts — 수행 뒤 둘러보기와 화면 흐름(설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 1-6·1-8)
// 실습장은 3D 캔버스라 그리기 시험을 못 하므로 대본·안내는 함수로, 배선은 소스로 고정한다(지금 방식).
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { NpcDialog, npcLines } from '../src/screens/NpcDialog'
import { roamLine } from '../src/app/labGuide'
import { DONE_LINE } from '../src/app/requests'

const read = (p: string) => fs.readFileSync(p, 'utf8')
/** 주석을 뺀 코드(주석 낱말로 시험이 흔들리지 않게) */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('교관 대사 — 수행 뒤', () => {
  test('가까이 가면 의뢰가 끝났다고 말하고 도감을 권한다', () => {
    expect(DONE_LINE).toBe('오늘 의뢰는 끝났어. 남은 시간엔 장비를 둘러보면서 도감을 채워 봐.')
    expect(npcLines({ near: true, running: false, done: true, taskTitle: 'T', nickname: '든든한 스패너' })).toEqual([DONE_LINE])
  })
  test('멀면 지금처럼 가까이 오라고 한다', () => {
    expect(npcLines({ near: false, running: false, done: true, taskTitle: 'T' })).toEqual(['여기야! 가까이 와서 이야기하자.'])
  })
  test('대화창에 과제 받기가 없고 닫기만 있다', () => {
    const t = text(renderToStaticMarkup(createElement(NpcDialog, { near: true, running: false, done: true, taskTitle: 'T', error: null, onReceive: async () => null, onGoToNpc: () => {}, onOpenTasks: () => {}, onInspect: () => {}, onClose: () => {} })))
    expect(t).toContain(DONE_LINE)
    expect(t).not.toContain('과제 받기')
    expect(t).not.toContain('조금 더 둘러볼게요')
    expect(t).toContain('닫기')
  })
  test('수행 전 대화는 그대로(과제 받기 있음)', () => {
    const t = text(renderToStaticMarkup(createElement(NpcDialog, { near: true, running: false, taskTitle: 'T', error: null, onReceive: async () => null, onGoToNpc: () => {}, onOpenTasks: () => {}, onInspect: () => {}, onClose: () => {} })))
    expect(t).not.toContain(DONE_LINE)
  })
})

describe('화면 위 안내', () => {
  test('통과·중단·수행 전', () => {
    expect(roamLine('completed')).toBe('의뢰 완료 — 장비를 눌러 도감을 모아 보세요.')
    expect(roamLine('aborted')).toBe('장비를 눌러 도감을 모아 보세요.')
    expect(roamLine(null)).toBe('장비를 눌러 도감을 채우고, 교관에게 가서 과제를 받으세요.')
  })
})

describe('실습장 배선 — 수행 뒤', () => {
  const lab = code('src/screens/LabScreen.tsx')
  test('수행 뒤 값을 받고 안내 줄을 쓴다', () => {
    expect(lab).toMatch(/after = null, onEnd/)
    expect(lab).toContain('{!run && <p>{roamLine(after)}</p>}')
  })
  test('☰ 메뉴와 기본 화면 머리에 마치기(수행 뒤에만)', () => {
    expect(lab).toContain("{after && <button onClick={() => { setMenuOpen(false); onEnd?.() }}>마치기</button>}")
    expect(lab).toContain('{after && <button className="link" onClick={() => onEnd?.()}>마치기</button>}')
  })
  test('게임 화면 둘러보기 안내 카드에도 마치기(수행 뒤에만, 같은 onEnd)', () => {
    const quest = lab.slice(lab.indexOf('<div className="g-quest-btns"'), lab.indexOf('</div>', lab.indexOf('<div className="g-quest-btns"')))
    expect(quest).toContain('{after && <button className="primary" onClick={() => onEnd?.()}>마치기</button>}')
  })
  test('교사용 배치 눈검토·실측 입력은 수행 뒤에 보이지 않는다', () => {
    expect(lab.match(/\{!run && !after && <button[^\n]*배치 눈검토\(교사\)/g)).toHaveLength(1)
    expect(lab.match(/\{!run && !after && <button[^\n]*실측 입력\(교사\)/g)).toHaveLength(1)
    expect(lab.match(/\{!run && !after && !reviewOpen && <button[^\n]*배치 눈검토\(교사\)/g)).toHaveLength(1)
    expect(lab.match(/\{!run && !after && !reviewOpen && <button[^\n]*실측 입력\(교사\)/g)).toHaveLength(1)
    expect(lab).not.toMatch(/\{!run && <button[^\n]*\(교사\)/)
    expect(lab).not.toMatch(/\{!run && !reviewOpen && <button[^\n]*\(교사\)/)
  })
  test('교관 대화창과 기본 화면 교관 칸에서 과제를 다시 받을 수 없다', () => {
    expect(lab).toMatch(/<NpcDialog [^\n]*done=\{!!after\}/)
    expect(lab).toMatch(/after \? \(\s*<p>\{DONE_LINE\}<\/p>/)
  })
})

describe('앱 흐름', () => {
  const app = code('src/App.tsx')
  test('실습장 화면 상태에 수행 뒤 값이 있다', () => {
    expect(app).toMatch(/\{ name: 'lab';[^\n]*after: 'completed' \| 'aborted' \| null \}/)
    expect(app).toMatch(/run: null, noRecord, runRepo, profile: saved, after: null/)
  })
  test('정리 화면의 실습장으로 이동 → 수행 뒤 둘러보기(run 없음)', () => {
    expect(app).toMatch(/onToLab=\{\(\) => setScreen\(\{ name: 'lab', session: screen\.session, task: screen\.task, mode: screen\.mode, run: null, noRecord: screen\.noRecord, runRepo: screen\.runRepo, profile: screen\.profile, after: screen\.completionStatus \}\)\}/)
  })
  test('마치기는 예전 다음 학생과 같다(기록 모드면 포인터를 비우고 시작 화면) — 정리 화면과 둘러보기 모두', () => {
    expect(app).toContain("const finish = (noRecord: boolean) => { if (!noRecord) repo?.clearCurrent(); setScreen({ name: 'start' }) }")
    expect(app).toContain('onEnd={() => finish(noRecord)}')
    expect(app).toContain('onEnd={() => finish(screen.noRecord)}')
    expect(app).not.toMatch(/onNextStudent/)
  })
  test('자동 전송: 확정 때 보내고, 정리 화면 갱신은 정리 화면에 있을 때만(둘러보기로 가도 화면이 어긋나지 않는다)', () => {
    expect(app).toMatch(/if \(!noRecord && envelope\) void sendNow\(\)/)
    expect(app).toMatch(/if \(cur\.name !== 'result' \|\| cur\.noRecord\) return/)
    expect(app).toMatch(/setScreen\(\(s\) => \(s\.name === 'result' && s\.session\.recordId === cur\.session\.recordId \?/)
  })
})
