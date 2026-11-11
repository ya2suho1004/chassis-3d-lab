# 계산·판정 장면 전자계산기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 제동력 '계산·판정 기록'·최소회전반경 '반경·판정 기록' 장면에 계산기(제동력 일반, 최소회전반경 공학용)를 넣고, '='를 누를 때마다 누른 식·결과를 기록 판 1.3.0의 계산 기록 목록에 남긴다.

**Architecture:**
- **계산 규칙:** 순수 함수 `src/app/calculator.ts`가 맡는다. 일반 계산기는 누르는 차례대로 바로 계산하고, 공학용은 식을 계산한다.
- **계산 기록:** 수행 상태(`TaskRun.calculatorLog`)에 엔진 함수 `logCalculation`으로 쌓는다. 사건(`stepEvents`)과 따로이고 채점과 무관하다.
- **기록 판:** 1.3.0은 계약 파일과 서버 접수 코드(Apps Script 원본을 묶어 만드는 Supabase 수신 코어)에 함께 더한다.
- **화면:** `src/screens/Calculator.tsx`를 기록 창(`RecordSheet`)과 기본 화면 계산 표(`TaskScreen`)에 붙인다.

**Tech Stack:** React 18 + TypeScript(strict, noUncheckedIndexedAccess), Vitest(node, `renderToStaticMarkup`·소스 검사·Ajv), Supabase Edge Function(Deno, 생성 코어).

**설계 문서:** `docs/superpowers/specs/2026-11-11-calculator-design.md`(MOON 승인, 계획 중 §3.2 크기 예산 보완). 아래 "§n"은 이 문서의 절이다.

---

## 작업 규칙
- **작업 폴더:** `/Users/jamingchu/claude code/chassis-3d-lab-cozy`(git worktree, 브랜치 `cozy-stage1`). 모든 명령은 이 폴더에서 한다.
- **금지:** push·배포·main 합치기는 하지 않는다. `cozy-stage1`은 절대 push하지 않는다. Supabase 함수 배포도 하지 않는다(MOON 허락 뒤 컨트롤러가 한다).
- **git:**
  - `git add`는 파일을 하나씩 적는다.
  - `tsconfig.tsbuildinfo`는 커밋하지 않는다.
  - 맨 `git stash`는 쓰지 않는다.
- **기타 금지:**
  - 새 패키지를 설치하지 않는다.
  - 브라우저·개발 서버를 열지 않는다.
  - `.env*` 파일을 읽지 않는다.
- **명령**
  - 시험 하나: `npm test -- tests/파일.test.ts`
  - 전체: `npm test`
  - 형 검사: `node_modules/.bin/tsc -p tsconfig.json --noEmit`
  - 멈추면 앞에 `perl -e 'alarm 300; exec @ARGV'`를 붙인다.
- **CSS:** `tests/noHasSelector.test.ts`가 CSS 원문을 검사한다. styles.css에 `:has(` 글자를 쓰지 않는다(주석 포함).
- **커밋 메시지:** 끝에 `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`를 붙인다(MOON이 정한 서명).
- **채점·판정 엔진:** `grading.ts`·`judge.ts`·`turningJudge.ts`는 바꾸지 않는다.

## 파일 구조

| 파일 | 할 일 |
|---|---|
| `src/domain/taskEngine.ts` | 계산기 기록 형(`CalculatorEntry` 등)·상한·`logCalculation`·과제별 종류와 단계, 초안 저장·복원(§3) |
| `src/app/calculator.ts`(새) | 일반·공학용 계산 규칙과 표시(§2) |
| `tests/calculatorCaseGuard.test.ts`(새) | 사례 지킴이(§6) |
| `docs/design/contracts/record.schema.v1.3.0.json`(새), `schema-index.json` | 기록 판 1.3.0(§4.1) |
| `scripts/build-apps-script-schema.mjs`, `archive/apps-script/{Schemas.gs,Code.gs,Validate.gs}`, `supabase/functions/_shared/receiverCore.generated.{js,d.ts}` | 서버 접수 1.3.0(§4.2) |
| `src/domain/record.ts` | 1.3.0 기록, 크기 예산(§3.2·§4.1) |
| `src/records/researchBundle.ts` | calculator.csv·설명서(§5) |
| `src/screens/Calculator.tsx`(새), `src/styles.css` | 계산기 화면(§2) |
| `src/screens/RecordSheet.tsx`, `src/screens/TaskScreen.tsx` | 배선(§2.1) |
| `src/app/buildInfo.ts`, `src/app/session.ts` | 앱 판 0.3.2-demo(§5) |

---

### Task 1: 엔진 — 계산기 기록 칸과 `logCalculation`

**Files:**
- Modify: `src/domain/taskEngine.ts`
- Test: `tests/calculatorLog.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/calculatorLog.test.ts`

```ts
// 계산기 기록(설계 docs/superpowers/specs/2026-11-11-calculator-design.md §3) — 수행 상태에 쌓는 계산 기록
import { describe, expect, test } from 'vitest'
import brake from '../src/data/tasks/task.braking-force.case-lv1.json'
import turn from '../src/data/tasks/task.min-turning-radius.case-lv1.json'
import { CALCULATOR_LOG_LIMIT, calculatorKindOf, calculatorStepOf, createTaskRun, logCalculation, pauseRun, rehydrateRun, serializeRun, type RunSnapshot } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'

let n = 0
const clockAt = (start: number) => {
  let t = start
  return {
    deps: { now: () => t, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` },
    tick: (ms: number) => { t += ms },
    back: (ms: number) => { t -= ms },
  }
}
const ok = (expression: string, result: string) => ({ expression, result, error: null })
const B = brake as unknown as ApprovedTask
const T = turn as unknown as ApprovedTask

describe('계산기 기록(§3)', () => {
  test('과제마다 계산기 종류와 기록 단계가 정해져 있다', () => {
    expect(calculatorKindOf(B)).toBe('basic')
    expect(calculatorStepOf(B)).toBe('calc')
    expect(calculatorKindOf(T)).toBe('scientific')
    expect(calculatorStepOf(T)).toBe('record')
  })
  test('새 수행은 빈 기록으로 시작하고, = 한 번에 한 줄을 순번·경과 시간과 함께 남긴다(사건·오류 수는 그대로)', () => {
    const c = clockAt(1_000_000)
    let run = createTaskRun(B, { difficultyMode: 'guided' }, c.deps)
    expect(run.calculatorLog).toEqual([])
    expect(run.calculatorLogTruncated).toBe(false)
    c.tick(5000)
    run = logCalculation(run, ok('240-200/600*100', '6.666666667'))
    c.tick(2000)
    run = logCalculation(run, { expression: '5/0', result: null, error: 'divideByZero' })
    expect(run.calculatorLog).toEqual([
      { sequence: 1, elapsedMs: 5000, stepId: 'calc', kind: 'basic', expression: '240-200/600*100', result: '6.666666667' },
      { sequence: 2, elapsedMs: 7000, stepId: 'calc', kind: 'basic', expression: '5/0', error: 'divideByZero' },
    ])
    expect(run.events.filter((e) => e.type !== 'taskStarted')).toEqual([])
    expect(run.errorCount).toBe(0)
  })
  test('최소회전반경은 공학용·record 단계로 남는다', () => {
    const run = logCalculation(createTaskRun(T, { difficultyMode: 'unguided' }, clockAt(0).deps), ok('2.7/sin(32)+0.1', '5.19511577'))
    expect(run.calculatorLog[0]).toMatchObject({ stepId: 'record', kind: 'scientific', expression: '2.7/sin(32)+0.1', result: '5.19511577' })
  })
  test(`${CALCULATOR_LOG_LIMIT}줄을 넘으면 더 적지 않고 넘침만 표시한다`, () => {
    let run = createTaskRun(B, { difficultyMode: 'guided' }, clockAt(0).deps)
    for (let i = 0; i < CALCULATOR_LOG_LIMIT + 5; i++) run = logCalculation(run, ok(`${i}+1`, String(i + 1)))
    expect(run.calculatorLog).toHaveLength(CALCULATOR_LOG_LIMIT)
    expect(run.calculatorLog[CALCULATOR_LOG_LIMIT - 1]!.sequence).toBe(CALCULATOR_LOG_LIMIT)
    expect(run.calculatorLogTruncated).toBe(true)
  })
  test('멈춤 중에는 남기지 않는다', () => {
    const run = pauseRun(createTaskRun(B, { difficultyMode: 'guided' }, clockAt(0).deps), 'manual').run
    expect(logCalculation(run, ok('1+1', '2')).calculatorLog).toEqual([])
  })
  test('식은 80자, 결과는 24자까지만 남긴다', () => {
    const run = logCalculation(createTaskRun(B, { difficultyMode: 'guided' }, clockAt(0).deps), ok('1'.repeat(100), '9'.repeat(30)))
    expect(run.calculatorLog[0]!.expression).toHaveLength(80)
    expect(run.calculatorLog[0]!.result).toHaveLength(24)
  })
  test('경과 시간은 거꾸로 가지 않는다(시계가 뒤로 가도)', () => {
    const c = clockAt(10_000)
    let run = createTaskRun(B, { difficultyMode: 'guided' }, c.deps)
    c.tick(3000); run = logCalculation(run, ok('1+1', '2'))
    c.back(2000); run = logCalculation(run, ok('2+2', '4'))
    expect(run.calculatorLog.map((e) => e.elapsedMs)).toEqual([3000, 3000])
  })
  test('초안 저장·복원: 기록이 이어지고 복원 시계는 마지막 계산 뒤에서 이어 간다. 예전 초안(칸 없음)은 빈 기록으로 읽는다', () => {
    const c = clockAt(0)
    let run = createTaskRun(B, { difficultyMode: 'guided' }, c.deps)
    c.tick(9000); run = logCalculation(run, ok('1+1', '2'))
    const snap = serializeRun(run)
    expect(snap.lastElapsedMs).toBe(9000)
    const back = rehydrateRun(snap, clockAt(500_000).deps)
    expect(back.calculatorLog).toHaveLength(1)
    expect(back.events[back.events.length - 1]!.elapsedMs).toBe(9000)
    const { calculatorLog: _l, calculatorLogTruncated: _t, ...old } = snap
    const legacy = rehydrateRun(old as unknown as RunSnapshot, clockAt(0).deps)
    expect(legacy.calculatorLog).toEqual([])
    expect(legacy.calculatorLogTruncated).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/calculatorLog.test.ts`
Expected: FAIL — `logCalculation` 등이 없음

- [ ] **Step 3: 구현** — `src/domain/taskEngine.ts`

(1) `export type DisplayMode = 'threeD' | 'diagram'` 줄 바로 아래에 더한다.

```ts

/** 계산·판정 장면 계산기(설계 docs/superpowers/specs/2026-11-11-calculator-design.md). 제동력은 일반, 최소회전반경은 공학용 */
export type CalculatorKind = 'basic' | 'scientific'
export type CalculatorError = 'divideByZero' | 'syntax'
/** 계산기 기록 한 줄: = 를 누를 때마다(사건과 따로, 채점·오류 수·피드백과 무관). result와 error 중 하나만 있다 */
export interface CalculatorEntry {
  sequence: number
  elapsedMs: number
  stepId: string
  kind: CalculatorKind
  expression: string
  result?: string
  error?: CalculatorError
}
```

(2) `TaskRun` 안의 `  countedActionIds: string[]` 줄 아래에 더한다.

```ts
  /** 계산기 기록(계산기 설계 §3). CALCULATOR_LOG_LIMIT을 넘으면 더 적지 않고 넘침만 표시 */
  calculatorLog: CalculatorEntry[]
  calculatorLogTruncated: boolean
```

(3) `export const EVENT_LIMIT = 200` 줄 아래에 더한다.

```ts
/** 계산기 기록 상한(계산기 설계 §3.2). 사건 한도와 따로 */
export const CALCULATOR_LOG_LIMIT = 60
```

(4) `createTaskRun`의 `    countedActionIds: [],` 줄 아래에 더한다.

```ts
    calculatorLog: [],
    calculatorLogTruncated: false,
```

(5) `serializeRun`의 줄 `  const lastElapsedMs = run.events.length ? run.events[run.events.length - 1]!.elapsedMs : 0`를 바꾼다.

```ts
  // 복원 시계는 마지막 사건과 마지막 계산 중 늦은 쪽에서 이어 간다(계산기 기록 시간이 거꾸로 가지 않게, 계산기 설계 §3.2)
  const lastEventMs = run.events.length ? run.events[run.events.length - 1]!.elapsedMs : 0
  const lastCalcMs = run.calculatorLog.length ? run.calculatorLog[run.calculatorLog.length - 1]!.elapsedMs : 0
  const lastElapsedMs = Math.max(lastEventMs, lastCalcMs)
```

(6) `rehydrateRun`의 `{ ...rest, offProgress: rest.offProgress ?? [], startedAtMs:`를 `{ ...rest, offProgress: rest.offProgress ?? [], calculatorLog: rest.calculatorLog ?? [], calculatorLogTruncated: rest.calculatorLogTruncated ?? false, startedAtMs:`로 바꾼다(줄의 나머지는 그대로).

(7) 파일 맨 끝에 더한다.

```ts

// ---------- 계산기 기록(계산기 설계 §3) ----------

/** 과제별 계산기 종류: 최소회전반경은 sin이 있어 공학용, 제동력은 일반 */
export function calculatorKindOf(task: Pick<ApprovedTask, 'taskId'>): CalculatorKind {
  return task.taskId === 'min-turning-radius' ? 'scientific' : 'basic'
}

/** 계산기를 쓰는 기록 단계: 제동력 계산·판정(calc), 최소회전반경 반경·판정(record) */
export function calculatorStepOf(task: Pick<ApprovedTask, 'taskId'>): string {
  return task.taskId === 'min-turning-radius' ? 'record' : 'calc'
}

/** = 를 누를 때 한 줄을 남긴다. 멈춤 중이면 남기지 않고, 상한을 넘으면 넘침만 표시한다. 경과 시간은 거꾸로 가지 않는다.
 *  값이 없는 칸은 만들지 않는다(IndexedDB가 undefined 칸을 보존해 기록 모양이 달라지지 않게) */
export function logCalculation(run: TaskRun, c: { expression: string; result: string | null; error: CalculatorError | null }): TaskRun {
  if (run.paused) return run
  if (run.calculatorLog.length >= CALCULATOR_LOG_LIMIT) return run.calculatorLogTruncated ? run : carry(run, { ...run, calculatorLogTruncated: true })
  const prev = run.calculatorLog[run.calculatorLog.length - 1]
  const elapsedMs = Math.max(prev ? prev.elapsedMs : 0, Math.round(depsOf(run).now() - run.startedAtMs))
  const entry: CalculatorEntry = {
    sequence: run.calculatorLog.length + 1,
    elapsedMs,
    stepId: calculatorStepOf(run.task),
    kind: calculatorKindOf(run.task),
    expression: c.expression.slice(0, 80),
    ...(c.error ? { error: c.error } : { result: (c.result ?? '').slice(0, 24) }),
  }
  return carry(run, { ...run, calculatorLog: [...run.calculatorLog, entry] })
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/domain/taskEngine.ts tests/calculatorLog.test.ts
git commit -m "feat(엔진): 계산기 기록 — =마다 식·결과를 사건과 따로 쌓기(60줄 상한·넘침), 초안 저장·복원" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 계산 규칙 — 일반(누르는 차례대로)·공학용(식)

**Files:**
- Create: `src/app/calculator.ts`
- Test: `tests/calculator.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/calculator.test.ts`

```ts
// 계산기 계산 규칙(계산기 설계 §2) — 일반(누르는 차례대로 바로 계산)·공학용(식, 곱셈·나눗셈 먼저, 괄호·sin 도)
import { describe, expect, test } from 'vitest'
import { basicInit, basicPress, basicView, displayExpr, evaluateExpression, formatCalc, sciInit, sciPress, sciView, type BasicKey, type CalcEvaluation, type SciKey } from '../src/app/calculator'

function run<S, K extends string>(init: () => S, press: (s: S, k: K) => { state: S; evaluated: CalcEvaluation | null }, seq: string) {
  let st = init()
  const ev: CalcEvaluation[] = []
  for (const k of seq.split(' ')) { const r = press(st, k as K); st = r.state; if (r.evaluated) ev.push(r.evaluated) }
  return { st, ev }
}
const runBasic = (seq: string) => { const r = run(basicInit, basicPress, seq); return { ...r, view: basicView(r.st) } }
const runSci = (seq: string) => { const r = run(sciInit, sciPress, seq); return { ...r, view: sciView(r.st) } }

describe('표시', () => {
  test('10자리 유효숫자, 끝의 0 지움, 소수 첫째 자리에서 자르지 않음', () => {
    expect(formatCalc((40 / 600) * 100)).toBe('6.666666667')
    expect(formatCalc(0.49999999999999994)).toBe('0.5')
    expect(formatCalc(5.500000000000001)).toBe('5.5')
    expect(formatCalc(-0)).toBe('0')
    expect(formatCalc(10)).toBe('10')
    expect(formatCalc(1e-7)).toBe('1e-7')
    expect(formatCalc(Infinity)).toBeNull()
    expect(displayExpr('240-200/600*100')).toBe('240−200÷600×100')
  })
})

describe('일반 계산기(제동력): 누르는 차례대로 바로 계산', () => {
  test('240 − 200 ÷ 600 × 100 = 은 왼쪽부터 계산해 6.666666667', () => {
    const { ev, view } = runBasic('2 4 0 - 2 0 0 / 6 0 0 * 1 0 0 =')
    expect(ev).toEqual([{ expression: '240-200/600*100', result: '6.666666667', error: null }])
    expect(view).toEqual({ process: '240−200÷600×100 =', main: '6.666666667' })
  })
  test('연산자를 누르면 그때까지의 결과를 보인다', () => {
    expect(runBasic('2 4 0 - 2 0 0 /').view).toEqual({ process: '240−200÷', main: '40' })
  })
  test('연산자를 잇달아 누르면 마지막 것으로 바꾼다', () => {
    expect(runBasic('5 + - 3 =').ev).toEqual([{ expression: '5-3', result: '2', error: null }])
  })
  test('= 뒤 연산자는 결과에서 이어 계산, 숫자는 새 계산', () => {
    expect(runBasic('2 4 0 - 2 0 0 / 6 0 0 * 1 0 0 = * 2 =').ev[1]).toEqual({ expression: '6.666666667*2', result: '13.33333333', error: null })
    expect(runBasic('1 + 1 = 5').view).toEqual({ process: '5', main: '5' })
  })
  test('0으로 나누면 오류, AC만 받는다', () => {
    const { st, ev, view } = runBasic('5 / 0 =')
    expect(ev).toEqual([{ expression: '5/0', result: null, error: 'divideByZero' }])
    expect(view.main).toBe('오류')
    expect(basicPress(st, '7').state).toBe(st)
    expect(basicPress(st, 'AC').state).toEqual(basicInit())
  })
  test('⌫는 지금 수의 한 글자, 앞 0·소수점 두 번은 무시, 연산자·둘째 수 없이 = 는 남기지 않음', () => {
    expect(runBasic('1 2 BS').view.main).toBe('1')
    expect(runBasic('0 0 5').view.main).toBe('5')
    expect(runBasic('1 . . 5').view.main).toBe('1.5')
    expect(runBasic('. 5').view.main).toBe('0.5')
    expect(runBasic('7 =').ev).toEqual([])
    expect(runBasic('7 + =').ev).toEqual([])
  })
  test('한 수는 10자리까지, 누른 과정은 80자까지', () => {
    expect(runBasic('1 2 3 4 5 6 7 8 9 0 1').view.main).toBe('1234567890')
    let st = basicInit()
    for (let i = 0; i < 50; i++) for (const k of ['1', '2', '3', '+'] as BasicKey[]) st = basicPress(st, k).state
    expect((st.prefix + st.entry).length).toBeLessThanOrEqual(80)
  })
})

describe('공학용 계산기(최소회전반경): 식, 곱셈·나눗셈 먼저, 괄호·sin(도)', () => {
  test('2.7 ÷ sin(32) + 0.1 = 5.19511577, sin 30° = 0.5', () => {
    expect(runSci('2 . 7 / sin 3 2 ) + 0 . 1 =').ev).toEqual([{ expression: '2.7/sin(32)+0.1', result: '5.19511577', error: null }])
    expect(runSci('sin 3 0 ) =').ev[0]!.result).toBe('0.5')
  })
  test('곱셈·나눗셈 먼저와 괄호 — 같은 글자도 일반 계산기와 답이 다르다', () => {
    expect(runSci('2 4 0 - 2 0 0 / 6 0 0 * 1 0 0 =').ev[0]!.result).toBe('206.6666667')
    expect(runSci('( 2 4 0 - 2 0 0 ) / 6 0 0 * 1 0 0 =').ev[0]!.result).toBe('6.666666667')
  })
  test('닫는 괄호를 빠뜨리면 = 때 자동으로 닫는다', () => {
    expect(runSci('2 . 7 / sin 3 0 =').ev[0]).toEqual({ expression: '2.7/sin(30)', result: '5.4', error: null })
  })
  test('앞의 −, 곱셈 뒤 −', () => {
    expect(evaluateExpression('-2*3')).toEqual({ value: -6 })
    expect(evaluateExpression('2*-3')).toEqual({ value: -6 })
  })
  test('식 오류·수학 오류, 식은 남아 고칠 수 있다', () => {
    const { st, ev, view } = runSci('2 sin 3 0 =')
    expect(ev).toEqual([{ expression: '2sin(30)', result: null, error: 'syntax' }])
    expect(view).toEqual({ expression: '2sin(30', result: '식 오류' })
    expect(sciView(sciPress(st, 'BS').state).result).toBe('')
    expect(runSci('1 / ( 1 - 1 ) =').ev[0]).toEqual({ expression: '1/(1-1)', result: null, error: 'divideByZero' })
    expect(runSci('3 + =').ev[0]!.error).toBe('syntax')
    expect(evaluateExpression('()')).toEqual({ error: 'syntax' })
  })
  test('sin 은 한 조각이라 ⌫ 한 번에 지운다', () => {
    expect(runSci('2 / sin BS').view.expression).toBe('2÷')
  })
  test('= 뒤 연산자는 직전 결과에 이어 쓰고, 숫자는 새 식', () => {
    expect(runSci('1 + 1 = * 3 =').ev[1]).toEqual({ expression: '2*3', result: '6', error: null })
    expect(runSci('1 + 1 = 4').view).toEqual({ expression: '4', result: '' })
  })
  test('빈 식의 = 는 남기지 않고, 식은 60자까지', () => {
    expect(runSci('=').ev).toEqual([])
    let st = sciInit()
    for (let i = 0; i < 40; i++) for (const k of ['1', '+'] as SciKey[]) st = sciPress(st, k).state
    expect(st.pieces.join('').length).toBeLessThanOrEqual(60)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/calculator.test.ts`
Expected: FAIL — `src/app/calculator.ts` 없음

- [ ] **Step 3: 구현** — `src/app/calculator.ts`(새 파일, 전체)

```ts
// 계산·판정 장면 전자계산기의 계산 규칙(설계 docs/superpowers/specs/2026-11-11-calculator-design.md §2). 화면·저장소와 무관한 순수 함수.
// 제동력: 일반 계산기 — 누르는 차례대로 바로 계산(탁상 계산기). 최소회전반경: 공학용 — 식 입력, 곱셈·나눗셈 먼저, 괄호·sin(도 단위).
// 식은 + - * / 와 sin( ) 로 적어 기록하고, 화면에는 × ÷ − 로 보인다(displayExpr).
import type { CalculatorError } from '../domain/taskEngine'

/** = 를 누를 때 기록으로 넘기는 값(logCalculation의 입력). result와 error 중 하나만 null이 아니다 */
export interface CalcEvaluation { expression: string; result: string | null; error: CalculatorError | null }
export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
export type CalcOp = '+' | '-' | '*' | '/'
export type BasicKey = Digit | '.' | CalcOp | '=' | 'AC' | 'BS'
export type SciKey = BasicKey | '(' | ')' | 'sin'

/** 한 수의 자릿수 상한(소수점 제외) */
export const MAX_DIGITS = 10
/** 일반 계산기: 한 번의 계산에 누른 과정 상한 */
export const BASIC_MAX_CHARS = 80
/** 공학용: 식 상한(자동으로 닫는 괄호 전) */
export const SCI_MAX_CHARS = 60

const isDigit = (k: string): k is Digit => k.length === 1 && k >= '0' && k <= '9'
const isOp = (k: string): k is CalcOp => k === '+' || k === '-' || k === '*' || k === '/'

/** 10자리 유효숫자로 반올림해 보이고 끝의 0은 지운다. 소수 첫째 자리에서 자르지 않는다(자르기는 학생 몫). 수가 아니면 null */
export function formatCalc(x: number): string | null {
  if (!Number.isFinite(x)) return null
  if (x === 0) return '0'
  return String(Number(x.toPrecision(10)))
}

/** 화면 표시: * / - 를 × ÷ − 로 */
export function displayExpr(s: string): string {
  return s.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−')
}

// ---------- 일반 계산기(제동력): 누르는 차례대로 바로 계산 ----------

export interface BasicState {
  /** 이번 계산에서 확정한 앞부분(예: '240-200/') */
  prefix: string
  /** 지금 적는 수(없으면 '') */
  entry: string
  /** 앞부분을 왼쪽부터 계산한 값 */
  acc: number | null
  op: CalcOp | null
  /** 직전 = 의 값과 식(= 뒤 화면, 이어 계산) */
  last: { value: number; expression: string } | null
  done: boolean
  error: boolean
}

export const basicInit = (): BasicState => ({ prefix: '', entry: '', acc: null, op: null, last: null, done: false, error: false })

function apply(a: number, op: CalcOp, b: number): number | null {
  if (op === '/' && b === 0) return null
  const v = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b
  return Number.isFinite(v) ? v : null
}

export function basicPress(s: BasicState, k: BasicKey): { state: BasicState; evaluated: CalcEvaluation | null } {
  const same = { state: s, evaluated: null }
  if (k === 'AC') return { state: basicInit(), evaluated: null }
  if (s.error) return same
  if (isDigit(k) || k === '.') {
    const base: BasicState = s.done ? { ...basicInit(), last: s.last } : s
    if (k === '.' && base.entry.includes('.')) return same
    const entry = k === '.' ? (base.entry === '' ? '0.' : base.entry + '.') : base.entry === '0' ? k : base.entry + k
    if (entry.replace(/\D/g, '').length > MAX_DIGITS || (base.prefix + entry).length > BASIC_MAX_CHARS) return same
    return { state: { ...base, entry }, evaluated: null }
  }
  if (k === 'BS') return s.done || s.entry === '' ? same : { state: { ...s, entry: s.entry.slice(0, -1) }, evaluated: null }
  if (k === '=') {
    if (s.op === null || s.acc === null || s.entry === '') return same
    const expression = s.prefix + s.entry
    const v = apply(s.acc, s.op, Number(s.entry))
    if (v === null) return { state: { ...s, error: true }, evaluated: { expression, result: null, error: 'divideByZero' } }
    return { state: { ...basicInit(), last: { value: v, expression }, done: true }, evaluated: { expression, result: formatCalc(v), error: null } }
  }
  // 연산자
  if (s.done) {
    if (!s.last) return same
    return { state: { ...basicInit(), last: s.last, prefix: (formatCalc(s.last.value) ?? '0') + k, acc: s.last.value, op: k }, evaluated: null }
  }
  if (s.entry !== '') {
    const prefix = s.prefix + s.entry + k
    if (prefix.length > BASIC_MAX_CHARS) return same
    const value = Number(s.entry)
    const acc = s.acc === null || s.op === null ? value : apply(s.acc, s.op, value)
    if (acc === null) return { state: { ...s, prefix, entry: '', error: true }, evaluated: null }
    return { state: { ...s, prefix, entry: '', acc, op: k }, evaluated: null }
  }
  if (s.op !== null) return { state: { ...s, prefix: s.prefix.slice(0, -1) + k, op: k }, evaluated: null }
  return same
}

export function basicView(s: BasicState): { process: string; main: string } {
  if (s.error) return { process: displayExpr(s.prefix + s.entry), main: '오류' }
  if (s.done && s.last) return { process: `${displayExpr(s.last.expression)} =`, main: formatCalc(s.last.value) ?? '오류' }
  const main = s.entry !== '' ? s.entry : s.acc !== null ? formatCalc(s.acc) ?? '오류' : '0'
  return { process: displayExpr(s.prefix + s.entry), main }
}

// ---------- 공학용 계산기(최소회전반경): 식 입력, 곱셈·나눗셈 먼저, 괄호·sin(도) ----------

export interface SciState {
  /** 적은 조각(sin( 는 한 조각이라 ⌫ 한 번에 지운다). 이어 붙이면 식 */
  pieces: string[]
  last: { value: number; expression: string } | null
  done: boolean
  error: CalculatorError | null
}

export const sciInit = (): SciState => ({ pieces: [], last: null, done: false, error: null })

export function sciPress(s: SciState, k: SciKey): { state: SciState; evaluated: CalcEvaluation | null } {
  if (k === 'AC') return { state: sciInit(), evaluated: null }
  if (k === 'BS') return { state: s.done ? s : { ...s, pieces: s.pieces.slice(0, -1), error: null }, evaluated: null }
  if (k === '=') {
    if (s.done || s.pieces.length === 0) return { state: s, evaluated: null }
    const open = s.pieces.filter((p) => p.endsWith('(')).length - s.pieces.filter((p) => p === ')').length
    const expression = s.pieces.join('') + ')'.repeat(Math.max(0, open))
    const r = evaluateExpression(expression)
    if ('error' in r) return { state: { ...s, error: r.error }, evaluated: { expression, result: null, error: r.error } }
    return { state: { pieces: [], last: { value: r.value, expression }, done: true, error: null }, evaluated: { expression, result: formatCalc(r.value), error: null } }
  }
  const start = s.done ? (isOp(k) && s.last ? [formatCalc(s.last.value) ?? '0'] : []) : s.pieces
  const pieces = [...start, k === 'sin' ? 'sin(' : k]
  if (pieces.join('').length > SCI_MAX_CHARS) return { state: s, evaluated: null }
  return { state: { pieces, last: s.last, done: false, error: null }, evaluated: null }
}

export function sciView(s: SciState): { expression: string; result: string } {
  if (s.done && s.last) return { expression: `${displayExpr(s.last.expression)} =`, result: formatCalc(s.last.value) ?? '수학 오류' }
  return { expression: displayExpr(s.pieces.join('')), result: s.error === 'syntax' ? '식 오류' : s.error === 'divideByZero' ? '수학 오류' : '' }
}

type Tok = { t: 'num'; v: number } | { t: 'op'; v: CalcOp } | { t: '(' } | { t: ')' } | { t: 'sin' }

function tokenize(expr: string): Tok[] | null {
  const out: Tok[] = []
  let i = 0
  while (i < expr.length) {
    if (expr.startsWith('sin(', i)) { out.push({ t: 'sin' }); i += 4; continue }
    const c = expr[i]!
    if (c === '(' || c === ')') { out.push({ t: c }); i++; continue }
    if (isOp(c)) { out.push({ t: 'op', v: c }); i++; continue }
    const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(expr.slice(i))
    if (!m) return null
    out.push({ t: 'num', v: Number(m[0]) })
    i += m[0].length
  }
  return out
}

class CalcFail {
  error: CalculatorError
  constructor(error: CalculatorError) { this.error = error }
}

/** 공학용 식 계산: 곱셈·나눗셈 먼저, 괄호, 앞의 ±, sin(도). 곱셈 생략(2sin(30))은 식 오류. 0으로 나누거나 값이 수가 아니면 divideByZero */
export function evaluateExpression(expr: string): { value: number } | { error: CalculatorError } {
  const toks = tokenize(expr)
  if (!toks || toks.length === 0) return { error: 'syntax' }
  let i = 0
  const fail = (e: CalculatorError): never => { throw new CalcFail(e) }
  const primary = (): number => {
    const t = toks[i++]
    if (!t) return fail('syntax')
    if (t.t === 'num') return t.v
    if (t.t === '(' || t.t === 'sin') {
      const v = sum()
      if (toks[i]?.t !== ')') return fail('syntax')
      i++
      return t.t === 'sin' ? Math.sin((v * Math.PI) / 180) : v
    }
    return fail('syntax')
  }
  const unary = (): number => {
    const t = toks[i]
    if (t && t.t === 'op' && (t.v === '-' || t.v === '+')) { i++; const v = unary(); return t.v === '-' ? -v : v }
    return primary()
  }
  const product = (): number => {
    let v = unary()
    for (;;) {
      const t = toks[i]
      if (!t || t.t !== 'op' || (t.v !== '*' && t.v !== '/')) return v
      i++
      const r = unary()
      if (t.v === '/' && r === 0) return fail('divideByZero')
      v = t.v === '*' ? v * r : v / r
    }
  }
  const sum = (): number => {
    let v = product()
    for (;;) {
      const t = toks[i]
      if (!t || t.t !== 'op' || (t.v !== '+' && t.v !== '-')) return v
      i++
      const r = product()
      v = t.v === '+' ? v + r : v - r
    }
  }
  try {
    const v = sum()
    if (i !== toks.length) return { error: 'syntax' }
    return Number.isFinite(v) ? { value: v } : { error: 'divideByZero' }
  } catch (e) {
    if (e instanceof CalcFail) return { error: e.error }
    throw e
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/app/calculator.ts tests/calculator.test.ts
git commit -m "feat(계산기): 계산 규칙 — 일반은 누르는 차례대로, 공학용은 식(곱셈·나눗셈 먼저·괄호·sin 도), 10자리 표시" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 사례 지킴이 — sin 표와 계산기 sin이 같은 답

**Files:**
- Test: `tests/calculatorCaseGuard.test.ts`(새, 시험만)

- [ ] **Step 1: 시험 쓰기** — `tests/calculatorCaseGuard.test.ts`

```ts
// 사례 지킴이(계산기 설계 §6): 계산기의 정확한 sin과 sin 표로 낸 답이 기재 규칙(소수 첫째 자리, 둘째 자리 버림) 뒤 같고,
// 정확한 값이 절사 경계에 너무 가깝지 않다. 새 사례를 만들면 여기에 더한다
import { describe, expect, test } from 'vitest'
import b1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import b2 from '../src/data/tasks/task.braking-force.case-lv2.json'
import t1 from '../src/data/tasks/task.min-turning-radius.case-lv1.json'
import t2 from '../src/data/tasks/task.min-turning-radius.case-lv2.json'
import { createResponseSheet } from '../src/domain/grading'
import type { ApprovedTask } from '../src/domain/types'

const trunc1 = (x: number) => Math.floor(x * 10 + 1e-9) / 10
/** 0.1 단위 경계까지 거리. 정확히 경계 위(1e-9 안)는 0 */
const gap = (x: number) => { const lo = x - trunc1(x); return lo < 1e-9 ? 0 : Math.min(lo, trunc1(x) + 0.1 - x) }
const safe = (x: number) => gap(x) === 0 || gap(x) >= 1e-4
const ref = (task: ApprovedTask, itemId: string) => createResponseSheet(task).items.find((i) => i.itemId === itemId)!.referenceValue

describe('최소회전반경: sin 표와 계산기 sin이 같은 답(§6)', () => {
  for (const [label, raw] of [['사례 1', t1], ['사례 2', t2]] as const) {
    test(label, () => {
      const task = raw as unknown as ApprovedTask
      const m = task.measurement as unknown as { wheelbaseM: number; kingpinOffsetM: number; turnDirection: 'left' | 'right'; leftAngleDeg: number; rightAngleDeg: number; sinTable: Record<string, number> }
      const outer = m.turnDirection === 'left' ? m.rightAngleDeg : m.leftAngleDeg // 회전할 때 바깥쪽 앞바퀴
      const byTable = m.wheelbaseM / m.sinTable[String(outer)]! + m.kingpinOffsetM
      const byCalc = m.wheelbaseM / Math.sin((outer * Math.PI) / 180) + m.kingpinOffsetM
      expect(trunc1(byTable)).toBe(ref(task, 'radius'))
      expect(trunc1(byCalc)).toBe(ref(task, 'radius'))
      expect(safe(byTable)).toBe(true)
      expect(safe(byCalc)).toBe(true)
    })
  }
})

describe('제동력: 계산기로 낸 편차·합이 기준값과 같고 절사 경계에 너무 가깝지 않다(§6)', () => {
  for (const [label, raw] of [['사례 1', b1], ['사례 2', b2]] as const) {
    test(label, () => {
      const task = raw as unknown as ApprovedTask
      const m = task.measurement as unknown as { axleWeight: number; left: number; right: number }
      const deviation = (Math.abs(m.left - m.right) / m.axleWeight) * 100 // 일반 계산기의 왼쪽부터 계산과 같은 순서
      const sum = ((m.left + m.right) / m.axleWeight) * 100
      expect(trunc1(deviation)).toBe(ref(task, 'deviation'))
      expect(trunc1(sum)).toBe(ref(task, 'sum'))
      expect(safe(deviation)).toBe(true)
      expect(safe(sum)).toBe(true)
    })
  }
})
```

- [ ] **Step 2: 실행** — 지금 사례는 모두 지키므로 처음부터 통과해야 한다(지킴이 시험).

Run: `npm test -- tests/calculatorCaseGuard.test.ts`
Expected: PASS(4건). 실패하면 사례 자료나 기준값 계산이 설계 §6과 다르다는 뜻이다. 사례나 엔진을 고치지 말고 멈춰서 실패 내용을 보고한다.

- [ ] **Step 3: 형 검사**

Run: `node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add tests/calculatorCaseGuard.test.ts
git commit -m "test(계산기): 사례 지킴이 — sin 표와 계산기 sin이 절사 뒤 같은 답, 경계에서 충분히 멂" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 기록 판 1.3.0 계약과 서버 접수

**Files:**
- Create: `docs/design/contracts/record.schema.v1.3.0.json`(생성 명령으로)
- Modify: `docs/design/contracts/schema-index.json`
- Modify: `scripts/build-apps-script-schema.mjs`
- Regenerate: `archive/apps-script/Schemas.gs`
- Modify: `archive/apps-script/Code.gs:8`, `archive/apps-script/Validate.gs`(`validateRecordSemantics_`)
- Regenerate: `supabase/functions/_shared/receiverCore.generated.js`, `supabase/functions/_shared/receiverCore.generated.d.ts`
- Test: `tests/supabaseSubmit.test.ts`(맨 끝에 더하기)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/supabaseSubmit.test.ts` 맨 끝에 더한다(이 파일에 이미 있는 `lv1`·`createDemoSession`·`createTaskRun`·`buildRecordPayload`·`server`·`reqOf`·`ApprovedTask`를 쓴다).

```ts
describe('기록 판 1.3.0 — 계산기 기록(계산기 설계 §4)', () => {
  // 지금 앱이 만드는 기록을 1.3.0 모양으로 바꿔 서버 쪽만 먼저 시험한다(Task 5에서 앱이 직접 1.3.0을 만든다)
  const base = (): Record<string, unknown> => {
    const task = lv1 as ApprovedTask
    const session = createDemoSession({ studentCode: 'D-03', sessionCode: 'DEMO-ONLY', attemptRole: 'practice', usagePhase: 'preview', vehicleEntryDirection: 'south', task, difficultyMode: 'guided' })
    const run = createTaskRun(task, { difficultyMode: 'guided', displayMode: 'threeD' })
    const p = buildRecordPayload(run, session, { completedAtIso: new Date(run.startedAtMs + 5000).toISOString(), completionStatus: 'aborted' }) as unknown as Record<string, unknown>
    return { ...p, schemaVersion: '1.3.0', calculatorLog: [], calculatorLogTruncated: false }
  }
  const line = (o: Record<string, unknown> = {}) => ({ sequence: 1, elapsedMs: 1000, stepId: 'calc', kind: 'basic', expression: '240-200/600*100', result: '6.666666667', ...o })
  test('계산기 기록이 있는 1.3.0 기록과 빈 계산 기록의 1.3.0 기록을 받는다', async () => {
    const { post, rows } = server()
    const withLog = { ...base(), calculatorLog: [line(), { sequence: 2, elapsedMs: 2000, stepId: 'calc', kind: 'basic', expression: '5/0', error: 'divideByZero' }] }
    expect(await post(reqOf(withLog))).toMatchObject({ ok: true, duplicate: false })
    expect(await post(reqOf({ ...base(), recordId: '00000000-0000-4000-8000-0000000000b1' }))).toMatchObject({ ok: true, duplicate: false })
    expect(rows).toHaveLength(2)
  })
  test('순번이 끊김·시간이 거꾸로·결과와 오류가 둘 다·둘 다 없음·과제와 다른 종류·단계는 거절한다', async () => {
    const bad: unknown[][] = [
      [line({ sequence: 2 })],
      [line(), line({ sequence: 2, elapsedMs: 500 })],
      [line({ error: 'syntax' })],
      [{ sequence: 1, elapsedMs: 1000, stepId: 'calc', kind: 'basic', expression: '1+' }],
      [line({ kind: 'scientific' })],
      [line({ stepId: 'record' })],
    ]
    for (const [k, log] of bad.entries()) {
      const { post, rows } = server()
      expect(await post(reqOf({ ...base(), recordId: `00000000-0000-4000-8000-0000000000c${k}`, calculatorLog: log })), `경우 ${k}`).toMatchObject({ ok: false })
      expect(rows).toHaveLength(0)
    }
  })
  test('61줄과, 계산기 칸이 빠진 1.3.0은 거절한다', async () => {
    const { post } = server()
    const many = Array.from({ length: 61 }, (_, i) => line({ sequence: i + 1, elapsedMs: 1000 + i }))
    expect(await post(reqOf({ ...base(), calculatorLog: many }))).toMatchObject({ ok: false })
    const { calculatorLog: _c, ...missing } = base()
    expect(await post(reqOf({ ...missing, recordId: '00000000-0000-4000-8000-0000000000d1' }))).toMatchObject({ ok: false })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/supabaseSubmit.test.ts`
Expected: FAIL — 1.3.0을 모르는 서버가 첫 시험을 `UNSUPPORTED_SCHEMA`로 거절한다(거절 시험들은 이미 통과할 수 있다).

- [ ] **Step 3: 계약 파일 만들기** — 1.2.0을 복사해 두 칸을 더한다(한 번만 실행).

```bash
node -e '
const fs = require("fs")
const s = JSON.parse(fs.readFileSync("docs/design/contracts/record.schema.v1.2.0.json", "utf8"))
s.$id = "urn:chassis-3d-lab:record:1.3.0"
s.title = "확정 수행 내용: 검토용 계약, 전송 상태는 별도 (1.3.0)"
s.$comment = "1.3.0(2026-11-11): 1.2.0과 같고 계산기 기록 두 칸만 더함 — calculatorLog(= 를 누를 때마다 식·결과, 최대 60줄)와 calculatorLogTruncated. 두 과제 모두 앱 0.3.2-demo부터 1.3.0으로 기록. 결과·오류 중 하나만 있는지, 순번·시간 순서, 과제별 단계·종류는 서버 의미 검사(Validate.gs)가 본다. 설계 docs/superpowers/specs/2026-11-11-calculator-design.md"
s.properties.schemaVersion = { const: "1.3.0" }
s.properties.calculatorLog = { type: "array", maxItems: 60, items: { type: "object", properties: { sequence: { type: "integer", minimum: 1 }, elapsedMs: { type: "integer", minimum: 0 }, stepId: { type: "string", minLength: 1, maxLength: 64 }, kind: { enum: ["basic", "scientific"] }, expression: { type: "string", minLength: 1, maxLength: 80 }, result: { type: "string", minLength: 1, maxLength: 24 }, error: { enum: ["divideByZero", "syntax"] } }, required: ["sequence", "elapsedMs", "stepId", "kind", "expression"], additionalProperties: false } }
s.properties.calculatorLogTruncated = { type: "boolean" }
s.required = [...s.required, "calculatorLog", "calculatorLogTruncated"]
fs.writeFileSync("docs/design/contracts/record.schema.v1.3.0.json", JSON.stringify(s, null, 2) + "\n")
console.log("written", s.$id)
'
```

Expected 출력: `written urn:chassis-3d-lab:record:1.3.0`

- [ ] **Step 4: 계약 목록** — `docs/design/contracts/schema-index.json`

- `"current"` 안의 `"recordTurning": { … }` 항목 뒤에 다음 항목을 더한다(앞 항목 끝에 쉼표).

```json
    "recordCalculator": {
      "schemaId": "urn:chassis-3d-lab:record:1.3.0",
      "path": "record.schema.v1.3.0.json",
      "note": "계산기 기록(calculatorLog) 추가(2026-11-11). 두 과제 모두 앱 0.3.2-demo부터 1.3.0으로 기록. 서버는 1.0.0~1.3.0을 받는다"
    }
```

- `"recordIngestionVersions": ["1.0.0", "1.1.0"]`을 `["1.0.0", "1.1.0", "1.2.0", "1.3.0"]`으로 바꾼다.
- 고친 뒤 `node -e 'JSON.parse(require("fs").readFileSync("docs/design/contracts/schema-index.json","utf8"))'`가 오류 없이 끝나야 한다.

- [ ] **Step 5: 서버 스키마 생성 스크립트** — `scripts/build-apps-script-schema.mjs`

`const legacy = …` 줄 아래에 더한다.

```js
const v130 = JSON.parse(readFileSync(new URL('../docs/design/contracts/record.schema.v1.3.0.json', import.meta.url), 'utf8'))
```

그리고 바꿀 곳:

```js
var RECORD_SCHEMAS = { '1.0.0': ${JSON.stringify(legacy)}, '1.1.0': ${JSON.stringify(schema)}, '1.2.0': ${JSON.stringify(v120)} };
```

바꾼 글:

```js
var RECORD_SCHEMAS = { '1.0.0': ${JSON.stringify(legacy)}, '1.1.0': ${JSON.stringify(schema)}, '1.2.0': ${JSON.stringify(v120)}, '1.3.0': ${JSON.stringify(v130)} };
```

그리고 `console.log('Schemas.gs written', legacy.$id, schema.$id, v120.$id)`를 `console.log('Schemas.gs written', legacy.$id, schema.$id, v120.$id, v130.$id)`로 바꾼다.

Run: `npm run build:gs-schema`
Expected: `Schemas.gs written … urn:chassis-3d-lab:record:1.3.0`

- [ ] **Step 6: 지원 판** — `archive/apps-script/Code.gs`

`var SUPPORTED_RECORD_VERSIONS = ['1.0.0', '1.1.0', '1.2.0'];`를 `var SUPPORTED_RECORD_VERSIONS = ['1.0.0', '1.1.0', '1.2.0', '1.3.0'];`로 바꾼다.

- [ ] **Step 7: 의미 검사** — `archive/apps-script/Validate.gs`

`validateRecordSemantics_` 안의 `  if (p.researchEligible !== false) errors.push('researchEligible must be false for test intake');` 줄 바로 앞에 더한다(Apps Script 문법이라 `var`를 쓴다).

```js
  // 계산기 기록(1.3.0, 계산기 설계 §4.2): 순번 1부터 차례, 시간 순서, 결과·오류 중 하나만, 과제별 단계·종류
  if (Array.isArray(p.calculatorLog)) {
    var calcKind = p.taskId === 'min-turning-radius' ? 'scientific' : 'basic';
    var calcStep = p.taskId === 'min-turning-radius' ? 'record' : 'calc';
    var lastCalcMs = -1;
    for (var ci = 0; ci < p.calculatorLog.length; ci++) {
      var ce = p.calculatorLog[ci];
      if (ce.sequence !== ci + 1) errors.push('calculatorLog: sequence gap at ' + ci);
      if (typeof ce.elapsedMs === 'number') { if (ce.elapsedMs < lastCalcMs) errors.push('calculatorLog: elapsedMs decreases at ' + ci); lastCalcMs = ce.elapsedMs; }
      if ((typeof ce.result === 'string') === (typeof ce.error === 'string')) errors.push('calculatorLog: result xor error at ' + ci);
      if (ce.kind !== calcKind || ce.stepId !== calcStep) errors.push('calculatorLog: kind or stepId does not match task at ' + ci);
    }
    if (p.calculatorLog.length > 60) errors.push('calculatorLog: too many lines');
  }
```

- [ ] **Step 8: 수신 코어 다시 만들기**

Run: `node scripts/build-receiver-core.mjs`
Expected: `supabase/functions/_shared/receiverCore.generated.js`와 `.d.ts`가 바뀐다(`git status`로 확인).

- [ ] **Step 9: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS. `tests/receiverCoreFresh.test.ts`(생성 코어가 최신인지)와 Apps Script 시험들도 포함한다.

- [ ] **Step 10: 커밋**

```bash
git add docs/design/contracts/record.schema.v1.3.0.json docs/design/contracts/schema-index.json scripts/build-apps-script-schema.mjs archive/apps-script/Schemas.gs archive/apps-script/Code.gs archive/apps-script/Validate.gs supabase/functions/_shared/receiverCore.generated.js supabase/functions/_shared/receiverCore.generated.d.ts tests/supabaseSubmit.test.ts
git commit -m "feat(기록·서버): 기록 판 1.3.0(계산기 기록) 계약과 접수 — 순번·시간·결과/오류·과제별 종류 검사, 60줄 상한" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 앱이 1.3.0 기록을 만든다(크기 예산 포함)

**Files:**
- Modify: `src/domain/record.ts`
- Modify: `tests/record.test.ts`
- Modify: `tests/supabaseSubmit.test.ts`(최소회전반경 완료 기록 시험)

- [ ] **Step 1: 시험 고치기와 더하기**

(a) `tests/record.test.ts`
- `import recordSchema from '../docs/design/contracts/record.schema.json'`를 `import recordSchema from '../docs/design/contracts/record.schema.v1.3.0.json'`으로 바꾼다.
- `describe('기록 payload — 계약 1.1.0 형식', …)` 제목을 `describe('기록 payload — 계약 1.3.0 형식', …)`로 바꾼다.
- 첫 시험의 제목 `'완료 수행은 record.schema.json(1.1.0) 검사를 통과하고 usagePhase를 담는다'`를 `'완료 수행은 record.schema.v1.3.0.json 검사를 통과하고 usagePhase와 빈 계산기 기록을 담는다'`로 바꾼다.
- 그 시험의 `expect(payload.schemaVersion).toBe('1.1.0')`를 다음 세 줄로 바꾼다.

```ts
    expect(payload.schemaVersion).toBe('1.3.0')
    expect(payload.calculatorLog).toEqual([])
    expect(payload.calculatorLogTruncated).toBe(false)
```

- import에 `appendEvent, logCalculation`(from `'../src/domain/taskEngine'`), `buildRecordPayload, RECORD_BYTES_BUDGET`(record에서 이미 `buildRecordPayload`를 가져오면 `RECORD_BYTES_BUDGET`만 더함), `CANONICAL_MAX_BYTES`(from `'../src/delivery/submit'`)를 더한다. 파일 맨 끝에 다음을 더한다.

```ts
describe('계산기 기록(계산기 설계 §3·§4)', () => {
  const bytes = (p: unknown) => new TextEncoder().encode(JSON.stringify(p)).length
  test('= 기록이 기록에 들어가고 1.3.0 검사를 통과한다', () => {
    let run = fullRun()
    run = logCalculation(run, { expression: '250-190/600*100', result: '10', error: null })
    run = logCalculation(run, { expression: '1/0', result: null, error: 'divideByZero' })
    const p = buildRecordPayload(run, demoSession, { completedAtIso: '2026-10-21T13:10:00Z', completionStatus: 'completed' })
    expect(p.calculatorLog).toHaveLength(2)
    expect(p.calculatorLog![1]).toMatchObject({ sequence: 2, error: 'divideByZero' })
    expect(validate(p)).toBe(true)
  })
  test('크기 예산은 서버·앱 정본 상한보다 작다', () => {
    expect(RECORD_BYTES_BUDGET).toBeLessThan(CANONICAL_MAX_BYTES)
  })
  test('예산을 넘으면 계산 기록을 뒤에서부터 덜고 넘침을 표시한다(사건은 그대로)', () => {
    let run = fullRun()
    while (run.events.length < 120) run = appendEvent(run, { type: 'feedbackShown', feedbackKind: 'guidance', feedbackKey: 'guidance_padding' }).run
    for (let i = 0; i < 60; i++) run = logCalculation(run, { expression: `${'1'.repeat(70)}+${i}`, result: '1111111111', error: null })
    const p = buildRecordPayload(run, demoSession, { completedAtIso: '2026-10-21T13:10:00Z', completionStatus: 'completed' })
    expect(bytes(p)).toBeLessThanOrEqual(RECORD_BYTES_BUDGET)
    expect(p.stepEvents).toHaveLength(run.events.length)
    expect(p.calculatorLogTruncated).toBe(true)
    expect(p.calculatorLog!.length).toBeLessThan(60)
    expect(p.calculatorLog).toEqual(run.calculatorLog.slice(0, p.calculatorLog!.length))
  })
  test('작은 기록은 덜지 않는다', () => {
    const run = logCalculation(fullRun(), { expression: '1+1', result: '2', error: null })
    const p = buildRecordPayload(run, demoSession, { completedAtIso: '2026-10-21T13:10:00Z', completionStatus: 'completed' })
    expect(p.calculatorLog).toHaveLength(1)
    expect(p.calculatorLogTruncated).toBe(false)
  })
})
```

(b) `tests/supabaseSubmit.test.ts`의 `'최소회전반경 완료 기록(1.2.0, 합성 코드 D-02)은 끝까지 수행·NPC 통과 뒤 접수된다'` 시험
- 제목의 `1.2.0`을 `1.3.0`으로 바꾼다.
- `run = inspectPerformance(run).run` 줄 바로 앞에 `    run = logCalculation(run, { expression: '2.7/sin(30)+0.1', result: '5.5', error: null })`를 더한다.
- `expect(payload.schemaVersion).toBe('1.2.0')`를 `expect(payload.schemaVersion).toBe('1.3.0')`과 `expect(payload.calculatorLog).toEqual([{ sequence: 1, elapsedMs: expect.any(Number), stepId: 'record', kind: 'scientific', expression: '2.7/sin(30)+0.1', result: '5.5' }])` 두 줄로 바꾼다.
- 파일 위 import `import { submitResponse } from '../src/domain/taskEngine'`를 `import { logCalculation, submitResponse } from '../src/domain/taskEngine'`로 바꾼다.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/record.test.ts tests/supabaseSubmit.test.ts`
Expected: FAIL — 아직 1.1.0·1.2.0을 만들고 `RECORD_BYTES_BUDGET`이 없음

- [ ] **Step 3: 구현** — `src/domain/record.ts`

(1) `import type { DifficultyMode, StepEvent, TaskRun } from './taskEngine'`을 `import type { CalculatorEntry, DifficultyMode, StepEvent, TaskRun } from './taskEngine'`으로 바꾼다.

(2) `RecordPayload`의 `schemaVersion` 두 줄을 바꾼다.

```ts
  /** 1.3.0(계산기 기록, 2026-11-11): 두 과제 모두. 이전 기록은 제동력 1.1.0, 최소회전반경 1.2.0 */
  schemaVersion: '1.1.0' | '1.2.0' | '1.3.0'
```

(3) `RecordPayload`의 `clientAppVersion: string` 줄 아래에 더한다.

```ts
  /** 계산기 기록(1.3.0부터, 계산기 설계 §3). 이전 판 기록에는 없다 */
  calculatorLog?: CalculatorEntry[]
  calculatorLogTruncated?: boolean
```

(4) `buildRecordPayload` 함수 바로 앞에 더한다.

```ts
/** 서버·앱의 정본 상한(CANONICAL_MAX_BYTES 32 KiB, src/delivery/submit.ts)보다 1 KiB 작게 잡은 기록 크기 예산.
 *  넘으면 계산기 기록을 뒤에서부터 덜어 내고 넘침을 표시한다(사건 기록이 우선, 계산기 설계 §3.2) */
export const RECORD_BYTES_BUDGET = 31 * 1024
const payloadBytes = (p: RecordPayload) => new TextEncoder().encode(JSON.stringify(p)).length
function fitBudget(p: RecordPayload): RecordPayload {
  if (!p.calculatorLog || p.calculatorLog.length === 0 || payloadBytes(p) <= RECORD_BYTES_BUDGET) return p
  let log = p.calculatorLog
  while (log.length > 0) {
    log = log.slice(0, -1)
    const q: RecordPayload = { ...p, calculatorLog: log, calculatorLogTruncated: true }
    if (payloadBytes(q) <= RECORD_BYTES_BUDGET) return q
  }
  return { ...p, calculatorLog: [], calculatorLogTruncated: true }
}
```

(5) `buildRecordPayload`에서 세 곳을 바꾼다.
- `  return {`를 `  return fitBudget({`로 바꾼다. 함수 안의 `return {`은 이것 하나다.
- `    schemaVersion: run.task.taskId === 'min-turning-radius' ? '1.2.0' : '1.1.0',`를 `    schemaVersion: '1.3.0', // 계산기 기록(2026-11-11)부터 두 과제 모두. 서버는 1.0.0~1.3.0을 받는다`로 바꾼다.
- 함수 끝을 바꾼다. 바꿀 곳:

```ts
    clientAppVersion: session.clientAppVersion,
  }
}
```

  바꾼 글:

```ts
    clientAppVersion: session.clientAppVersion,
    calculatorLog: run.calculatorLog,
    calculatorLogTruncated: run.calculatorLogTruncated,
  })
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS.

다른 시험이 깨지면 바로 고치지 말고 원인부터 본다. 원인이 "만든 기록이 이제 `schemaVersion: '1.3.0'`이고 계산기 두 칸이 더 있다"는 것뿐이면, 그 시험의 기대값만 새 모양으로 고친다. 고친 시험 이름과 줄을 보고에 적는다. 다른 원인이면 멈추고 보고한다.

- [ ] **Step 5: 커밋**

```bash
git add src/domain/record.ts tests/record.test.ts tests/supabaseSubmit.test.ts
git commit -m "feat(기록): 두 과제 모두 기록 판 1.3.0 — 계산기 기록을 담고, 크기 예산을 넘으면 계산 기록을 뒤에서부터 덜기" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(앞 단계에서 기대값을 고친 다른 시험 파일이 있으면 그 파일도 하나씩 `git add`한다.)

---

### Task 6: 연구용 묶음 — calculator.csv와 설명서

**Files:**
- Modify: `src/records/researchBundle.ts`
- Test: `tests/researchBundle.test.ts`

- [ ] **Step 1: 시험 고치기와 더하기** — `tests/researchBundle.test.ts`
- import의 `ANSWERS_CSV_HEADER, EVENTS_CSV_HEADER,` 뒤에 `CALCULATOR_CSV_HEADER,`를 더한다.
- `'모든 표의 모든 열을 설명하고, 판 정보와 건수를 적는다'` 시험의 `for (const name of ['answers.csv', 'events.csv', 'summary.csv', 'problems.csv'])`를 `for (const name of ['answers.csv', 'events.csv', 'calculator.csv', 'summary.csv', 'problems.csv'])`로 바꾼다.
- 같은 시험의 `expect(readme).toContain(`사건 행 ${b.counts.eventRows}`)` 줄 아래에 `    expect(readme).toContain(`계산 행 ${b.counts.calculatorRows}`)`를 더한다.
- 파일 맨 끝에 더한다.

```ts
describe('계산기 기록 표(계산기 설계 §5)', () => {
  test('= 1번에 1행, 수행 정보와 식·결과·오류가 그대로 나온다', async () => {
    const p = { ...makePayload(), calculatorLog: [
      { sequence: 1, elapsedMs: 1000, stepId: 'calc', kind: 'basic', expression: '240-200/600*100', result: '6.666666667' },
      { sequence: 2, elapsedMs: 2000, stepId: 'calc', kind: 'basic', expression: '5/0', error: 'divideByZero' },
    ], calculatorLogTruncated: false } as RecordPayload
    const b = await bundle(deviceRows([{ payload: p, envelope: env(p.recordId) }]))
    expect(b.counts.calculatorRows).toBe(2)
    expect(parseCsv(file(b, 'calculator.csv'))[0]).toEqual(CALCULATOR_CSV_HEADER)
    const rows = objects(file(b, 'calculator.csv'))
    expect(rows.map((r) => [r.recordId, r.sequence, r.kind, r.expression, r.result, r.error])).toEqual([
      [p.recordId, '1', 'basic', '240-200/600*100', '6.666666667', ''],
      [p.recordId, '2', 'basic', '5/0', '', 'divideByZero'],
    ])
  })
  test('1.3.0보다 앞선 기록(계산기 칸 없음)은 행이 없다', async () => {
    const { calculatorLog: _l, calculatorLogTruncated: _t, ...old } = makePayload()
    const b = await bundle(deviceRows([{ payload: old as RecordPayload, envelope: env(old.recordId) }]))
    expect(b.counts.calculatorRows).toBe(0)
    expect(objects(file(b, 'calculator.csv'))).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/researchBundle.test.ts`
Expected: FAIL — `CALCULATOR_CSV_HEADER`·calculator.csv 없음

- [ ] **Step 3: 구현** — `src/records/researchBundle.ts`

(1) `BundleCounts`에 칸을 더한다. 바꿀 곳:

```ts
export interface BundleCounts { received: number; usable: number; problem: number; hashChecked: number; answerRows: number; eventRows: number }
```

바꾼 글:

```ts
export interface BundleCounts { received: number; usable: number; problem: number; hashChecked: number; answerRows: number; eventRows: number; calculatorRows: number }
```

(2) `export const EVENTS_CSV_HEADER = …` 줄 아래에 더한다.

```ts
const CALCULATOR_FIELDS = ['sequence', 'elapsedMs', 'stepId', 'kind', 'expression', 'result', 'error'] as const
export const CALCULATOR_CSV_HEADER = [...RUN_COLUMNS.map(([k]) => k), ...CALCULATOR_FIELDS]
```

(3) `buildResearchBundle`에서 `const events = …` 줄 아래에 더한다.

```ts
  const calcs = usable.flatMap(({ payload: p }) => (p.calculatorLog ?? []).map((c) => [...RUN_COLUMNS.map(([, f]) => f(p)), ...CALCULATOR_FIELDS.map((k) => c[k] ?? null)]))
```

그리고 `counts`의 `eventRows: events.length }`를 `eventRows: events.length, calculatorRows: calcs.length }`로 바꾼다.

(4) `files`의 `{ name: 'events.csv', text: csv(EVENTS_CSV_HEADER, events) },` 줄 아래에 `      { name: 'calculator.csv', text: csv(CALCULATOR_CSV_HEADER, calcs) },`를 더한다.

(5) 설명서 `readme()`
- `[건수 대조]`의 다음 줄을 바꾼다.

  ```ts
      `- 항목 행 ${c.answerRows} (answers.csv) / 사건 행 ${c.eventRows} (events.csv)`,
  ```

  바꾼 글:

  ```ts
      `- 항목 행 ${c.answerRows} (answers.csv) / 사건 행 ${c.eventRows} (events.csv) / 계산 행 ${c.calculatorRows} (calculator.csv)`,
  ```

- `'[problems.csv — 표에서 분리한 줄]',` 줄 바로 앞에 더한다.

```ts
    '[calculator.csv — 계산기 기록, = 를 누른 1번에 1행]',
    '앞 열은 수행 정보로 summary.csv와 같다. 기록 판 1.3.0(앱 0.3.2-demo)부터 있고, 그 전 기록은 행이 없다. 채점·오류 수와 무관하다.',
    '- sequence: 계산기 기록 순서(1부터)', '- elapsedMs: 시작부터 경과 밀리초(사건과 같은 시계)',
    '- stepId: 계산기를 쓴 기록 단계(calc 제동력 계산·판정, record 최소회전반경 반경·판정)',
    '- kind: basic 일반 계산기(누른 차례대로 바로 계산 — 곱셈·나눗셈을 먼저 하지 않음), scientific 공학용(식 입력, 곱셈·나눗셈 먼저, sin은 도 단위)',
    '- expression: = 를 누를 때까지 누른 식. + - * / 와 sin( ) 로 적는다(화면에는 × ÷ −). 숫자 하나하나와 지우기는 남기지 않는다. - 로 시작하면 수식 막기 작은따옴표가 붙는다',
    '- result: 계산기 화면에 보인 결과(10자리 유효숫자, 소수 첫째 자리로 자르지 않음)',
    '- error: 결과 대신 오류 — divideByZero 0으로 나눔·값 없음, syntax 식 오류',
    '- 한 수행에 60줄까지 남긴다. 넘거나 기록 크기 예산(31 KiB)을 넘으면 뒤의 줄을 덜고 records.jsonl의 calculatorLogTruncated가 true다.', '',
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/records/researchBundle.ts tests/researchBundle.test.ts
git commit -m "feat(연구 묶음): calculator.csv(= 1번에 1행)와 설명서" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 계산기 화면 컴포넌트

**Files:**
- Create: `src/screens/Calculator.tsx`
- Modify: `src/styles.css`(맨 끝에 더하기)
- Test: `tests/calculatorPanel.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/calculatorPanel.test.ts`

```ts
// 계산기 화면(계산기 설계 §2) — 처음엔 닫힌 버튼, 일반·공학용 버튼 배치, 결과 줄 읽기
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { CalculatorPad, CalculatorPanel } from '../src/screens/Calculator'

const pad = (kind: 'basic' | 'scientific') => renderToStaticMarkup(createElement(CalculatorPad, { kind, onEvaluate: () => {} }))

describe('계산기 화면', () => {
  test('처음엔 닫힌 계산기 버튼만 보인다', () => {
    const h = renderToStaticMarkup(createElement(CalculatorPanel, { kind: 'basic', onEvaluate: () => {} }))
    expect(h).toContain('aria-expanded="false"')
    expect(h).toContain('>계산기</button>')
    expect(h).not.toContain('calc-keys')
  })
  test('일반 계산기: 숫자·÷×−+·AC·⌫·=, 괄호·sin·DEG는 없다', () => {
    const h = pad('basic')
    expect(h).toContain('class="calc basic"')
    for (const label of ['÷', '×', '−', '+', 'AC', '⌫', '=', '.', '0', '9']) expect(h).toContain(`>${label}</button>`)
    expect(h).not.toContain('>sin</button>')
    expect(h).not.toContain('>(</button>')
    expect(h).not.toContain('DEG')
    expect(h).toContain('aria-label="나누기"')
    expect(h).toContain('aria-live="polite"')
  })
  test('공학용 계산기: DEG 표시, sin·괄호', () => {
    const h = pad('scientific')
    expect(h).toContain('class="calc scientific"')
    expect(h).toContain('DEG')
    for (const label of ['sin', '(', ')', '÷', '×', '=']) expect(h).toContain(`>${label}</button>`)
    expect(h).toContain('aria-label="사인"')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/calculatorPanel.test.ts`
Expected: FAIL — `src/screens/Calculator.tsx` 없음

- [ ] **Step 3: 구현** — `src/screens/Calculator.tsx`(새 파일, 전체)

```tsx
// 계산·판정 장면 전자계산기(설계 docs/superpowers/specs/2026-11-11-calculator-design.md §2).
// 계산 규칙은 app/calculator.ts(순수 함수). = 를 누르면 onEvaluate로 넘긴다(TaskScreen → logCalculation)
import { useId, useState, type KeyboardEvent } from 'react'
import { basicInit, basicPress, basicView, sciInit, sciPress, sciView, type BasicKey, type CalcEvaluation, type SciKey } from '../app/calculator'
import type { CalculatorKind } from '../domain/taskEngine'

const LABEL: Partial<Record<SciKey, string>> = { '/': '÷', '*': '×', '-': '−', BS: '⌫' }
const NAME: Partial<Record<SciKey, string>> = { '/': '나누기', '*': '곱하기', '-': '빼기', '+': '더하기', BS: '한 글자 지움', AC: '모두 지움', '=': '계산', sin: '사인', '(': '여는 괄호', ')': '닫는 괄호', '.': '소수점' }
/** 버튼 배치: null은 빈자리, [키, 칸 수]는 넓은 버튼 */
type Cell = SciKey | null | [SciKey, number]
const BASIC_ROWS: Cell[][] = [['AC', 'BS', null, '/'], ['7', '8', '9', '*'], ['4', '5', '6', '-'], ['1', '2', '3', '+'], [['0', 2], '.', '=']]
const SCI_ROWS: Cell[][] = [['sin', '(', ')', 'BS', 'AC'], ['7', '8', '9', '/', '*'], ['4', '5', '6', '-', '+'], ['1', '2', '3', '0', '.'], [['=', 5]]]
/** 키보드(계산기 안에 초점이 있을 때). Esc는 다루지 않아 창 닫기로 간다 */
const KEYBOARD: Record<string, SciKey> = { Enter: '=', '=': '=', Backspace: 'BS', '+': '+', '-': '-', '*': '*', '/': '/', '.': '.', '(': '(', ')': ')' }

/** 펼친 계산기 */
export function CalculatorPad({ kind, onEvaluate }: { kind: CalculatorKind; onEvaluate: (e: CalcEvaluation) => void }) {
  const [basic, setBasic] = useState(basicInit)
  const [sci, setSci] = useState(sciInit)
  const press = (k: SciKey) => {
    if (kind === 'basic') {
      if (k === '(' || k === ')' || k === 'sin') return
      const r = basicPress(basic, k as BasicKey)
      setBasic(r.state)
      if (r.evaluated) onEvaluate(r.evaluated)
    } else {
      const r = sciPress(sci, k)
      setSci(r.state)
      if (r.evaluated) onEvaluate(r.evaluated)
    }
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = /^[0-9]$/.test(e.key) ? (e.key as SciKey) : KEYBOARD[e.key]
    if (!k) return
    e.preventDefault() // Enter가 초점 버튼을 한 번 더 누르지 않게
    press(k)
  }
  const top = kind === 'basic' ? basicView(basic).process : sciView(sci).expression
  const main = kind === 'basic' ? basicView(basic).main : sciView(sci).result
  const rows = kind === 'basic' ? BASIC_ROWS : SCI_ROWS
  return (
    <div className={`calc ${kind}`} onKeyDown={onKeyDown}>
      <div className="calc-disp">
        <div className="calc-proc">{kind === 'scientific' && <span className="calc-deg">DEG</span>}{top}</div>
        <output className="calc-main" aria-live="polite">{main}</output>
      </div>
      <div className="calc-keys">
        {rows.flatMap((row, r) => row.map((cell, c) => {
          if (cell === null) return <span key={`gap-${r}-${c}`} aria-hidden="true" />
          const [k, span] = Array.isArray(cell) ? cell : [cell, 1]
          return <button type="button" key={k} className={span > 1 ? `span${span}` : undefined} aria-label={NAME[k]} onClick={() => press(k)}>{LABEL[k] ?? k}</button>
        }))}
      </div>
    </div>
  )
}

/** '계산기' 버튼으로 펼치고 닫는다(처음엔 닫힘). 닫으면 내용이 지워진다(계산 기록은 남는다) */
export function CalculatorPanel({ kind, onEvaluate }: { kind: CalculatorKind; onEvaluate: (e: CalcEvaluation) => void }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="calc-panel">
      <button type="button" className="calc-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? '계산기 닫기' : '계산기'}</button>
      {open && <div id={id}><CalculatorPad kind={kind} onEvaluate={onEvaluate} /></div>}
    </div>
  )
}
```

**`src/styles.css`** 맨 끝에 더한다.

```css
/* 계산·판정 장면 전자계산기(계산기 설계 §2). 버튼은 누르기 크기 44px */
.calc-panel { margin:6px 0 8px; }
.calc-toggle { min-height:44px; }
.calc { margin-top:6px; padding:8px; border:1px solid var(--line); border-radius:8px; background:#fff; max-width:360px; }
.calc-disp { border:1px solid var(--line); border-radius:6px; padding:6px 8px; margin-bottom:6px; text-align:right; background:var(--bg); }
.calc-proc { min-height:18px; font-size:13px; color:var(--mut); overflow-wrap:anywhere; }
.calc-deg { float:left; font-size:11px; font-weight:700; color:var(--acc); }
.calc-main { display:block; min-height:28px; font-size:22px; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
.calc-keys { display:grid; gap:4px; }
.calc.basic .calc-keys { grid-template-columns:repeat(4, minmax(0, 1fr)); }
.calc.scientific .calc-keys { grid-template-columns:repeat(5, minmax(0, 1fr)); }
.calc-keys button { min-height:44px; padding:0; font-size:17px; }
.calc-keys .span2 { grid-column:span 2; }
.calc-keys .span5 { grid-column:span 5; }
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/screens/Calculator.tsx src/styles.css tests/calculatorPanel.test.ts
git commit -m "feat(계산기): 화면 — 처음엔 닫힌 '계산기' 버튼, 일반 4열·공학용 5열(DEG·sin·괄호), 44px 버튼, 키보드" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 기록 창과 기본 화면 계산 표에 붙이기

**Files:**
- Modify: `src/screens/RecordSheet.tsx`
- Modify: `src/screens/TaskScreen.tsx`
- Modify: `tests/recordSheet.test.ts`(렌더 도우미에 `onCalc`)
- Test: `tests/calculatorWiring.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/calculatorWiring.test.ts`

```ts
// 계산기 배선(계산기 설계 §2.1·§3) — 기록 창 두 계산 단계와 기본 화면 계산 표, = 는 logCalculation으로 기록
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'

const read = (p: string) => fs.readFileSync(p, 'utf8')

describe('계산기 배선', () => {
  test('기록 창: 계산·판정과 반경·판정 두 곳에 과제별 계산기', () => {
    const sheet = read('src/screens/RecordSheet.tsx')
    expect(sheet.match(/<CalculatorPanel kind=\{calculatorKindOf\(task\)\} onEvaluate=\{onCalc\} \/>/g)).toHaveLength(2)
  })
  test('과제 화면: = 는 logCalculation으로 기록, 기록 창과 기본 화면 계산 표 두 곳에 계산기', () => {
    const task = read('src/screens/TaskScreen.tsx')
    expect(task).toMatch(/const calcKind = calculatorKindOf\(task\)/)
    expect(task).toMatch(/const logCalc = \(e: CalcEvaluation\) => setRun\(\(r\) => logCalculation\(r, e\)\)/)
    expect(task).toMatch(/<RecordSheet [^\n]*onCalc=\{logCalc\} \/>/)
    expect(task.match(/<CalculatorPanel kind=\{calcKind\} onEvaluate=\{logCalc\} \/>/g)).toHaveLength(2)
  })
})
```

그리고 `tests/recordSheet.test.ts` 렌더 도우미의 `onNote: () => {},` 뒤에 `onCalc: () => {},`를 더한다(18줄 `createElement(RecordSheet, { … })`).

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/calculatorWiring.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

**`src/screens/RecordSheet.tsx`**
(1) import 바꾸기와 더하기
- `import type { TaskRun } from '../domain/taskEngine'`를 `import { calculatorKindOf, type TaskRun } from '../domain/taskEngine'`로 바꾼다.
- import 끝에 두 줄을 더한다.

```ts
import type { CalcEvaluation } from '../app/calculator'
import { CalculatorPanel } from './Calculator'
```

(2) props
- `export function RecordSheet({ run, stepId, io, gauge, needles, reviewing, canReview, onToggleReview, note, onNote }: {`를 `export function RecordSheet({ run, stepId, io, gauge, needles, reviewing, canReview, onToggleReview, note, onNote, onCalc }: {`로 바꾼다.
- 형 안의 `  onNote: (v: string) => void` 줄 아래에 더한다.

```ts
  /** 계산기에서 = 를 누를 때(계산기 기록, 계산기 설계 §3) */
  onCalc: (e: CalcEvaluation) => void
```

(3) 제동력 계산·판정 줄을 바꾼다. 바꿀 곳:

```tsx
      <p className="small">기준: 편차 {task.ruleset.deviationMaxPercent}% 이내 · 합 뒤축 {task.ruleset.sumMinRearPercent}% 이상 · 둘 다 기준 안이면 양호</p>
      <NumberField itemId="deviation" io={io} decimal />
```

바꾼 글:

```tsx
      <p className="small">기준: 편차 {task.ruleset.deviationMaxPercent}% 이내 · 합 뒤축 {task.ruleset.sumMinRearPercent}% 이상 · 둘 다 기준 안이면 양호</p>
      <CalculatorPanel kind={calculatorKindOf(task)} onEvaluate={onCalc} />
      <NumberField itemId="deviation" io={io} decimal />
```

(4) 최소회전반경 반경·판정 줄을 바꾼다. 바꿀 곳:

```tsx
      <p className="small">기준: {task.ruleset.radiusMaxM} m 이하이면 양호</p>
      <NumberField itemId="radius" io={io} decimal />
```

바꾼 글:

```tsx
      <p className="small">기준: {task.ruleset.radiusMaxM} m 이하이면 양호</p>
      <CalculatorPanel kind={calculatorKindOf(task)} onEvaluate={onCalc} />
      <NumberField itemId="radius" io={io} decimal />
```

**`src/screens/TaskScreen.tsx`**
(1) import
- `import { attempt, markFeedbackShown, pauseRun, requestHint, resumeRun, serializeRun, submitResponse, OFF_SUBSTEPS, type OffSubStep, type TaskRun } from '../domain/taskEngine'`를 바꾼다.

  ```ts
  import { attempt, calculatorKindOf, logCalculation, markFeedbackShown, pauseRun, requestHint, resumeRun, serializeRun, submitResponse, OFF_SUBSTEPS, type OffSubStep, type TaskRun } from '../domain/taskEngine'
  ```

- `import { NumberField, type FieldIo } from './RecordFields'` 줄 아래에 더한다.

```ts
import { CalculatorPanel } from './Calculator'
import type { CalcEvaluation } from '../app/calculator'
```

(2) `  const hint = () => {` 줄 바로 앞에 더한다.

```ts
  // 계산기(계산기 설계 §2·§3): 과제별 종류, = 는 계산 기록으로(채점·사건과 무관)
  const calcKind = calculatorKindOf(task)
  const logCalc = (e: CalcEvaluation) => setRun((r) => logCalculation(r, e))

```

(3) 기록 창의 `onNote={setAction} />`를 `onNote={setAction} onCalc={logCalc} />`로 바꾼다(`<RecordSheet run={run} stepId={record} …` 줄).

(4) 기본 화면 최소회전반경 표 아래에 더한다. 바꿀 곳:

```tsx
          {m.sinTable && <p className="small sintable">{Object.entries(m.sinTable).map(([a, v]) => `sin ${a}° = ${v}`).join(' · ')}</p>}
```

바꾼 글:

```tsx
          {m.sinTable && <p className="small sintable">{Object.entries(m.sinTable).map(([a, v]) => `sin ${a}° = ${v}`).join(' · ')}</p>}
          <CalculatorPanel kind={calcKind} onEvaluate={logCalc} />
```

(5) 기본 화면 제동력 표 아래에 더한다. 바꿀 곳:

```tsx
          <p className="small">산출식: 편차 = (큰 값 − 작은 값) ÷ 축중 × 100, 합 = (좌 + 우) ÷ 축중 × 100. 소수 첫째 자리까지 적고 둘째 자리는 버립니다.</p>
```

바꾼 글:

```tsx
          <p className="small">산출식: 편차 = (큰 값 − 작은 값) ÷ 축중 × 100, 합 = (좌 + 우) ÷ 축중 × 100. 소수 첫째 자리까지 적고 둘째 자리는 버립니다.</p>
          <CalculatorPanel kind={calcKind} onEvaluate={logCalc} />
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit && npm run build`
Expected: 모두 PASS, 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add src/screens/RecordSheet.tsx src/screens/TaskScreen.tsx tests/recordSheet.test.ts tests/calculatorWiring.test.ts
git commit -m "feat(계산기): 기록 창 두 계산 단계와 기본 화면 계산 표에 계산기, = 는 계산 기록으로" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 앱 판 0.3.2-demo

**Files:**
- Modify: `src/app/buildInfo.ts:6-7`, `src/app/session.ts:14`
- Test: `tests/buildInfo.test.ts:28`

- [ ] **Step 1: 시험 고치기** — `tests/buildInfo.test.ts`

바꿀 곳:

```ts
  test('계산 채점 규칙 가(2026-11-10)부터 기본 판 0.3.1-demo — 기록으로 규칙을 가른다', () => { expect(APP_BASE_VERSION).toBe('0.3.1-demo') })
```

바꾼 글:

```ts
  test('계산기(2026-11-11)부터 기본 판 0.3.2-demo — 계산기 이전 기록과 가른다(0.3.1-demo는 채점 규칙 가)', () => { expect(APP_BASE_VERSION).toBe('0.3.2-demo') })
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/buildInfo.test.ts`
Expected: FAIL — 아직 0.3.1-demo

- [ ] **Step 3: 구현**

`src/app/buildInfo.ts` — 바꿀 곳:

```ts
export const APP_BASE_VERSION = '0.3.1-demo'
```

바꾼 글(위 0.3.1-demo 주석 줄은 그대로 둔다):

```ts
// 0.3.2-demo(2026-11-11): 계산·판정 장면 전자계산기와 계산기 기록(기록 판 1.3.0)부터. 계산 오답이 달라질 수 있어 이 판으로 가른다
export const APP_BASE_VERSION = '0.3.2-demo'
```

`src/app/session.ts` — 주석의 `예: 0.3.1-demo+1a2b3c4d5e6f`를 `예: 0.3.2-demo+1a2b3c4d5e6f`로 바꾼다.

- [ ] **Step 4: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/app/buildInfo.ts src/app/session.ts tests/buildInfo.test.ts
git commit -m "chore(기록): 앱 판 0.3.2-demo — 계산기 이전 기록과 가른다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 전체 확인(컨트롤러)

- [ ] **자동 확인:** 전체 시험·형 검사·빌드를 돌린다. `git status --short`에는 `?? tsconfig.tsbuildinfo`만 있어야 한다.
- [ ] **브라우저 준비**
  - 도구: 헤드리스 크롬(`scratchpad/verify-wrapup/s2-lib.mjs`처럼 CDP 시간 제한·자체 종료). 실행마다 `perl -e 'alarm 900; …'`로 상한을 걸고, 끝나면 `pkill`.
  - 쓰기 막기: GET이 아닌 요청을 모두 막는다.
  - 코드: 합성 코드만 쓴다.
  - 개발 서버: `.claude/launch.json` 임시 항목을 쓰고, 끝나면 백업으로 되돌려 `cmp`로 확인한다.
- [ ] **브라우저 확인 항목**
  1. **제동력(안내 있음):**
     - '계산·판정 기록' 창에서 '계산기'를 펼친다. `240 − 200 ÷ 600 × 100 =`이 6.666666667로 나와야 한다.
     - 기기 저장(IndexedDB) 초안의 `calculatorLog`에 그 줄이 있어야 한다(읽기만).
     - 창을 닫았다 열면 계산기가 닫혀 있고 내용이 비어 있어야 한다.
  2. **최소회전반경:**
     - '반경·판정 기록'에 DEG 공학용이 나와야 한다.
     - `2.7 ÷ sin(32) + 0.1 =` → 5.19511577.
     - ⌫는 `sin(`을 한 번에 지워야 한다.
     - `2sin(30)`은 "식 오류"여야 한다.
     - sin 표가 그대로 있어야 한다.
  3. **기본 화면:** 두 과제의 계산 표 아래에 계산기가 있어야 한다.
  4. **배치:**
     - 375×812·1024×768·1280×800에서 계산기 버튼 높이가 44px 이상이어야 한다.
     - 창 본문과 작업 목록이 옆으로 넘치지 않고, 페이지 `scrollLeft`가 0이어야 한다.
     - 화면 키보드 흉내(375×420)에서 계산기를 쓴 뒤 칸에 적을 수 있어야 한다.
  5. **키보드:** 계산기 안에서 숫자·Enter가 되고, Enter가 두 번 눌리지 않아야 한다. Esc는 창 닫기(고친 값 경고 규칙 그대로)여야 한다.
  6. **사건:** 계산기 사용으로 사건 수가 늘지 않아야 한다.
  7. **오류:** 콘솔 오류 0, GET이 아닌 요청 0이어야 한다.
- [ ] **보고(MOON)**
  - 반영 순서(아래)를 적는다.
  - Hermes 전달 내용을 적는다.
    - 계산기는 0.3.2-demo부터다.
    - 계산 기록은 1.3.0 기록의 `calculatorLog`·calculator.csv에 있다.
    - 계산 정오 비교는 앱 판으로 나눈다.
    - IRB 수집항목표에 '계산기 사용 기록(누른 식·결과·시각)'을 더해야 한다.

## 구현 결과와 검토 반영 (2026-11-11)
- **구현:** Task 1~9를 끝냈다(9d0f2d4·8145712·bf1438e·1e8a5dc·a61b593·382a421·4f8564a·5dcb3d9·dce83f2). 시험 940, tsc·빌드가 통과했다.
- **헤드리스 확인(Task 10):** 7개 항목이 모두 통과했다(설계 §9).
- **최종 검토 반영(설계 §9):** 커밋 3개로 고친다.
  1. 계산기 견고성
  2. 거절 기록을 다시 보내는 안전망
  3. 계약 글자 제한·연구 묶음·설명서

## 반영 순서(계획 밖, MOON 말이 있을 때만)
1. **"브랜치 합쳐":** cozy-stage1을 main에 합친다(합친 결과로 시험·빌드).
2. **서버 배포(MOON 허락 받고):** Supabase `submit` 함수를 배포한다(새 수신 코어 포함). 배포 뒤 실제 서버가 1.3.0을 받는지 MOON이 실기기 점검표 5번으로 확인한다. 시험으로 실제 서버에 보내지 않는다.
3. **"재배포해":** 앱을 공개판에 올린다. **서버보다 먼저 올리면 1.3.0 기록이 거절된다.**
