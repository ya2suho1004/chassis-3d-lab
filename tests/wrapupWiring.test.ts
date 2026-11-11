// 기록 창 마무리 묶음(설계 docs/superpowers/specs/2026-11-10-record-window-wrapup-design.md §5·§6) 배선
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'

const read = (p: string) => fs.readFileSync(p, 'utf8')

describe('결과 화면: 정답 값 숨기기(§5)', () => {
  const src = read('src/screens/ResultScreen.tsx')
  test('제시/기준값 칸과 차량 판정(정답) 줄이 없고, 교사 화면 안내가 있다', () => {
    expect(src).not.toContain('제시/기준값')
    expect(src).not.toContain('차량 판정(정답)')
    expect(src).not.toMatch(/\{i\.presentedValue\}|\{i\.computedReferenceValue\}/)
    expect(src).toContain('정답 값은 교사 화면에서 확인합니다')
  })
})

describe('작은 흐름 수정(§6)', () => {
  test('과제를 받은 뒤 교관 대사는 작업 목록을 가리킨다(안내 없음과 맞게)', () => {
    const npc = read('src/screens/NpcDialog.tsx')
    expect(npc).toContain('좋아. 작업 순서는 작업 목록에서 확인해. 안전 수칙 꼭 지키고!')
    expect(npc).not.toContain('오른쪽 위에 보여')
  })
  test('의뢰 카드의 교관에게: 걸어간 뒤 대화가 열린다', () => {
    const lab = read('src/screens/LabScreen.tsx')
    expect(lab).toContain('<button onClick={() => goTo(npcSpot, true)}>교관에게</button>')
    expect(lab).toContain('onGoToNpc={() => { setNpcOpen(false); goTo(npcSpot, true) }}')
    expect(lab).toContain('const goTo = (p: Pt, talk = false) => { setTalkOnArrive(talk); moveRequestRef.current = p }')
  })
})
