# 기록 창 마무리 묶음 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계산 답 채점을 계약대로 고치고(가), 고친 값 경고·고칠 목록·결과 화면 정답 숨기기와 작은 흐름 수정 4건을 넣는다.

**Architecture:** 채점은 `src/domain/grading.ts` 한 곳, "입력 전" 판단은 순수 함수(`src/app/recordSteps.ts`의 `unsavedItems`·`fieldMark`)로 두고 TaskScreen이 칸 표시·창 닫기 경고에 쓴다. 나머지는 화면 글·배선만 바꾼다. 새 기록 사건·항목은 없다.

**Tech Stack:** React 18 + TypeScript, Vitest(node, `renderToStaticMarkup`·소스 검사).

**설계 문서:** `docs/superpowers/specs/2026-11-10-record-window-wrapup-design.md`(MOON 승인). 아래 "§n"은 이 문서의 절이다.

---

## 작업 규칙
- 작업 폴더: `/Users/jamingchu/claude code/chassis-3d-lab-cozy`(git worktree, 브랜치 `cozy-stage1`). 모든 명령은 이 폴더에서 한다.
- **push·배포·main 합치기 금지.** `cozy-stage1`은 절대 push하지 않는다.
- `git add`는 파일을 하나씩 적는다. `tsconfig.tsbuildinfo`는 커밋하지 않는다. 맨 `git stash` 금지. 새 패키지 설치 금지. 브라우저·개발 서버는 열지 않는다.
- 시험 하나: `npm test -- tests/파일.test.ts`. 전체: `npm test`. 형 검사: `node_modules/.bin/tsc -p tsconfig.json --noEmit`. 멈추면 `perl -e 'alarm 300; exec @ARGV' npm test -- …`.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`(아래 명령처럼 `-m` 두 번).

## 파일 구조

| 파일 | 할 일 |
|---|---|
| `src/domain/grading.ts` | 계산 항목도 학생 값을 다시 절사하지 않고 비교(§2) |
| `src/app/recordSteps.ts` | `unsavedItems`·`fieldMark`(§3) |
| `src/screens/TaskScreen.tsx` | "입력 전" 칸 표시, 창 닫기·단계 완료 경고, 마지막 첫 답 오답에도 고칠 목록, 정지·상승 제목 |
| `src/screens/ResultScreen.tsx` | 정답 값 칸·줄 빼기(§5) |
| `src/screens/NpcDialog.tsx` | 과제 받은 뒤 대사 |
| `src/screens/LabScreen.tsx` | "교관에게"로 걸어가면 대화 열기 |
| `src/styles.css` | 표시 칸 36px, "입력 전" 모양 |

---

### Task 1: 채점 규칙 가 — 계산 답을 다시 절사하지 않기

**Files:**
- Modify: `src/domain/grading.ts`(gradeNumeric와 그 호출)
- Modify: `tests/turningTask.test.ts`(반경 5.19 시험)
- Test: `tests/grading.test.ts`(더하기)

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/grading.test.ts`의 '계산값은 절사 기재값과 비교한다: 편차 6.6 정답, 6.7 오답' 시험 바로 아래에 더한다.

```ts
  test('계산값은 학생 값을 다시 절사하지 않는다(설계 계약, MOON 결정 가): 6.69·6.6999·73.39는 오답, 6.60·73.3은 정답', () => {
    const s = createResponseSheet(task1)
    expect(submitAnswer(s, 'deviation', '6.69').result.correct).toBe(false)
    expect(submitAnswer(s, 'deviation', '6.6999').result.correct).toBe(false)
    expect(submitAnswer(s, 'sum', '73.39').result.correct).toBe(false)
    expect(submitAnswer(s, 'deviation', '6.60').result.correct).toBe(true)
    expect(submitAnswer(s, 'sum', '73.3').result.correct).toBe(true)
    // 형식 오류가 아니라 채점된 오답이므로 첫 답으로 남는다
    const r = submitAnswer(s, 'deviation', '6.69')
    expect(r.result.reasonCode).toBeNull()
    expect(r.sheet.items.find((i) => i.itemId === 'deviation')!.firstInput).toBe('6.69')
  })
```

`tests/turningTask.test.ts`에서 바꿀 곳:

```ts
  it('R은 학생 값도 소수 첫째 자리 절사 뒤 비교, 안쪽 바퀴로 계산한 값은 오답', () => {
    const s = createResponseSheet(lv2)
    expect(submitAnswer(s, 'radius', '5.19').result.correct).toBe(true)
    expect(submitAnswer(s, 'radius', '5.1').result.correct).toBe(true)
```

바꾼 글:

```ts
  it('R은 학생 값을 다시 절사하지 않는다(5.19는 오답, 5.1·5.10은 정답), 안쪽 바퀴로 계산한 값은 오답', () => {
    const s = createResponseSheet(lv2)
    expect(submitAnswer(s, 'radius', '5.19').result.correct).toBe(false)
    expect(submitAnswer(s, 'radius', '5.1').result.correct).toBe(true)
    expect(submitAnswer(s, 'radius', '5.10').result.correct).toBe(true)
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/grading.test.ts tests/turningTask.test.ts`
Expected: FAIL — 6.69·73.39·5.19가 정답으로 채점됨

- [ ] **Step 3: 구현** — `src/domain/grading.ts`

바꿀 곳:

```ts
function gradeNumeric(item: ResponseItemState, value: number, precision: DecisionPrecision | null): boolean | null {
  if (item.referenceValue === null) return null
  if (item.gradingRuleId === 'decimalExact') {
    // 계산 항목은 기재 정책(절사 1자리)으로 학생 값도 정리한 뒤 비교
    if (item.kind === 'calculation' && item.precisionPolicyRef === 'truncate1') {
      const v = precision ? applyPrecision(value, precision) : value
      return v === item.referenceValue
    }
    return value === item.referenceValue
  }
  return null
}
```

바꾼 글:

```ts
function gradeNumeric(item: ResponseItemState, value: number): boolean | null {
  if (item.referenceValue === null) return null
  // 계산 항목도 학생 값을 다시 절사하지 않고 그대로 비교한다(설계 계약 task-vocabulary 1.2.0 296–302, 13번 문서 104줄, MOON 결정 가 2026-11-10).
  // 기준값은 이미 기재 정책(절사 1자리)으로 정리돼 있어 6.6·6.60은 정답, 6.69·6.6999는 오답이다
  if (item.gradingRuleId === 'decimalExact') return value === item.referenceValue
  return null
}
```

바꿀 곳(호출):

```ts
    correct = gradeNumeric(item, parsed.value, sheet.precision)
```

바꾼 글:

```ts
    correct = gradeNumeric(item, parsed.value)
```

`applyPrecision`·`DecisionPrecision` import가 파일의 다른 곳에서 더 쓰이지 않으면 import 줄에서 그 이름만 뺀다(쓰이면 그대로 둔다). `ResponseSheet.precision` 칸은 그대로 둔다.

- [ ] **Step 4: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS(다른 시험이 6.69 같은 값을 정답으로 기대하고 있었다면 보고한다 — 고치지 말고)

- [ ] **Step 5: 커밋**

```bash
git add src/domain/grading.ts tests/grading.test.ts tests/turningTask.test.ts
git commit -m "fix(채점): 계산 답을 다시 절사하지 않는다 — 6.69·73.39·5.19는 오답(설계 계약, MOON 결정 가)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 고친 값 판단 순수 함수(`unsavedItems`·`fieldMark`)

**Files:**
- Modify: `src/app/recordSteps.ts`(맨 끝에 더하기)
- Test: `tests/recordSteps.test.ts`(더하기)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/recordSteps.test.ts` 맨 끝에 더하고, 맨 위 recordSteps import 줄에 `fieldMark`, `unsavedItems`를 더한다.

```ts
describe('고친 값 경고(마무리 §3)', () => {
  test('제출한 값과 같거나 비어 있으면 아니고, 다르거나 적기만 했으면 입력 전', () => {
    const r = answer(brakeToEnter(), 'axleWeight', '600')
    expect(unsavedItems(r, { axleWeight: '600' }, ['axleWeight'])).toEqual([])
    expect(unsavedItems(r, { axleWeight: ' 600 ' }, ['axleWeight'])).toEqual([])
    expect(unsavedItems(r, { axleWeight: '' }, ['axleWeight'])).toEqual([])
    expect(unsavedItems(r, { axleWeight: '610' }, ['axleWeight'])).toEqual(['axleWeight'])
    expect(unsavedItems(r, { left: '240' }, ['left', 'right'])).toEqual(['left'])
  })
  test('판정은 고른 값과 제출한 값을 비교한다', () => {
    const t = answer(turnToReturn('guided', '35', '30'), 'vehicleCondition', 'pass')
    expect(unsavedItems(t, { vehicleCondition: 'pass' }, ['vehicleCondition'])).toEqual([])
    expect(unsavedItems(t, { vehicleCondition: 'fail' }, ['vehicleCondition'])).toEqual(['vehicleCondition'])
  })
  test('칸 표시: 입력 전이 정오보다 먼저, 정오는 드러내지 않는다', () => {
    const g = answer(brakeToEnter('guided'), 'axleWeight', '610')
    expect(fieldMark(g, { axleWeight: '600' }, 'axleWeight')).toEqual({ text: '입력 전', cls: 'dirty' })
    expect(fieldMark(g, { axleWeight: '610' }, 'axleWeight')).toEqual({ text: '✗', cls: 'bad' })
    const u = answer(brakeToEnter('unguided'), 'axleWeight', '610')
    expect(fieldMark(u, { axleWeight: '610' }, 'axleWeight')).toEqual({ text: '저장', cls: '' })
    expect(fieldMark(u, { axleWeight: '600' }, 'axleWeight')).toEqual({ text: '입력 전', cls: 'dirty' })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recordSteps.test.ts`
Expected: FAIL — `unsavedItems is not a function`

- [ ] **Step 3: 구현** — `src/app/recordSteps.ts` 맨 끝에 더한다.

```ts
/** 칸에 적은 글자가 제출한 최종 답과 다른 칸(마무리 설계 §3): 고쳤거나 적기만 하고 '입력'을 누르지 않은 칸 */
export function unsavedItems(run: TaskRun, inputs: Record<string, string>, itemIds: readonly string[]): string[] {
  const saved = restoreInputs(run)
  return itemIds.filter((id) => {
    const t = (inputs[id] ?? '').trim()
    return t !== '' && t !== (saved[id] ?? '')
  })
}

/** 칸 옆 표시: 입력하지 않은 고친 값은 '입력 전'(정오보다 먼저, 정오를 드러내지 않음), 아니면 markFor */
export function fieldMark(run: TaskRun, inputs: Record<string, string>, itemId: string): { text: string; cls: string } {
  return unsavedItems(run, inputs, [itemId]).length > 0 ? { text: '입력 전', cls: 'dirty' } : markFor(run, itemId)
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/recordSteps.test.ts && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/app/recordSteps.ts tests/recordSteps.test.ts
git commit -m "feat(기록 창): 고친 값 판단(unsavedItems)과 '입력 전' 칸 표시(fieldMark)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 화면에 "입력 전" 표시와 창 닫기·단계 완료 경고

**Files:**
- Modify: `src/screens/TaskScreen.tsx`
- Modify: `src/styles.css`
- Modify: `tests/recordWiring.test.ts`(기존 정규식 4곳 바꾸기 + 새 시험)

- [ ] **Step 1: 시험 고치기** — `tests/recordWiring.test.ts`

(a) '과제 패널의 기록 창(§3)' describe에서 아래 기존 단언들을 찾아 새 글에 맞게 바꾼다.
- `onClose=\{closeRecord\}`가 들어간 RecordWindow 정규식 → `onClose=\{requestClose\}`
- 단계 완료 버튼 정규식 `<button type="button" className="primary" onClick=\{\(\) => doStep\(record\)\}>단계 완료<\/button>` → `<button type="button" className="primary" onClick=\{\(\) => \{ if \(!warnUnsaved\(record\)\) doStep\(record\) \}\}>단계 완료<\/button>`
- 아래 줄 선택을 고정한 `toContain('done(record) ? <button type="button" onClick={closeRecord}>닫기</button> : …')` → `toContain('done(record) ? <button type="button" onClick={requestClose}>닫기</button> : <button type="button" className="primary" onClick={() => { if (!warnUnsaved(record)) doStep(record) }}>단계 완료</button>')`
- ✕·닫기로 닫아도 고칠 목록을 남기는지 보는 `closeRecord` 정규식의 `setReview\(false\); setRecord\(null\)` → `setReview\(false\); setUnsavedWarned\(false\); setRecord\(null\)`(뜻은 그대로. 구현 중 찾아 더함)

(b) 맨 끝에 더한다.

```ts
describe('고친 값 경고(마무리 §3)', () => {
  const task = code('src/screens/TaskScreen.tsx')
  const css = read('src/styles.css')
  test('작업 목록·기록 창 칸 표시는 fieldMark(입력 전이 정오보다 먼저)', () => {
    expect(task).toMatch(/mark: \(id\) => fieldMark\(run, inputs, id\)/)
    expect(task).toMatch(/const mark = \(id: string\) => fieldMark\(run, inputs, id\)\.text/)
    expect(task).toMatch(/const markClass = \(id: string\) => fieldMark\(run, inputs, id\)\.cls/)
  })
  test('창 닫기·단계 완료는 고친 값이 있으면 처음 한 번 멈추고 알린다, 입력을 누르면 경고를 처음으로', () => {
    expect(task).toMatch(/if \(left\.length === 0 \|\| unsavedWarned\) return false/)
    expect(task).toMatch(/const requestClose = \(\) => \{ if \(record && warnUnsaved\(record\)\) return; closeRecord\(\) \}/)
    expect(task).toMatch(/const submit = \(itemId: string\) => \{\n\s+setUnsavedWarned\(false\)/)
  })
  test('표시 칸 36px, 입력 전은 작은 글자 한 줄', () => {
    expect(css).toMatch(/\.field \{ display:grid; grid-template-columns:90px 1fr auto 36px;/)
    expect(css).toMatch(/\.mark\.dirty \{ color:var\(--warn\); font-weight:700; font-size:12px; white-space:nowrap; \}/)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recordWiring.test.ts`
Expected: FAIL — 새 글이 없음

- [ ] **Step 3: 구현** — `src/screens/TaskScreen.tsx`

(1) import. 바꿀 곳:

```ts
import { canReviewDial, itemOpen, markFor, missingText, recordLabel, recordStepOf, restoreInputs } from '../app/recordSteps'
```

바꾼 글(markFor는 더 쓰지 않으면 뺀다):

```ts
import { canReviewDial, fieldMark, itemOpen, missingText, recordItems, recordLabel, recordStepOf, restoreInputs, unsavedItems } from '../app/recordSteps'
```

(2) 칸 표시. 바꿀 곳:

```ts
  const mark = (id: string) => markFor(run, id).text
  const markClass = (id: string) => markFor(run, id).cls
```

바꾼 글:

```ts
  // 칸 표시: 고쳤지만 입력하지 않은 칸은 '입력 전'(마무리 §3), 아니면 수행 기록의 최종 답 정오(안내 없음은 '저장'만)
  const mark = (id: string) => fieldMark(run, inputs, id).text
  const markClass = (id: string) => fieldMark(run, inputs, id).cls
```

`listIo`의 `mark: (id) => markFor(run, id),`를 `mark: (id) => fieldMark(run, inputs, id),`로 바꾼다.

(3) 상태. `  const [record, setRecord] = useState<string | null>(null)` 줄 아래에 더한다.

```ts
  /** 고친 값 경고를 이번에 이미 했는지(마무리 §3). 창을 열고 닫을 때·입력을 누를 때 처음으로 */
  const [unsavedWarned, setUnsavedWarned] = useState(false)
```

(4) 창 열기·닫기와 경고. `openRecord`·`closeRecord` 두 줄을 아래로 바꾼다(주석은 그대로 위에 둔다).

```ts
  const openRecord = (stepId: string, keepFixList = false) => { if (!keepFixList || !shown?.fixItems) setShown(null); setReview(false); setUnsavedWarned(false); setRecord(stepId) }
```

```ts
  const closeRecord = () => { if (!shown?.fixItems) setShown(null); setReview(false); setUnsavedWarned(false); setRecord(null) }
  /** 고친 값 경고(마무리 §3): 창 단계 칸 중 고쳤지만 입력하지 않은 칸이 있으면 처음 한 번은 멈추고 알린다. 다시 누르면 진행(적은 글자는 남고 제출되지 않음) */
  const warnUnsaved = (stepId: string): boolean => {
    const left = unsavedItems(run, inputs, recordItems(task, stepId))
    if (left.length === 0 || unsavedWarned) return false
    setUnsavedWarned(true)
    setShown({ kind: 'guidance', title: '고친 값을 아직 입력하지 않았습니다', text: null, plain: `${left.map((i) => ITEM_LABEL[i] ?? i).join(', ')} 칸 옆 입력을 눌러야 저장됩니다. 그대로 두려면 한 번 더 누르세요.`, focusItem: left[0] })
    return true
  }
  /** 창 닫기(✕·Esc·닫기): 고친 값 경고를 먼저 거친다. 단계 완료로 닫히는 길은 doStep이 closeRecord를 바로 부른다 */
  const requestClose = () => { if (record && warnUnsaved(record)) return; closeRecord() }
```

(5) submit 맨 앞. 바꿀 곳:

```ts
  const submit = (itemId: string) => {
    const raw = inputs[itemId] ?? ''
```

바꾼 글:

```ts
  const submit = (itemId: string) => {
    setUnsavedWarned(false)
    const raw = inputs[itemId] ?? ''
```

(6) 창. 바꿀 곳:

```tsx
        <RecordWindow title={recordLabel(task, record) ?? '기록'} onClose={closeRecord} onAskAi={onAskAi}
          footer={done(record) ? <button type="button" onClick={closeRecord}>닫기</button> : <button type="button" className="primary" onClick={() => doStep(record)}>단계 완료</button>}>
```

바꾼 글:

```tsx
        <RecordWindow title={recordLabel(task, record) ?? '기록'} onClose={requestClose} onAskAi={onAskAi}
          footer={done(record) ? <button type="button" onClick={requestClose}>닫기</button> : <button type="button" className="primary" onClick={() => { if (!warnUnsaved(record)) doStep(record) }}>단계 완료</button>}>
```

**`src/styles.css`**

바꿀 곳:

```css
.field { display:grid; grid-template-columns:90px 1fr auto 24px; align-items:center; gap:8px; margin:6px 0; }
```

바꾼 글:

```css
.field { display:grid; grid-template-columns:90px 1fr auto 36px; align-items:center; gap:8px; margin:6px 0; }
```

바꿀 곳:

```css
.mark.ok { color:var(--ok); font-weight:700; } .mark.bad { color:var(--bad); font-weight:700; }
```

바꾼 글:

```css
.mark.ok { color:var(--ok); font-weight:700; } .mark.bad { color:var(--bad); font-weight:700; }
.mark.dirty { color:var(--warn); font-weight:700; font-size:12px; white-space:nowrap; } /* 고쳤지만 입력하지 않은 칸(마무리 §3) */
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/screens/TaskScreen.tsx src/styles.css tests/recordWiring.test.ts
git commit -m "feat(기록 창): 고친 값에 '입력 전' 표시, 창 닫기·단계 완료 때 한 번 알림, 표시 칸 36px" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6 (구현 중 보완): 경고는 이미 입력한 답을 고친 칸만** — 처음 적고 입력하지 않은 칸까지 경고하면, 단계 완료에서 "한 번 더 누르세요" 뒤에도 엔진이 막아 안내가 틀린다(설계 §3 보완). `src/app/recordSteps.ts`에 `unsavedEdits(run, inputs, itemIds)`(= `unsavedItems` 중 `restoreInputs`에 저장된 답이 있는 칸)를 더하고 `warnUnsaved`가 이것을 쓴다(`const left = unsavedEdits(run, inputs, recordItems(task, stepId))`). 시험: `tests/recordSteps.test.ts`(처음 적은 칸은 빠짐), `tests/recordWiring.test.ts`(배선 정규식). 커밋 "fix(기록 창): 고친 값 경고는 이미 입력한 답을 고친 칸만 — 처음 적은 칸은 단계 완료 안내가 맡는다".

---

### Task 4: 마지막 첫 답이 틀려도 고칠 목록, 정지·상승 제목 나누기

**Files:**
- Modify: `src/screens/TaskScreen.tsx`(submit, doOffSub)
- Test: `tests/recordWiring.test.ts`(더하기)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/recordWiring.test.ts` 맨 끝에 더한다.

```ts
describe('고칠 목록·경고 제목(마무리 §4·§6)', () => {
  const task = code('src/screens/TaskScreen.tsx')
  test('안내 없음에서 마지막 최초 답이 오답이어도 그 설명에 고치기 목록을 붙인다(같은 show·같은 키)', () => {
    expect(task).toMatch(/const lastFirst = run\.difficultyMode === 'unguided' && !answerFeedbackAllowed\(run\)/)
    expect(task).toMatch(/text: feedbackFor\(task, res\.feedbackKey\), \.\.\.\(lastFirst \? \{ fixItems: wrongIds \} : \{\}\) \}, res\.feedbackKey, itemId\)/)
    expect(task).toMatch(/if \(lastFirst && wrongIds\.length > 0\)/)
  })
  test('정지·상승·차량 빼기: 순서 오류와 안전 오류 제목을 나눈다', () => {
    expect(task).toMatch(/title: `\$\{kind === 'safety' \? '안전 위반' : '순서가 틀렸습니다'\} — \$\{OFF_LABEL\[action\]\}`/)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recordWiring.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현** — `src/screens/TaskScreen.tsx`

(1) submit. 바꿀 곳:

```ts
    if (res.grading?.correct === false) return show(res.run, { kind: 'explanatory', title: `${ITEM_LABEL[itemId]} — 다시 확인하세요`, text: feedbackFor(task, res.feedbackKey) }, res.feedbackKey, itemId)
    setRun(res.run)
    const wrongIds = res.run.responses.items.filter((i) => i.finalCorrect === false).map((i) => i.itemId)
    if (run.difficultyMode === 'unguided' && !answerFeedbackAllowed(run) && wrongIds.length > 0) {
```

바꾼 글:

```ts
    // 방금 마지막 최초 응답이 저장됐는가(안내 없음). 그러면 틀린 칸마다 고치기를 붙인다(설계 §6, 마무리 §4) — 그 답이 틀렸을 때도
    const lastFirst = run.difficultyMode === 'unguided' && !answerFeedbackAllowed(run)
    const wrongIds = res.run.responses.items.filter((i) => i.finalCorrect === false).map((i) => i.itemId)
    if (res.grading?.correct === false) return show(res.run, { kind: 'explanatory', title: `${ITEM_LABEL[itemId]} — 다시 확인하세요`, text: feedbackFor(task, res.feedbackKey), ...(lastFirst ? { fixItems: wrongIds } : {}) }, res.feedbackKey, itemId)
    setRun(res.run)
    if (lastFirst && wrongIds.length > 0) {
```

(그 아래 `// 방금 마지막 최초 응답이 저장됨 …` 주석과 `return setShown({ … fixItems: wrongIds })` 줄은 그대로 둔다.)

(2) doOffSub. 바꿀 곳:

```ts
    if (res.outcome === 'blocked') return show(res.run, { kind: 'safety', title: `안전 위반 — ${OFF_LABEL[action]}`, text: feedbackFor(task, res.feedbackKey) }, res.feedbackKey)
    setRun(res.run)
  }
```

바꾼 글:

```ts
    if (res.outcome === 'blocked') {
      // 순서 오류(ORDER_)와 안전 오류(SAFETY_)를 엔진 집계와 같게 나눈다(Codex 회의 지적 7)
      const kind = res.reasonCode?.startsWith('SAFETY_') ? 'safety' : 'explanatory'
      return show(res.run, { kind, title: `${kind === 'safety' ? '안전 위반' : '순서가 틀렸습니다'} — ${OFF_LABEL[action]}`, text: feedbackFor(task, res.feedbackKey) }, res.feedbackKey)
    }
    setRun(res.run)
  }
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS(기존 `fixItems: wrongIds` 단언도 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/TaskScreen.tsx tests/recordWiring.test.ts
git commit -m "feat(기록 창): 마지막 첫 답이 틀려도 고칠 목록, 정지·상승·차량 빼기 제목을 순서·안전으로 나눔" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 결과 화면 정답 숨기기, 교관 대사, "교관에게"로 대화 열기

**Files:**
- Modify: `src/screens/ResultScreen.tsx:97`, `:102-106`
- Modify: `src/screens/NpcDialog.tsx:62`
- Modify: `src/screens/LabScreen.tsx`(의뢰 카드의 "교관에게" 버튼)
- Test: `tests/wrapupWiring.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/wrapupWiring.test.ts`

```ts
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
    expect(lab).toContain('<button onClick={() => { setTalkOnArrive(true); goTo(npcSpot) }}>교관에게</button>')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/wrapupWiring.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

**`src/screens/ResultScreen.tsx`** — 이 줄을 지운다:

```tsx
            <li>차량 판정(정답): <b>{sum.vehicleVerdict === 'pass' ? '양호' : sum.vehicleVerdict === 'fail' ? '불량' : '판정 불가'}</b></li>
```

표 부분. 바꿀 곳:

```tsx
            <thead><tr><th>항목</th><th>제시/기준값</th><th>최초 답</th><th>최종 답</th></tr></thead>
            <tbody>
              {sum.measurementInputs.map((i) => <tr key={i.itemId}><td>{itemLabel(i.itemId)}</td><td>{i.presentedValue}</td><td>{i.firstInput ?? '—'} {i.firstCorrect === true ? '✓' : i.firstCorrect === false ? '✗' : ''}</td><td>{i.finalInput ?? '—'} {i.finalCorrect === true ? '✓' : i.finalCorrect === false ? '✗' : ''}</td></tr>)}
              {sum.calculationAnswers.map((i) => <tr key={i.itemId}><td>{itemLabel(i.itemId)}</td><td>{i.computedReferenceValue}</td><td>{i.firstInput ?? '—'} {i.firstCorrect === true ? '✓' : i.firstCorrect === false ? '✗' : ''}</td><td>{i.finalInput ?? '—'} {i.finalCorrect === true ? '✓' : i.finalCorrect === false ? '✗' : ''}</td></tr>)}
              {sum.judgmentAnswers.map((i) => <tr key={i.itemId}><td>{itemLabel(i.itemId)}</td><td>{verdictLabel(sum.vehicleVerdict)}</td><td>{i.firstAnswer ? verdictLabel(i.firstAnswer) : '—'} {i.firstCorrect === true ? '✓' : i.firstCorrect === false ? '✗' : ''}</td><td>{i.finalAnswer ? verdictLabel(i.finalAnswer) : '—'} {i.finalCorrect === true ? '✓' : i.finalCorrect === false ? '✗' : ''}</td></tr>)}
            </tbody>
          </table>
```

바꾼 글:

```tsx
            <thead><tr><th>항목</th><th>최초 답</th><th>최종 답</th></tr></thead>
            <tbody>
              {sum.measurementInputs.map((i) => <tr key={i.itemId}><td>{itemLabel(i.itemId)}</td><td>{i.firstInput ?? '—'} {i.firstCorrect === true ? '✓' : i.firstCorrect === false ? '✗' : ''}</td><td>{i.finalInput ?? '—'} {i.finalCorrect === true ? '✓' : i.finalCorrect === false ? '✗' : ''}</td></tr>)}
              {sum.calculationAnswers.map((i) => <tr key={i.itemId}><td>{itemLabel(i.itemId)}</td><td>{i.firstInput ?? '—'} {i.firstCorrect === true ? '✓' : i.firstCorrect === false ? '✗' : ''}</td><td>{i.finalInput ?? '—'} {i.finalCorrect === true ? '✓' : i.finalCorrect === false ? '✗' : ''}</td></tr>)}
              {sum.judgmentAnswers.map((i) => <tr key={i.itemId}><td>{itemLabel(i.itemId)}</td><td>{i.firstAnswer ? verdictLabel(i.firstAnswer) : '—'} {i.firstCorrect === true ? '✓' : i.firstCorrect === false ? '✗' : ''}</td><td>{i.finalAnswer ? verdictLabel(i.finalAnswer) : '—'} {i.finalCorrect === true ? '✓' : i.finalCorrect === false ? '✗' : ''}</td></tr>)}
            </tbody>
          </table>
          {/* 정답 값(실제 판독값·계산 기준값·정답 판정)은 이 화면에 보이지 않는다 — 사례가 둘뿐이라 옆 학생이 답을 볼 수 있다(마무리 §5) */}
          <p className="small">정답 값은 교사 화면에서 확인합니다.</p>
```

**`src/screens/NpcDialog.tsx`** — `'좋아. 작업 순서는 오른쪽 위에 보여. 안전 수칙 꼭 지키고!'`를 `'좋아. 작업 순서는 작업 목록에서 확인해. 안전 수칙 꼭 지키고!'`로.

**`src/screens/LabScreen.tsx`** — 의뢰 카드의 `<button onClick={() => goTo(npcSpot)}>교관에게</button>`를 `<button onClick={() => { setTalkOnArrive(true); goTo(npcSpot) }}>교관에게</button>`로(이미 가까우면 바로 열린다).

- [ ] **Step 4: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/screens/ResultScreen.tsx src/screens/NpcDialog.tsx src/screens/LabScreen.tsx tests/wrapupWiring.test.ts
git commit -m "feat: 결과 화면 정답 값 숨기기, 과제 받은 뒤 교관 대사, 교관에게로 걸어가면 대화 열기" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 전체 확인(컨트롤러)

- [ ] 전체 시험·형 검사·빌드, `git status --short`에 `?? tsconfig.tsbuildinfo`만.
- [ ] 브라우저(헤드리스 크롬, 쓰기 요청 막음): ① 계산 칸 6.69 → ✗(안내 있음) ② 기록 창에서 값을 고치고 입력 없이 ✕·단계 완료 → 경고, 두 번째에 진행, 칸 표시 "입력 전" ③ 안내 없음에서 마지막 첫 답 오답 → 설명 + 고치기 목록 ④ 결과 화면에 정답 값 없음 ⑤ 의뢰 카드 "교관에게" → 도착 뒤 대화 ⑥ MOTOR OFF를 판독 전에 누르면 "순서가 틀렸습니다 — MOTOR OFF".
- [ ] Hermes 전달: 계산 답 채점 변경(이 커밋 뒤 수행부터, 이전 기록은 적은 글자로 다시 채점 가능), 판정 엔진 판 번호는 그대로.

---

## 구현 뒤 검토·검증 반영 (2026-11-10)

**최종 검토(9454eb6..aace161).** Critical은 없었다. 학생 값을 다시 절사하는 곳도 다른 데 없었다. 반영한 지적은 다음과 같다.
- **I1 기록 구분:** 앱 기본 판을 `0.3.1-demo`로 올리고 연구 묶음 README에 규칙 변경을 적는다.
- **M1:** 경고가 고칠 목록을 지우던 문제를 고친다.
- **M2:** 창 안 고치기로 옮길 때도 경고하게 한다.
- **M4:** 다른 곳으로 걸어가면 교관 대화 예약을 취소한다.
- **M7:** 낡은 주석을 고친다.

반영하지 않은 지적은 다음과 같다.
- **M3:** 자료 영향이라 설계 §7에만 적었다.
- **M5:** 통과 수행의 최종 답이 곧 정답표가 되는 문제로, MOON 판단 사항이다.
- **M6:** 기록 한도·멈춤 때 `submit`이 거짓 안내를 하는 기존 결함으로, 따로 다룬다.

**헤드리스 확인(aace161).** 14개 중 13개가 통과했다. 반영한 것은 다음과 같다.
- **2e 일부 실패:** 1280×800 작업 목록 표의 "저장"이 '저/장'으로 쪼개졌다. `.mark`를 nowrap으로 하고 표시 칸을 `minmax(36px, max-content)`로 바꾼다.
- **결함 2:** 창 밖 단계 버튼이 고친 값을 무시하고 저장된 답으로 끝냈다. 이제 한 번 알린다(게임 화면은 창을 열고).

참고로 남긴 것은 다음과 같다(이번 변경 밖).
- 작업 목록 표가 좁아 '입/력' 버튼과 '양/호' 라디오가 줄바꿈된다.
- 375×812 초반 단계에서 작업 목록 안쪽이 2px 넘친다.

**커밋 4개(구현 하위 에이전트).**
1. TaskScreen 경고 보완. 시험은 recordWiring.
2. LabScreen `goTo(p, talk)`. 시험은 wrapupWiring.
3. CSS 표시. 시험은 recordWiring.
4. 앱 판·README·grading 주석. 시험은 buildInfo, researchBundle.

**확인 순서.** 전체 시험·tsc·빌드를 돌린 뒤, 바뀐 동작(목록 보존·창 옮기기 경고·창 밖 단계 버튼 경고·표 칸 표시·대화 예약 취소)만 헤드리스로 다시 확인한다.

## 재검토·재확인 (2026-11-11)
**재검토(aace161..649a525).** Critical은 없고 Important가 1건 나왔다.
- **Important:** 게임 화면 큰 버튼이 `onContext` 효과가 넘긴 오래된 `doStep`을 불렀다. 그 효과의 deps에 `inputs`가 없어서다. 그래서 작업 목록에서 고친 값을 못 보고 경고 없이 끝냈다.
- **Minor:**
  - 새로 연 창의 경고가 화면 아래에 묻혔다.
  - 이 경로의 경고 문구가 모호했다.
  - README가 앞선 판 범위, errorCount, 순서 오류 feedbackKind를 빠뜨렸다.
  - grading 주석이 틀렸다.

**재확인(4aeaad9, 헤드리스).** 7개 중 6개가 통과했다.
- **실패:** C3 큰 버튼이 경고 없이 완료됐다. 저장값으로 되돌리면 헛경고가 떴다. 위 Important를 재현한 것이다.
- **통과:** C1 목록 보존, C2 창 옮기기 경고, 작업 목록 줄 버튼, 처음 적은 칸, C4 대화 예약 취소, C5 표시 한 줄, C6 `0.3.1-demo+…`, C7 콘솔 오류·쓰기 0.
- **참고 1:** 바닥 탭·조이스틱은 `goTo`를 거치지 않아 대화 예약이 남는다. 설계 §6.1에 적은 받아들인 한계다.
- **참고 2:** 작업 목록 표의 '입/력'·'양/호' 줄바꿈은 이번 범위 밖이다.
- **참고 3:** r1이 몇 시간 멈춘 원인은 확인 도구의 CDP 호출에 시간 제한이 없던 탓이다. 새 `s2-lib.mjs`에 제한을 넣었다.

**2차 수정(하위 에이전트).**
1. `doStepRef`로 늘 최신 `doStep`을 부른다. `revealOnOpen`으로 새 창의 경고를 끌어오고, `warnUnsaved(stepId, again)`으로 경로별 문구를 쓴다.
2. README 문구·grading 주석.

이어서 전체 시험·tsc·빌드를 돌리고, C3 큰 버튼·헛경고·조향각 창 경고 보이기를 헤드리스로 다시 확인한다.

**3차 확인(64f963e, 헤드리스).**
- **통과:** G1 축중 큰 버튼, G2 헛경고 없음, G3 좌·우 큰 버튼은 통과했다(큰 버튼 결함 해결).
- **G4 실패:** 조향각 창에서 경고가 창 아래로 잘렸다. 처리 순서는 다음과 같았다.
  1. 창이 열릴 때 `RecordWindow`의 `[title]` 효과가 `scrollTop = 0`으로 맨 위로 되돌린다.
  2. TaskScreen이 경고를 끌어온다(110).
  3. 개발 모드 StrictMode가 새 창의 효과를 한 번 더 돌리면서 다시 0으로 되돌린다.
- **수정 8d6dc33:** 창 밖 버튼이 연 창의 경고 끌어오기를 `requestAnimationFrame`으로 미뤘다. 시험 898과 tsc가 통과했다. G4만 다시 확인한다.

**4차 확인(8d6dc33, 헤드리스).** 모두 통과했다.
- **G4 통과:** 1280×800에서 scrollTop 110, 1024×768에서 142로, 경고가 보이는 영역 안에 있다. 0.6초·1.5초 뒤에도 같다. 스크롤은 0 → 0(StrictMode 두 번째 효과) → 다음 프레임에 끌어오기 순서로 움직였다.
- **G1 회귀 통과.**
- 콘솔 오류·차단된 쓰기 요청은 0건이다.
- **확인하지 않은 것:** 운영 빌드에서의 동작(이중 효과가 없으니 같은 결과일 것으로 봄), 실기기·태블릿 글꼴.
