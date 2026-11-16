// 장비 설명 글(설계 docs/superpowers/specs/2026-11-16-equipment-info-copy-design.md): 학생에게 보이는 info에 개발 메모를 넣지 않는다.
import { describe, expect, test } from 'vitest'
import rawLayout from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'

const layout = loadSceneLayout(rawLayout)
const MEMO = /실측|가정|추정|사용자|스케치|사진 관찰|미측정|미확인|미식별|근사|C-\d|20\d\d-\d\d-\d\d|세션 설정/

describe('장비 설명 글', () => {
  test('모든 장비의 설명 글이 비어 있지 않다', () => {
    const empty = layout.equipment.filter((e) => !e.info || e.info.trim() === '').map((e) => e.id)
    expect(empty).toEqual([])
  })
  test('모든 장비의 설명 글에 개발 메모 표현이 없다', () => {
    const bad = layout.equipment.filter((e) => MEMO.test(e.info ?? '')).map((e) => `${e.id}: ${e.info}`)
    expect(bad).toEqual([])
  })
})
