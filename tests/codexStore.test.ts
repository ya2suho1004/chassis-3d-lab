// 도감 저장(설계 docs/superpowers/specs/2026-11-16-codex-window-design.md §3-3): 학번(입장 코드)별로 모은 장비 번호를 이 기기에만 둔다.
// 캐릭터 저장(app/avatar.ts)과 같은 방식 — 연구 기록·서버에는 넣지 않는다. 시험 학번은 가짜 값(3999, 2211)만 쓴다.
import { readdirSync, readFileSync } from 'node:fs'
import { beforeEach, describe, expect, test } from 'vitest'
import { CODEX_KEY, addToCodex, loadCodex, parseCodexStore } from '../src/app/codexStore'

const store = new Map<string, string>()
let failWrite = false
let failRead = false
beforeEach(() => {
  store.clear()
  failWrite = false
  failRead = false
  globalThis.localStorage = {
    getItem: (k: string) => { if (failRead) throw new Error('SecurityError'); return store.get(k) ?? null },
    setItem: (k: string, v: string) => { if (failWrite) throw new Error('QuotaExceededError'); store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
})

const KNOWN = ['brake-tester-01', 'lift-zone-01/a', 'parts-bench-01/디스크']

describe('읽기·쓰기', () => {
  test('저장 열쇠는 캐릭터와 다른 자기 이름(판 번호 포함)', () => {
    expect(CODEX_KEY).toBe('chassis.codex.v1')
  })
  test('아무것도 없으면 빈 목록', () => {
    expect(loadCodex('3999', KNOWN)).toEqual([])
  })
  test('처음 누른 장비를 더하면 그 코드의 목록에 남고, 모은 순서를 지킨다', () => {
    expect(addToCodex('3999', 'lift-zone-01/a')).toBe(true)
    expect(addToCodex('3999', 'brake-tester-01')).toBe(true)
    expect(loadCodex('3999', KNOWN)).toEqual(['lift-zone-01/a', 'brake-tester-01'])
  })
  test('코드마다 따로 둔다(다른 학번의 도감이 섞이지 않는다)', () => {
    addToCodex('3999', 'brake-tester-01')
    addToCodex('2211', 'lift-zone-01/a')
    expect(loadCodex('3999', KNOWN)).toEqual(['brake-tester-01'])
    expect(loadCodex('2211', KNOWN)).toEqual(['lift-zone-01/a'])
  })
  test('이미 있는 장비를 다시 더해도 한 번만 남는다', () => {
    addToCodex('3999', 'brake-tester-01')
    addToCodex('3999', 'brake-tester-01')
    expect(JSON.parse(store.get(CODEX_KEY)!)).toEqual({ '3999': ['brake-tester-01'] })
  })
})

describe('배치에 없는 번호와 망가진 값', () => {
  test('배치 자료에 없는 번호는 읽을 때 버린다(겹친 번호도 하나만)', () => {
    store.set(CODEX_KEY, JSON.stringify({ '3999': ['old-machine-09', 'brake-tester-01', 'brake-tester-01', 'parts-bench-01/디스크'] }))
    expect(loadCodex('3999', KNOWN)).toEqual(['brake-tester-01', 'parts-bench-01/디스크'])
  })
  test('JSON이 아니거나 모양이 틀리면 빈 저장소로 본다', () => {
    expect(parseCodexStore(null)).toEqual({})
    expect(parseCodexStore('{깨짐')).toEqual({})
    expect(parseCodexStore('[1,2]')).toEqual({})
    expect(parseCodexStore('"x"')).toEqual({})
  })
  test('코드별 값이 목록이 아니면 그 코드만 버리고, 목록 안의 글자가 아닌 값도 버린다', () => {
    expect(parseCodexStore(JSON.stringify({ '3999': 'brake-tester-01', '2211': ['lift-zone-01/a', 7, null, 'brake-tester-01'] })))
      .toEqual({ '2211': ['lift-zone-01/a', 'brake-tester-01'] })
  })
  test('망가진 저장값 위에 더해도 새로 쓴다', () => {
    store.set(CODEX_KEY, '{깨짐')
    expect(addToCodex('3999', 'brake-tester-01')).toBe(true)
    expect(loadCodex('3999', KNOWN)).toEqual(['brake-tester-01'])
  })
})

describe('저장 열쇠 방어 — 코드가 객체 원형의 이름이어도 안전하다', () => {
  test.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'])('%s: 처음엔 빈 목록, 더하면 그 코드에만 남고 다른 코드는 그대로', (code) => {
    expect(loadCodex(code, KNOWN)).toEqual([])
    expect(addToCodex('3999', 'lift-zone-01/a')).toBe(true)
    expect(addToCodex(code, 'brake-tester-01')).toBe(true)
    expect(loadCodex(code, KNOWN)).toEqual(['brake-tester-01'])
    expect(loadCodex('3999', KNOWN)).toEqual(['lift-zone-01/a'])
    expect(Object.prototype.hasOwnProperty.call(JSON.parse(store.get(CODEX_KEY)!), code)).toBe(true)
  })
  test('저장값에 __proto__ 열쇠가 있어도 원형을 바꾸지 않고 그 코드의 목록으로만 읽는다', () => {
    store.set(CODEX_KEY, '{"__proto__":["brake-tester-01"],"3999":["lift-zone-01/a"]}')
    const all = parseCodexStore(store.get(CODEX_KEY)!)
    expect(Object.prototype.hasOwnProperty.call(all, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(all)).toBeNull()
    expect(loadCodex('__proto__', KNOWN)).toEqual(['brake-tester-01'])
    expect(loadCodex('constructor', KNOWN)).toEqual([])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('저장 공간이 막혀도 실습은 그대로', () => {
  test('쓰기가 막히면 false를 돌려줄 뿐 던지지 않는다', () => {
    failWrite = true
    expect(() => addToCodex('3999', 'brake-tester-01')).not.toThrow()
    expect(addToCodex('3999', 'brake-tester-01')).toBe(false)
  })
  test('읽기가 막히면 빈 목록(던지지 않는다)', () => {
    failRead = true
    expect(loadCodex('3999', KNOWN)).toEqual([])
    expect(addToCodex('3999', 'brake-tester-01')).toBe(false)
  })
})

describe('도감은 이 기기에만 — 기록·서버 길에 들어가지 않는다', () => {
  test('저장 모듈은 네트워크·기록 모듈을 부르지 않는다', () => {
    const src = readFileSync('src/app/codexStore.ts', 'utf8')
    expect(src).not.toMatch(/fetch\(|supabase|from '\.\.\/(domain|delivery|records)/)
    expect(src).not.toMatch(/console\./)
  })
  test('채점·기록·전송 코드는 도감을 모른다', () => {
    for (const dir of ['src/domain', 'src/delivery', 'src/records']) {
      for (const f of readdirAll(dir)) expect(readFileSync(f, 'utf8'), f).not.toMatch(/codexStore|codexList|CODEX_KEY|chassis\.codex|\bcodex\b/) // 'Codex'(검토자 이름)는 상관없다
    }
  })
})

function readdirAll(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? readdirAll(`${dir}/${d.name}`) : d.name.endsWith('.ts') ? [`${dir}/${d.name}`] : []))
}
