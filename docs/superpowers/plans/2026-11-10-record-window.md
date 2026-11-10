# 기록 창 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기록 단계에서 버튼 하나로 그 단계의 칸만 담은 창을 열어, 계기 그림을 보며 적고 단계를 끝내게 한다. 최소회전반경 조향각은 측정판 눈금을 읽어 적고, 제출한 값은 화면을 바꿔도 남으며, 다시 확인할 칸은 고치기로 바로 연다.

**Architecture:** 규칙은 순수 모듈 `src/app/recordSteps.ts` 한곳에 둔다. 칸 목록은 엔진의 `responseItemsOf`를 그대로 쓴다. 창은 게임 화면이 준 자리(`recordHost`)에 TaskScreen이 portal로 그린다. 그래서 칸 값·제출 함수는 작업 목록(서랍)과 같고, 글자를 칠 때 3D 장면이 다시 그려지지 않는다. LabScreen은 `ctx.recordOpen`을 보고 걷기·버튼·알림을 멈춘다. 새 기록 항목·사건은 없다.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest(node 환경, `renderToStaticMarkup`로 화면 시험, 소스 검사로 배선 시험), react-three-fiber(3D 장면).

**설계 문서:** `docs/superpowers/specs/2026-11-10-record-window-design.md`(05853e1, MOON 승인). 아래 "§n"은 이 문서의 절이다.

---

## 작업 규칙
- 작업 폴더: `/Users/jamingchu/claude code/chassis-3d-lab-cozy`(git worktree, 브랜치 `cozy-stage1`). 모든 명령은 이 폴더에서 한다.
- **push·배포·main 합치기 금지.** `cozy-stage1`은 절대 push하지 않는다. 합치기·재배포는 MOON이 따로 말할 때만 한다.
- `git add`는 파일을 하나씩 적는다. `tsconfig.tsbuildinfo`는 커밋하지 않는다. 맨 `git stash`는 쓰지 않는다. 새 패키지는 설치하지 않는다.
- 채점(`src/domain/grading.ts`)은 건드리지 않는다. 편차 6.69 문제는 MOON 결정 대기다.
- 시험 하나: `npm test -- tests/파일.test.ts`. 전체: `npm test`. 형 검사: `node_modules/.bin/tsc -p tsconfig.json --noEmit`. 시험이 멈추면 `perl -e 'alarm 300; exec @ARGV' npm test -- …`처럼 시간 제한을 건다.
- 커밋 메시지 끝에는 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`을 붙인다(아래 명령처럼 `-m`을 두 번).

## 파일 구조

| 파일 | 할 일 |
|---|---|
| `src/domain/taskEngine.ts`(고침) | `responseItemsOf(step)` 내보내기. 동작은 그대로 |
| `src/scene/turningRig.ts`(고침) | `steeredRig(task)`: 측정 당시 바퀴 각도 |
| `src/app/recordSteps.ts`(새) | 기록 단계·칸·이름·열림 조건·복원 값·칸 표시·다시 보기 조건·빠진 칸 문구·창 크기·창 안 스크롤 계산 |
| `src/screens/TurningDialPicture.tsx`(새) | 측정판 눈금 그림(SVG), 그림 제목, 다시 보기 버튼 |
| `src/app/focusResponse.ts`(고침) | id 앞머리(`resp-`·`rec-`) |
| `src/screens/RecordFields.tsx`(새) | 칸 한 줄(숫자·판정). 서랍과 창이 함께 쓴다 |
| `src/screens/FeedbackBox.tsx`(고침) | 고치기 버튼(`fixItems`) |
| `src/screens/RecordSheet.tsx`(새) | 창 안 단계별 내용 |
| `src/screens/RecordWindow.tsx`(새) | 창 틀: 머리·스크롤·아래 줄, Esc·Tab·초점, 보이는 화면 따라가기 |
| `src/screens/TaskScreen.tsx`(고침) | 값 복원, 공용 칸, 측정판 그림, 좌·우 막기, 기록 단계 이름, 고치기, 창 열기·닫기·portal |
| `src/scene/LabScene.tsx`(고침) | `holdStill`: 걷기 멈춤(학생은 보임) |
| `src/screens/LabScreen.tsx`(고침) | 창 자리, 목록 닫기·다시 열기, 숨기기, 걷기 멈춤, 알림 연결 |
| `src/app/hudLayout.ts`(고침) | 기록 창을 겹침 측정 제외 목록에 |
| `src/styles.css`(고침) | 그림·칸·창 모양 |
| `tests/helpers/recordRuns.ts`(새) | 시험용 수행 만들기·과제 패널 그리기 |

작업 순서: 1~6은 서로 독립된 부품, 7~9는 작업 목록(서랍·기본 화면), 10~12는 창, 13~14는 게임 화면 연결, 15는 전체 확인이다.

---

### Task 1: 엔진 — 단계의 응답 칸 정의 내보내기

**Files:**
- Modify: `src/domain/taskEngine.ts:111-119`(RESPONSE_REQUIREMENTS 아래), `:221`(attemptStep의 needed)
- Test: `tests/recordEngine.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/recordEngine.test.ts`

```ts
// 기록 창(설계 2026-11-10 §2·§3.1): 창이 쓰는 단계별 칸은 엔진 완료 조건과 같아야 하고,
// 창을 여는 근거인 '칸이 비어 단계를 못 끝낸 시도'는 기록을 남기지 않아야 한다.
import { describe, expect, test } from 'vitest'
import brake1 from '../src/data/tasks/task.braking-force.case-lv1.json'
import brake2 from '../src/data/tasks/task.braking-force.case-lv2.json'
import turn1 from '../src/data/tasks/task.min-turning-radius.case-lv1.json'
import turn2 from '../src/data/tasks/task.min-turning-radius.case-lv2.json'
import { attempt, createTaskRun, responseItemsOf, submitResponse, type TaskRun } from '../src/domain/taskEngine'
import type { ApprovedTask } from '../src/domain/types'

const tasks = [brake1, brake2, turn1, turn2] as unknown as ApprovedTask[]
let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const deps = { now: () => 1000, newId: id }
const step = (r: TaskRun, stepId: string) => attempt(r, { type: 'step', stepId }, id())

describe('단계의 응답 칸', () => {
  test('네 사례 모두 기록 단계와 칸이 설계 표와 같다', () => {
    for (const t of tasks) {
      const rec = t.steps.filter((s) => responseItemsOf(s).length > 0).map((s) => [s.stepId, responseItemsOf(s)])
      if (t.taskId === 'braking-force') expect(rec).toEqual([['axle', ['axleWeight']], ['read', ['left', 'right']], ['calc', ['deviation', 'sum', 'vehicleCondition']]])
      else expect(rec).toEqual([['read', ['leftAngle', 'rightAngle']], ['record', ['radius', 'vehicleCondition']]])
    }
  })
  test('기록 단계가 아니면 빈 목록', () => {
    expect(responseItemsOf({ completionCondition: 'ppeConfirmed' })).toEqual([])
  })
})

describe('창을 여는 근거', () => {
  test('칸이 비어 못 끝낸 시도는 사건을 남기지 않고, 칸을 채운 뒤 끝내면 제출·완료 순으로 남는다', () => {
    let r = createTaskRun(tasks[0]!, { difficultyMode: 'unguided' }, deps)
    r = step(r, 'ppe').run
    r = attempt(r, { type: 'confirmSafety', conditionId: 's-engine' }, id()).run
    for (const s of ['tire', 'equip', 'enter']) r = step(r, s).run
    const before = r.events.length
    const a = step(r, 'axle')
    expect(a.outcome).toBe('incomplete')
    expect(a.reasonCode).toBe('NEEDS_RESPONSE_axleWeight')
    expect(a.run.events.length).toBe(before)
    expect(a.run.errorCount).toBe(0)
    r = submitResponse(a.run, 'axleWeight', '600', id()).run
    r = step(r, 'axle').run
    expect(r.events.slice(before).map((e) => e.type)).toEqual(['answerSubmitted', 'stepCompleted'])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recordEngine.test.ts`
Expected: FAIL — `responseItemsOf is not a function`

- [ ] **Step 3: 구현** — `src/domain/taskEngine.ts`

`RESPONSE_REQUIREMENTS` 묶음(닫는 `}` 줄) 바로 아래에 더한다.

```ts
/** 단계의 완료 조건이 요구하는 응답 칸. 기록 창·고치기도 이 정의를 쓴다(설계 2026-11-10 §2) */
export function responseItemsOf(step: Pick<TaskStep, 'completionCondition'>): readonly string[] {
  return RESPONSE_REQUIREMENTS[step.completionCondition] ?? []
}
```

attemptStep에서 바꿀 곳:

```ts
  const needed = RESPONSE_REQUIREMENTS[step.completionCondition] ?? []
```

바꾼 글:

```ts
  const needed = responseItemsOf(step)
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/recordEngine.test.ts tests/turningTask.test.ts`
Expected: PASS(두 파일 모두)

- [ ] **Step 5: 커밋**

```bash
git add src/domain/taskEngine.ts tests/recordEngine.test.ts
git commit -m "feat(기록 창): 단계의 응답 칸 정의를 엔진에서 내보낸다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 측정 당시 바퀴 각도(`steeredRig`)

**Files:**
- Modify: `src/scene/turningRig.ts:1-16`
- Test: `tests/turningRig.test.ts`(더하기)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/turningRig.test.ts`

맨 위 import 두 줄을 바꾼다.

```ts
import brakeRaw from '../src/data/tasks/task.braking-force.case-lv1.json'
import { frontWheelWorld, steeredRig, turningRigState } from '../src/scene/turningRig'
```

(`import { frontWheelWorld, turningRigState } from '../src/scene/turningRig'` 줄을 위 두 줄로 바꾼다.)

`describe('최소회전반경 차량 연출', …)` 안 맨 끝에 더한다.

```ts
  it('측정 당시 각도는 조향 단계와 관계없이 사례 각도(기록 창 다시 보기용), 회전 방향이 없으면 직진', () => {
    expect(steeredRig(lv1Raw as unknown as ApprovedTask)).toEqual({ leftDeg: 35, rightDeg: 30 })
    expect(steeredRig(lv2Raw as unknown as ApprovedTask)).toEqual({ leftDeg: -32, rightDeg: -36 })
    expect(steeredRig(brakeRaw as unknown as ApprovedTask)).toEqual({ leftDeg: 0, rightDeg: 0 })
  })
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/turningRig.test.ts`
Expected: FAIL — `steeredRig is not a function`

- [ ] **Step 3: 구현** — `src/scene/turningRig.ts`의 import부터 `turningRigState` 끝까지를 아래로 바꾼다(아래쪽 `K3_FRONT_WHEEL`·`frontWheelWorld`는 그대로).

```ts
// 최소회전반경 측정 차량 연출 상태(과제 진행 → 앞바퀴 조향각). 연출 전용 — 판정·기록과 무관.
// ‘핸들 끝까지 돌림’(steer)을 마친 뒤 ‘직진으로 되돌림’(return) 전까지 앞바퀴가 사례 각도만큼 꺾여 있다.
// 각도는 부호 있음: + = 차의 왼쪽으로 꺾임(위에서 볼 때 시계 반대, three.js rotation.y +).
import type { TaskRun } from '../domain/taskEngine'
import type { ApprovedTask } from '../domain/types'

export interface TurningRig { leftDeg: number; rightDeg: number }
export const STRAIGHT: TurningRig = { leftDeg: 0, rightDeg: 0 }

/** 핸들을 끝까지 돌린 상태의 앞바퀴 각도(측정 당시). 회전 방향이 없으면 직진. 기록 창의 '측정 당시 눈금 다시 보기'도 이 값을 쓴다 */
export function steeredRig(task: ApprovedTask): TurningRig {
  const m = task.measurement
  if (m.turnDirection !== 'left' && m.turnDirection !== 'right') return STRAIGHT
  const s = m.turnDirection === 'left' ? 1 : -1
  return { leftDeg: s * (m.leftAngleDeg ?? 0), rightDeg: s * (m.rightAngleDeg ?? 0) }
}

export function turningRigState(run: TaskRun | null): TurningRig {
  if (!run || run.task.taskId !== 'min-turning-radius') return STRAIGHT
  const steered = run.completedSteps.includes('steer') && !run.completedSteps.includes('return')
  return steered ? steeredRig(run.task) : STRAIGHT
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/turningRig.test.ts`
Expected: PASS(기존 시험 포함)

- [ ] **Step 5: 커밋**

```bash
git add src/scene/turningRig.ts tests/turningRig.test.ts
git commit -m "feat(기록 창): 측정 당시 바퀴 각도(steeredRig)를 따로 꺼낸다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 기록 규칙 모듈(`recordSteps.ts`)과 시험 도우미

**Files:**
- Create: `src/app/recordSteps.ts`
- Create: `tests/helpers/recordRuns.ts`
- Test: `tests/recordSteps.test.ts`(새)

- [ ] **Step 1: 시험 도우미 만들기** — `tests/helpers/recordRuns.ts`

```ts
// 기록 창 시험용 수행 만들기(설계 2026-11-10). 엔진 함수만 써서 단계를 진행하고, 과제 패널을 서버 없이 그린다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import brake1 from '../../src/data/tasks/task.braking-force.case-lv1.json'
import turn1 from '../../src/data/tasks/task.min-turning-radius.case-lv1.json'
import { attempt, createTaskRun, submitResponse, type DifficultyMode, type TaskRun } from '../../src/domain/taskEngine'
import type { SessionContext } from '../../src/domain/record'
import type { ApprovedTask } from '../../src/domain/types'
import type { Repository } from '../../src/records/repository'
import { TaskScreen } from '../../src/screens/TaskScreen'

export const brake = brake1 as unknown as ApprovedTask
export const turn = turn1 as unknown as ApprovedTask
let n = 0
export const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const deps = { now: () => 1000, newId: id }
export const step = (r: TaskRun, s: string) => attempt(r, { type: 'step', stepId: s }, id()).run
export const safe = (r: TaskRun, c: string) => attempt(r, { type: 'confirmSafety', conditionId: c }, id()).run
export const answer = (r: TaskRun, item: string, v: string) => submitResponse(r, item, v, id()).run

/** 제동력: 차량 진입(enter)까지 */
export function brakeToEnter(mode: DifficultyMode = 'guided'): TaskRun {
  let r = createTaskRun(brake, { difficultyMode: mode }, deps)
  r = safe(step(r, 'ppe'), 's-engine')
  for (const s of ['tire', 'equip', 'enter']) r = step(r, s)
  return r
}
/** 제동력: 페달(press)까지(축중은 600으로 적음) */
export function brakeToPress(mode: DifficultyMode = 'guided'): TaskRun {
  let r = step(answer(brakeToEnter(mode), 'axleWeight', '600'), 'axle')
  r = safe(step(r, 'mode'), 's-lift')
  for (const s of ['lower', 'motor', 'press']) r = step(r, s)
  return r
}
/** 제동력: 차량 빼기(off)까지(좌 240·우 200으로 적음) */
export function brakeToOff(mode: DifficultyMode = 'guided'): TaskRun {
  let r = step(answer(answer(brakeToPress(mode), 'left', '240'), 'right', '200'), 'read')
  r = attempt(r, { type: 'subStep', stepId: 'off', action: 'motorOff' }, id()).run
  r = safe(r, 's-lift')
  r = attempt(r, { type: 'subStep', stepId: 'off', action: 'liftUp' }, id()).run
  return attempt(r, { type: 'subStep', stepId: 'off', action: 'exitVehicle' }, id()).run
}
/** 최소회전반경: 조향(steer)까지 */
export function turnToSteer(mode: DifficultyMode = 'guided'): TaskRun {
  let r = createTaskRun(turn, { difficultyMode: mode }, deps)
  for (const s of ['ppe', 'engineOff', 'turntable', 'direction', 'steer']) r = step(r, s)
  return r
}
/** 최소회전반경: 직진 복귀(return)까지(조향각은 받은 값으로 적음) */
export function turnToReturn(mode: DifficultyMode, left: string, right: string): TaskRun {
  return step(step(answer(answer(turnToSteer(mode), 'leftAngle', left), 'rightAngle', right), 'read'), 'return')
}
/** 과제 패널(작업 목록·기본 화면)을 서버 없이 그린다. 기록 창 자리는 넘기지 않는다 */
export function renderPanel(run: TaskRun): string {
  return renderToStaticMarkup(createElement(TaskScreen, {
    repo: {} as unknown as Repository,
    session: { recordId: 'r1', anonymousStudentCode: 'A-01' } as unknown as SessionContext,
    initialRun: run, onFinish: () => {}, embedded: true,
  }))
}
```

- [ ] **Step 2: 실패하는 시험 쓰기** — `tests/recordSteps.test.ts`

```ts
// 기록 창 규칙(설계 2026-11-10 §2·§3·§5·§7·§8): 칸·이름·열림·복원·표시·다시 보기·창 크기·스크롤
import { describe, expect, test } from 'vitest'
import { canReviewDial, itemOpen, markFor, missingText, recordItems, recordLabel, recordStepOf, recordWindowBox, restoreInputs, scrollDelta } from '../src/app/recordSteps'
import { answer, brake, brakeToEnter, brakeToPress, turn, turnToReturn, turnToSteer } from './helpers/recordRuns'

describe('기록 단계·칸·이름', () => {
  test('기록 단계에만 이름이 있다', () => {
    expect(recordLabel(brake, 'axle')).toBe('축중 기록')
    expect(recordLabel(brake, 'read')).toBe('좌·우 제동력 기록')
    expect(recordLabel(brake, 'calc')).toBe('계산·판정 기록')
    expect(recordLabel(turn, 'read')).toBe('조향각 기록')
    expect(recordLabel(turn, 'record')).toBe('반경·판정 기록')
    expect(recordLabel(brake, 'press')).toBeNull()
    expect(recordLabel(turn, 'steer')).toBeNull()
  })
  test('칸과 칸이 속한 단계', () => {
    expect(recordItems(brake, 'calc')).toEqual(['deviation', 'sum', 'vehicleCondition'])
    expect(recordItems(brake, 'motor')).toEqual([])
    expect(recordStepOf(brake, 'right')).toBe('read')
    expect(recordStepOf(brake, 'vehicleCondition')).toBe('calc')
    expect(recordStepOf(turn, 'vehicleCondition')).toBe('record')
    expect(recordStepOf(turn, 'axleWeight')).toBeNull()
  })
})

describe('칸이 열리는 때', () => {
  test('선행 단계가 끝나야 열린다', () => {
    const r = brakeToEnter()
    expect(itemOpen(r, 'axleWeight', false)).toBe(true)
    expect(itemOpen(r, 'left', true)).toBe(false)
    expect(itemOpen(r, 'deviation', true)).toBe(false)
    const t = turnToSteer()
    expect(itemOpen(t, 'leftAngle', false)).toBe(true)
    expect(itemOpen(t, 'radius', false)).toBe(false)
  })
  test('제동력 좌·우는 페달 뒤에도 최대값이 고정돼야 열린다', () => {
    const r = brakeToPress()
    expect(itemOpen(r, 'left', false)).toBe(false)
    expect(itemOpen(r, 'right', true)).toBe(true)
  })
})

describe('값 복원·칸 표시', () => {
  test('제출한 최종 답만 채우고, 판정은 고른 값으로 채운다', () => {
    expect(restoreInputs(answer(answer(brakeToEnter(), 'axleWeight', '610'), 'axleWeight', '600'))).toEqual({ axleWeight: '600' })
    const t = answer(turnToReturn('guided', '35', '30'), 'vehicleCondition', 'pass')
    expect(restoreInputs(t)).toEqual({ leftAngle: '35', rightAngle: '30', vehicleCondition: 'pass' })
  })
  test('형식이 틀린 입력은 복원하지 않는다', () => {
    expect(restoreInputs(answer(brakeToEnter(), 'axleWeight', '6백'))).toEqual({})
  })
  test('안내 있음은 ✓·✗, 안내 없음은 최초 답이 다 모이기 전까지 저장만', () => {
    const g = answer(brakeToEnter('guided'), 'axleWeight', '610')
    expect(markFor(g, 'axleWeight')).toEqual({ text: '✗', cls: 'bad' })
    expect(markFor(g, 'left')).toEqual({ text: '', cls: '' })
    expect(markFor(answer(brakeToEnter('unguided'), 'axleWeight', '610'), 'axleWeight')).toEqual({ text: '저장', cls: '' })
  })
})

describe('측정 당시 눈금 다시 보기', () => {
  test('안내 없음은 최초 답이 다 모이기 전에는 없고, 각도 오답이 드러나면 생기고, 고쳐 맞히면 없어진다', () => {
    let t = turnToReturn('unguided', '34', '30')
    expect(canReviewDial(t)).toBe(false)
    t = answer(answer(t, 'radius', '5.5'), 'vehicleCondition', 'pass')
    expect(canReviewDial(t)).toBe(true)
    expect(canReviewDial(answer(t, 'leftAngle', '35'))).toBe(false)
  })
  test('직진 복귀 전이거나 각도가 맞거나 제동력이면 없다', () => {
    expect(canReviewDial(answer(turnToSteer('guided'), 'leftAngle', '34'))).toBe(false)
    expect(canReviewDial(turnToReturn('guided', '35', '30'))).toBe(false)
    expect(canReviewDial(turnToReturn('guided', '34', '30'))).toBe(true)
    expect(canReviewDial(brakeToEnter())).toBe(false)
  })
})

describe('창 크기·스크롤·빠진 칸 문구', () => {
  test('보이는 화면을 따르고, 없으면 innerHeight', () => {
    expect(recordWindowBox({ height: 400, offsetTop: 0 }, 800)).toEqual({ top: 8, maxHeight: 384 })
    expect(recordWindowBox({ height: 380.4, offsetTop: 120.2 }, 800)).toEqual({ top: 128, maxHeight: 364 })
    expect(recordWindowBox(null, 700)).toEqual({ top: 8, maxHeight: 684 })
    expect(recordWindowBox({ height: 100, offsetTop: 0 }, 800).maxHeight).toBe(160)
  })
  test('줄이 창 안에 다 보이게 움직일 양(줄이 창보다 크면 줄의 위를 맞춘다)', () => {
    const body = { top: 100, bottom: 400 }
    expect(scrollDelta(body, { top: 150, bottom: 250 })).toBe(0)
    expect(scrollDelta(body, { top: 60, bottom: 120 })).toBe(-48)
    expect(scrollDelta(body, { top: 350, bottom: 450 })).toBe(58)
    expect(scrollDelta(body, { top: 300, bottom: 800 })).toBe(192)
  })
  test('입력을 누르지 않은 칸은 그것을 알린다', () => {
    expect(missingText('축중', false)).toBe('축중 입력이 필요합니다.')
    expect(missingText('축중', true)).toBe('축중 칸 옆 입력을 눌러야 저장됩니다.')
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `npm test -- tests/recordSteps.test.ts`
Expected: FAIL — `Failed to resolve import "../src/app/recordSteps"`(모듈 없음)

- [ ] **Step 4: 구현** — `src/app/recordSteps.ts`

```ts
// 기록 창(설계 docs/superpowers/specs/2026-11-10-record-window-design.md)의 규칙을 한곳에 둔다:
// 어느 단계가 기록 단계인지, 칸·이름·칸이 열리는 때·복원 값·칸 표시·다시 보기 조건·빠진 칸 문구·창 크기·창 안 스크롤.
// 칸 목록은 엔진 정의(responseItemsOf)를 그대로 쓴다. 화면 상태만 다루고 수행 기록은 바꾸지 않는다.
import { answerFeedbackAllowed } from '../domain/feedbackPolicy'
import { responseItemsOf, type TaskRun } from '../domain/taskEngine'
import type { ApprovedTask } from '../domain/types'

/** 완료 조건별 버튼·창 이름(§2) */
const RECORD_LABEL: Record<string, string> = {
  axleWeightRead: '축중 기록',
  readingsSubmitted: '좌·우 제동력 기록',
  answersSubmitted: '계산·판정 기록',
  anglesRead: '조향각 기록',
  radiusSubmitted: '반경·판정 기록',
}

const stepById = (task: ApprovedTask, stepId: string) => task.steps.find((s) => s.stepId === stepId)

/** 기록 단계의 칸. 기록 단계가 아니면 빈 배열 */
export function recordItems(task: ApprovedTask, stepId: string): readonly string[] {
  const st = stepById(task, stepId)
  return st ? responseItemsOf(st) : []
}

/** 기록 단계면 버튼·창 이름, 아니면 null */
export function recordLabel(task: ApprovedTask, stepId: string): string | null {
  const st = stepById(task, stepId)
  if (!st || responseItemsOf(st).length === 0) return null
  return RECORD_LABEL[st.completionCondition] ?? '기록'
}

/** 칸이 속한 기록 단계 */
export function recordStepOf(task: ApprovedTask, itemId: string): string | null {
  return task.steps.find((s) => responseItemsOf(s).includes(itemId))?.stepId ?? null
}

/** 칸이 열렸는가(§2): 그 단계의 선행 단계가 모두 끝났을 때. 제동력 좌·우는 최대값이 고정된 뒤(hold)에만 */
export function itemOpen(run: TaskRun, itemId: string, hold: boolean): boolean {
  const stepId = recordStepOf(run.task, itemId)
  const st = stepId ? stepById(run.task, stepId) : undefined
  if (!st || !st.prerequisites.every((p) => run.completedSteps.includes(p))) return false
  return itemId === 'left' || itemId === 'right' ? hold : true
}

/** 제출한 최종 답으로 칸을 다시 채운다(§7). 숫자 칸은 finalInput, 판정은 finalAnswer. 제출하지 않은 칸은 넣지 않는다 */
export function restoreInputs(run: TaskRun): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of run.responses.items) {
    const v = i.finalAnswer ?? i.finalInput
    if (v !== null) out[i.itemId] = v
  }
  return out
}

/** 칸 옆 표시(§3.2). 정오를 보여 줄 수 없으면(안내 없음, 최초 답이 다 모이기 전) 제출한 칸에 '저장'만 */
export function markFor(run: TaskRun, itemId: string): { text: string; cls: string } {
  const i = run.responses.items.find((x) => x.itemId === itemId)
  if (!i || (i.finalInput === null && i.finalAnswer === null)) return { text: '', cls: '' }
  if (!answerFeedbackAllowed(run)) return { text: '저장', cls: '' }
  if (i.finalCorrect === true) return { text: '✓', cls: 'ok' }
  if (i.finalCorrect === false) return { text: '✗', cls: 'bad' }
  return { text: '', cls: '' }
}

/** 측정 당시 눈금 다시 보기(§5): 직진 복귀 뒤, 정오를 보여 줄 수 있고, 조향각 최종 답이 하나라도 오답일 때만 */
export function canReviewDial(run: TaskRun): boolean {
  if (!run.completedSteps.includes('return') || !answerFeedbackAllowed(run)) return false
  return run.responses.items.some((i) => (i.itemId === 'leftAngle' || i.itemId === 'rightAngle') && i.finalCorrect === false)
}

/** 단계를 끝내려는데 칸이 비었을 때(§3.2). 적어 두고 입력을 누르지 않았으면 그것을 알린다 */
export function missingText(label: string, typed: boolean): string {
  return typed ? `${label} 칸 옆 입력을 눌러야 저장됩니다.` : `${label} 입력이 필요합니다.`
}

/** 창 위치·최대 높이(§8): 보이는 화면(visualViewport)을 따른다. 없으면 innerHeight */
export function recordWindowBox(vv: { height: number; offsetTop: number } | null, innerHeight: number): { top: number; maxHeight: number } {
  const height = vv ? vv.height : innerHeight
  return { top: Math.round((vv ? vv.offsetTop : 0) + 8), maxHeight: Math.max(160, Math.round(height - 16)) }
}

/** 창 안 스크롤 양(§8): 줄이 창 안(body)에 다 보이게 scrollTop에 더할 값. 줄이 창보다 크면 줄의 위를 맞춘다 */
export function scrollDelta(body: { top: number; bottom: number }, row: { top: number; bottom: number }, margin = 8): number {
  if (row.top < body.top + margin) return row.top - body.top - margin
  if (row.bottom > body.bottom - margin) return Math.min(row.bottom - body.bottom + margin, row.top - body.top - margin)
  return 0
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm test -- tests/recordSteps.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/app/recordSteps.ts tests/helpers/recordRuns.ts tests/recordSteps.test.ts
git commit -m "feat(기록 창): 기록 단계·칸 열림·복원·다시 보기 조건·창 크기 규칙 모듈" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 측정판 눈금 그림(`TurningDialPicture.tsx`)

**Files:**
- Create: `src/screens/TurningDialPicture.tsx`
- Modify: `src/styles.css`(맨 끝에 더하기)
- Test: `tests/turningDialPicture.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/turningDialPicture.test.ts`

```ts
// 측정판 눈금 그림(설계 2026-11-10 §5, 결정 A): 각도는 글자로 쓰지 않고, 바늘 + 쪽이 화면 오른쪽
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { dialCaption, DIAL, dialPoint, ReviewToggle, TurningDialPicture } from '../src/screens/TurningDialPicture'

const html = (deg: number, caption?: string) => renderToStaticMarkup(createElement(TurningDialPicture, { side: 'left', deg, caption }))
const texts = (h: string) => h.replace(/<[^>]+>/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean)
const needle = (h: string) => h.match(/<line class="needle" x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/)!.slice(1).map(Number)

describe('측정판 눈금 그림', () => {
  test('0°는 아래 가운데, + 쪽은 화면 오른쪽', () => {
    expect(dialPoint(100, 0)).toEqual({ x: DIAL.CX, y: DIAL.CY + 100 })
    expect(dialPoint(100, 30).x).toBeGreaterThan(DIAL.CX)
    expect(dialPoint(100, -30).x).toBeLessThan(DIAL.CX)
  })
  test('글자는 이름과 눈금 숫자뿐이고 바늘 각도는 없다', () => {
    for (const deg of [0, 35, -32]) expect(texts(html(deg))).toEqual(['좌측 바퀴', '40', '30', '20', '10', '0', '10', '20', '30', '40'])
    expect(html(35)).toContain('aria-label="좌측 바퀴 회전반경 측정판 눈금"')
  })
  test('바늘: 0°면 세로, 좌회전(+)이면 오른쪽, 우회전(−)이면 왼쪽으로 기운다', () => {
    const [x1, , x2] = needle(html(0))
    expect(x1).toBe(DIAL.CX)
    expect(x2).toBe(DIAL.CX)
    expect(needle(html(35))[2]).toBeGreaterThan(DIAL.CX)
    expect(needle(html(-32))[2]).toBeLessThan(DIAL.CX)
  })
  test('1° 눈금 91개(긴 눈금 19개)이고 띠가 그림 안에 든다', () => {
    const h = html(0)
    expect(h.match(/<line /g)!.length).toBe(91 + 1)
    expect(h.match(/stroke-width="3.5"/g)!.length).toBe(19)
    expect(dialPoint(DIAL.RT, 45).x).toBeLessThan(DIAL.W)
    expect(dialPoint(DIAL.RT, -45).x).toBeGreaterThan(0)
    expect(dialPoint(DIAL.RP0, 45).y).toBeGreaterThan(0)
  })
  test('다시 보기 제목·버튼 글자', () => {
    expect(dialCaption('left', false)).toBe('좌측 바퀴')
    expect(dialCaption('right', true)).toBe('우측 바퀴 — 측정 당시(핸들을 끝까지 돌렸을 때)')
    expect(texts(html(35, dialCaption('left', true)))[0]).toBe('좌측 바퀴 — 측정 당시(핸들을 끝까지 돌렸을 때)')
    expect(renderToStaticMarkup(createElement(ReviewToggle, { reviewing: false, onToggle: () => {} }))).toContain('측정 당시 눈금 다시 보기')
    expect(renderToStaticMarkup(createElement(ReviewToggle, { reviewing: true, onToggle: () => {} }))).toContain('지금 눈금 보기')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/turningDialPicture.test.ts`
Expected: FAIL — `Failed to resolve import "../src/screens/TurningDialPicture"`

- [ ] **Step 3: 구현** — `src/screens/TurningDialPicture.tsx`

```tsx
// 회전반경 측정판 눈금 그림(설계 2026-11-10 §5, MOON 결정 A). 3D 측정판(scene/models/TurntableDial.tsx)과 같은 눈금:
// 바퀴 바깥이 0°, 앞뒤로 45°까지 1° 눈금, 5°마다 긴 눈금, 10°마다 숫자(절댓값). 3D 확대 보기처럼 바퀴 바깥에서 본 모습이라
// 0°가 아래 가운데에 있다. 바늘 각도 +는 화면 오른쪽이다(바퀴 바깥에 서서 보면 좌회전은 두 바퀴 모두 오른쪽).
// 각도는 글자·aria-label 어디에도 숫자로 쓰지 않는다(학생이 눈금을 읽는다). 띠가 그림 폭을 채워 1° 눈금 사이가 폭의 약 1.2%다.

/** 그림 치수(viewBox 단위). 중심(CX, CY)은 그림 위쪽 바깥에 있다 */
export const DIAL = { W: 620, H: 214, CX: 310, CY: -250, RT: 420, RL: 384, RS: 404, RN: 446, RP0: 360, RP1: 432 } as const

/** 중심에서 r만큼, 아래(0°)에서 deg만큼 오른쪽(+)으로 돈 점 */
export function dialPoint(r: number, deg: number): { x: number; y: number } {
  const t = (deg * Math.PI) / 180
  return { x: DIAL.CX + r * Math.sin(t), y: DIAL.CY + r * Math.cos(t) }
}

/** 그림 제목: 다시 보기 중이면 측정 당시임을 밝힌다 */
export const dialCaption = (side: 'left' | 'right', reviewing: boolean) => `${side === 'left' ? '좌측 바퀴' : '우측 바퀴'}${reviewing ? ' — 측정 당시(핸들을 끝까지 돌렸을 때)' : ''}`

const r1 = (v: number) => Math.round(v * 10) / 10
const TICKS = Array.from({ length: 91 }, (_, i) => i - 45)

export function TurningDialPicture({ side, deg, caption }: { side: 'left' | 'right'; deg: number; caption?: string }) {
  const name = side === 'left' ? '좌측 바퀴' : '우측 바퀴'
  const a = Number.isFinite(deg) ? Math.max(-45, Math.min(45, deg)) : 0
  const p0 = dialPoint(DIAL.RP0, a), p1 = dialPoint(DIAL.RP1, a)
  return (
    <figure className="tt-dial">
      <figcaption>{caption ?? name}</figcaption>
      <svg viewBox={`0 0 ${DIAL.W} ${DIAL.H}`} role="img" aria-label={`${name} 회전반경 측정판 눈금`}>
        <rect x={0} y={0} width={DIAL.W} height={DIAL.H} rx={12} fill="#fff8d6" />
        {TICKS.map((t) => {
          const long = t % 5 === 0
          const q0 = dialPoint(long ? DIAL.RL : DIAL.RS, t), q1 = dialPoint(DIAL.RT, t)
          return <line key={t} x1={r1(q0.x)} y1={r1(q0.y)} x2={r1(q1.x)} y2={r1(q1.y)} stroke="#1b1b1b" strokeWidth={long ? 3.5 : 2} />
        })}
        {TICKS.filter((t) => t % 10 === 0).map((t) => {
          const q = dialPoint(DIAL.RN, t)
          return <text key={`n${t}`} x={r1(q.x)} y={r1(q.y)} transform={`rotate(${-t} ${r1(q.x)} ${r1(q.y)})`} textAnchor="middle" dominantBaseline="middle" fontSize={24} fontWeight={700} fill="#1b1b1b">{Math.abs(t)}</text>
        })}
        <line className="needle" x1={r1(p0.x)} y1={r1(p0.y)} x2={r1(p1.x)} y2={r1(p1.y)} stroke="#d50000" strokeWidth={5} strokeLinecap="round" />
      </svg>
    </figure>
  )
}

/** 측정 당시 눈금 다시 보기 버튼(각도 오답을 안 뒤에만 보인다, §5) */
export function ReviewToggle({ reviewing, onToggle }: { reviewing: boolean; onToggle: () => void }) {
  return <button className="tt-review" onClick={onToggle}>{reviewing ? '지금 눈금 보기' : '측정 당시 눈금 다시 보기'}</button>
}
```

`src/styles.css` 맨 끝에 더한다.

```css
/* 회전반경 측정판 눈금 그림(설계 2026-11-10 §5): 띠가 칸 폭을 꽉 채운다(1° 눈금 사이 = 폭의 약 1.2%) */
.tt-dial { margin:0 0 6px; }
.tt-dial figcaption { font-size:14px; font-weight:600; margin:0 0 2px; }
.tt-dial svg { display:block; width:100%; height:auto; }
.tt-review { margin:4px 0 10px; }
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/turningDialPicture.test.ts tests/hudLayout.test.ts tests/noHasSelector.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/screens/TurningDialPicture.tsx src/styles.css tests/turningDialPicture.test.ts
git commit -m "feat(기록 창): 회전반경 측정판 눈금 그림(각도 숫자 없이 바늘로)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 공용 기록 칸(`RecordFields.tsx`)과 창 칸 id

**Files:**
- Modify: `src/app/focusResponse.ts:3`
- Create: `src/screens/RecordFields.tsx`
- Modify: `src/styles.css`(맨 끝에 더하기)
- Test: `tests/recordFields.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/recordFields.test.ts`

```ts
// 기록 칸(설계 2026-11-10 §9): 서랍과 창이 같은 칸을 쓰되 id·판정 라디오 이름을 나눈다. Enter 제출용 form은 없다
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { recordInputId, responseInputId } from '../src/app/focusResponse'
import { NumberField, VerdictField, type FieldIo } from '../src/screens/RecordFields'

const io = (over: Partial<FieldIo> = {}): FieldIo => ({
  value: (id) => (id === 'axleWeight' ? '600' : id === 'vehicleCondition' ? 'fail' : ''),
  change: () => {}, submit: () => {}, mark: () => ({ text: '저장', cls: '' }), open: () => true, idOf: recordInputId, ...over,
})

describe('창 칸 id', () => {
  test('작업 목록은 resp-, 기록 창은 rec-', () => {
    expect(responseInputId('axleWeight')).toBe('resp-axleWeight')
    expect(recordInputId('axleWeight')).toBe('rec-axleWeight')
  })
})

describe('기록 칸', () => {
  test('숫자 칸: 이름·값·입력 버튼·표시', () => {
    const h = renderToStaticMarkup(createElement(NumberField, { itemId: 'axleWeight', io: io() }))
    expect(h).toContain('<label for="rec-axleWeight">축중</label>')
    expect(h).toMatch(/id="rec-axleWeight" inputMode="numeric"[^>]*value="600"/)
    expect(h).toMatch(/>입력<\/button>/)
    expect(h).toContain('<button type="button">입력</button>')
    expect(h).toContain('<span class="mark ">저장</span>')
    expect(h).not.toMatch(/<form/)
  })
  test('닫힌 칸은 칸과 버튼이 모두 막힌다', () => {
    const h = renderToStaticMarkup(createElement(NumberField, { itemId: 'left', io: io({ open: () => false, idOf: (id) => responseInputId(id) }) }))
    expect(h).toContain('id="resp-left"')
    expect(h.match(/disabled=""/g)?.length).toBe(2)
  })
  test('소수 칸은 decimal 자판', () => {
    expect(renderToStaticMarkup(createElement(NumberField, { itemId: 'radius', io: io(), decimal: true }))).toContain('inputMode="decimal"')
  })
  test('판정: 받은 라디오 이름을 쓰고, 고른 값에 표시가 된다', () => {
    const h = renderToStaticMarkup(createElement(VerdictField, { io: io(), radioName: 'rec-verdict' }))
    expect(h.match(/name="rec-verdict"/g)?.length).toBe(2)
    expect(h).toContain('id="rec-vehicleCondition"')
    expect(h).toMatch(/checked=""[^>]*\/> 불량/)
    expect(h).toContain('role="radiogroup" aria-label="판정"')
    expect(h).not.toMatch(/checked=""[^>]*\/> 양호/)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recordFields.test.ts`
Expected: FAIL — `Failed to resolve import "../src/screens/RecordFields"`

- [ ] **Step 3: 구현**

`src/app/focusResponse.ts`에서 바꿀 곳:

```ts
export const responseInputId = (itemId: string) => `resp-${itemId}`
```

바꾼 글:

```ts
export const responseInputId = (itemId: string, prefix = 'resp-') => `${prefix}${itemId}`
/** 기록 창 칸 id(설계 2026-11-10 §9). 작업 목록 칸과 같은 화면에 함께 붙어 있어도 겹치지 않게 */
export const recordInputId = (itemId: string) => responseInputId(itemId, 'rec-')
```

`src/screens/RecordFields.tsx`:

```tsx
// 기록 칸 한 줄(설계 2026-11-10 §9): 작업 목록(서랍·기본 화면)과 기록 창이 같은 칸 모양·제출 함수를 쓴다.
// 값·제출·표시·열림은 io로 받는다(TaskScreen 한 곳이 가진 상태). id 앞머리와 판정 라디오 이름을 나눠
// 서랍과 창이 함께 붙어 있어도 겹치지 않게 한다. 제출은 '입력' 버튼으로만 한다(form이 없어 Enter로 제출되지 않는다).
import { ITEM_LABEL } from '../app/resultLabels'

export interface FieldIo {
  /** 칸에 보일 글자 */
  value: (itemId: string) => string
  /** 칸 글자 바꾸기 */
  change: (itemId: string, v: string) => void
  /** 제출(입력 버튼) */
  submit: (itemId: string) => void
  /** 칸 옆 표시 글자·클래스 */
  mark: (itemId: string) => { text: string; cls: string }
  /** 칸이 열렸는가(선행 단계·최대값 고정) */
  open: (itemId: string) => boolean
  /** 칸 id(서랍 resp-·창 rec-) */
  idOf: (itemId: string) => string
}

export function NumberField({ itemId, io, decimal = false }: { itemId: string; io: FieldIo; decimal?: boolean }) {
  const label = ITEM_LABEL[itemId] ?? itemId
  const open = io.open(itemId)
  const m = io.mark(itemId)
  return (
    <div className="field">
      <label htmlFor={io.idOf(itemId)}>{label}</label>
      <input id={io.idOf(itemId)} inputMode={decimal ? 'decimal' : 'numeric'} value={io.value(itemId)} onChange={(e) => io.change(itemId, e.target.value)} disabled={!open} aria-label={label} />
      <button type="button" onClick={() => io.submit(itemId)} disabled={!open}>입력</button>
      <span className={`mark ${m.cls}`}>{m.text}</span>
    </div>
  )
}

export function VerdictField({ io, radioName }: { io: FieldIo; radioName: string }) {
  const id = 'vehicleCondition'
  const open = io.open(id)
  const m = io.mark(id)
  return (
    <div className="field">
      <span className="flabel">{ITEM_LABEL[id]}</span>
      <span role="radiogroup" aria-label={ITEM_LABEL[id]}>
        <label className="radio"><input id={io.idOf(id)} type="radio" name={radioName} disabled={!open} checked={io.value(id) === 'pass'} onChange={() => io.change(id, 'pass')} /> 양호</label>
        <label className="radio"><input type="radio" name={radioName} disabled={!open} checked={io.value(id) === 'fail'} onChange={() => io.change(id, 'fail')} /> 불량</label>
      </span>
      <button type="button" onClick={() => io.submit(id)} disabled={!open}>입력</button>
      <span className={`mark ${m.cls}`}>{m.text}</span>
    </div>
  )
}
```

`src/styles.css` 맨 끝에 더한다.

```css
.field .flabel { font-weight:600; }
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/recordFields.test.ts tests/feedbackVisible.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/app/focusResponse.ts src/screens/RecordFields.tsx src/styles.css tests/recordFields.test.ts
git commit -m "feat(기록 창): 서랍과 창이 함께 쓰는 기록 칸, 창 칸 id(rec-)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 안내 상자의 고치기 버튼

**Files:**
- Modify: `src/screens/TaskScreen.tsx:21-22`(Shown 형)
- Modify: `src/screens/FeedbackBox.tsx`(전체)
- Modify: `src/styles.css`(맨 끝에 더하기)
- Test: `tests/feedbackVisible.test.ts`(더하기)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/feedbackVisible.test.ts`의 `describe('안내 상자', …)` 안 맨 끝에 더한다.

```ts
  test('다시 확인할 항목 안내에는 항목마다 고치기 버튼이 있다(처리 함수가 있을 때만)', () => {
    const shown = { kind: 'explanatory' as const, title: '최초 응답이 모두 저장되었습니다', text: null, plain: '다시 확인할 항목: 좌측 바퀴 조향각.', fixItems: ['leftAngle', 'radius'] }
    const h = renderToStaticMarkup(createElement(FeedbackBox, { className: 'x', shown, onFix: () => {} }))
    expect(h).toContain('>고치기: 좌측 바퀴 조향각</button>')
    expect(h).toContain('>고치기: 최소회전반경(m)</button>')
    expect(renderToStaticMarkup(createElement(FeedbackBox, { className: 'x', shown }))).not.toContain('고치기')
  })
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/feedbackVisible.test.ts`
Expected: FAIL — 새 시험에서 `고치기` 버튼을 찾지 못함(형 검사 없이 시험은 돈다)

- [ ] **Step 3: 구현**

`src/screens/TaskScreen.tsx`에서 바꿀 곳:

```ts
/** focusItem: 이 안내가 가리키는 기록 칸(값이 필요한 단계). 있으면 그 칸으로 가는 버튼을 보인다 */
export type Shown = { kind: 'safety' | 'explanatory' | 'hint' | 'guidance'; title: string; text: FeedbackText | null; plain?: string; focusItem?: string }
```

바꾼 글:

```ts
/** focusItem: 이 안내가 가리키는 기록 칸(값이 필요한 단계). 있으면 그 칸으로 가는 버튼을 보인다.
 *  fixItems: 다시 확인할 칸들(설계 2026-11-10 §6). 칸마다 고치기 버튼을 보인다 */
export type Shown = { kind: 'safety' | 'explanatory' | 'hint' | 'guidance'; title: string; text: FeedbackText | null; plain?: string; focusItem?: string; fixItems?: string[] }
```

`src/screens/FeedbackBox.tsx` 전체를 아래로 바꾼다.

```tsx
// 안내 상자(2026-11-10): 게임 알림·작업 목록·기록 창 안 안내가 같은 모양을 쓴다.
// "값을 먼저 입력하세요"처럼 칸이 정해진 안내에는 그 칸으로 가는 버튼을, "다시 확인할 항목"에는 항목마다 고치기 버튼을 붙인다(설계 2026-11-10 §6).
import { ITEM_LABEL } from '../app/resultLabels'
import type { Shown } from './TaskScreen'

export function FeedbackBox({ shown, className, onClose, onFocusItem, onFix }: {
  shown: Shown
  className: string
  onClose?: () => void
  onFocusItem?: (itemId: string) => void
  onFix?: (itemId: string) => void
}) {
  return (
    <div className={className} role="alert">
      {onClose && <button className="fb-x" aria-label="안내 닫기" onClick={onClose}>✕</button>}
      <b>{shown.title}</b>
      {shown.text ? (<ul><li>무엇: {shown.text.what}</li><li>왜: {shown.text.why}</li><li>어떻게: {shown.text.how}</li></ul>) : <p>{shown.plain}</p>}
      {shown.focusItem && onFocusItem && <button className="primary fb-go" onClick={() => onFocusItem(shown.focusItem!)}>입력칸으로</button>}
      {onFix && shown.fixItems && shown.fixItems.length > 0 && (
        <p className="fb-fix">{shown.fixItems.map((id) => <button key={id} onClick={() => onFix(id)}>고치기: {ITEM_LABEL[id] ?? id}</button>)}</p>
      )}
    </div>
  )
}
```

`src/styles.css` 맨 끝에 더한다.

```css
.fb-fix { display:flex; flex-wrap:wrap; gap:6px; margin:6px 0 0; }
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/feedbackVisible.test.ts && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: PASS, 형 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/screens/TaskScreen.tsx src/screens/FeedbackBox.tsx src/styles.css tests/feedbackVisible.test.ts
git commit -m "feat(기록 창): 안내 상자에 칸마다 고치기 버튼" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 작업 목록 칸 — 값 복원·공용 칸·기록 단계 이름·제동력 좌우 막기

**Files:**
- Modify: `src/screens/TaskScreen.tsx`(아래 여러 곳)
- Modify: `tests/feedbackVisible.test.ts`('모든 기록 칸에 이동용 번호가 있다')
- Test: `tests/recordDrawer.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/recordDrawer.test.ts`

```ts
// 작업 목록 칸(설계 2026-11-10 §2·§3·§7): 제출한 값 복원, 기록 단계 버튼 이름, 제동력 좌·우는 최대값 고정 뒤
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { answer, brakeToEnter, brakeToPress, renderPanel } from './helpers/recordRuns'

describe('작업 목록 칸', () => {
  test('제출한 값과 표시가 패널을 다시 그려도 칸에 남는다(화면 전환·이어서 하기)', () => {
    const h = renderPanel(answer(brakeToEnter(), 'axleWeight', '600'))
    expect(h).toMatch(/id="resp-axleWeight"[^>]*value="600"/)
    expect(h).toContain('<span class="mark ok">✓</span>')
  })
  test('안내 없음은 최초 답이 다 모이기 전까지 저장만 보인다', () => {
    const h = renderPanel(answer(brakeToEnter('unguided'), 'axleWeight', '610'))
    expect(h).toMatch(/id="resp-axleWeight"[^>]*value="610"/)
    expect(h).toContain('<span class="mark ">저장</span>')
    expect(h).not.toMatch(/[✓✗]/)
  })
  test('기록 단계 버튼은 할 일 이름으로 보인다', () => {
    const h = renderPanel(brakeToEnter())
    for (const label of ['축중 기록', '좌·우 제동력 기록', '계산·판정 기록', '수행']) expect(h).toContain(`>${label}</button>`)
  })
  test('제동력 좌·우는 숫자가 다 올라가 최대값이 고정되기 전에는 닫혀 있다', () => {
    const h = renderPanel(brakeToPress())
    expect(h).toMatch(/id="resp-left"[^>]*disabled=""/)
    expect(h).toMatch(/id="resp-right"[^>]*disabled=""/)
    expect(h).toContain('측정 중')
  })
  test('칸이 빈 단계를 끝내려 하면 적어 두고 입력을 누르지 않은 경우를 따로 알린다', () => {
    const task = fs.readFileSync('src/screens/TaskScreen.tsx', 'utf8')
    expect(task).toMatch(/plain: missingText\(ITEM_LABEL\[item\] \?\? item, !!inputs\[item\]\?\.trim\(\)\), focusItem: item/)
  })
})
```

`tests/feedbackVisible.test.ts`에서 바꿀 곳:

```ts
  test('모든 기록 칸에 이동용 번호가 있다', () => {
    expect(task.match(/id=\{responseInputId\(id\)\}/g)?.length).toBe(2)
```

바꾼 글:

```ts
  test('모든 기록 칸에 이동용 번호가 있다', () => {
    // 판독 칸은 공용 칸(RecordFields)이 io.idOf로 번호를 단다(설계 2026-11-10 §9)
    expect(task).toMatch(/idOf: \(id\) => responseInputId\(id\)/)
    expect(task.match(/<NumberField key=\{id\} itemId=\{id\} io=\{listIo\} \/>/g)?.length).toBe(2)
```

(그 아래 `for (const item of ['radius', 'deviation', 'sum'])` 줄과 `vehicleCondition` 줄은 그대로 둔다.)

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recordDrawer.test.ts tests/feedbackVisible.test.ts`
Expected: FAIL — 복원 값이 없음(`value=""`), 버튼 이름이 `수행`뿐, `측정 중` 없음, 소스 검사 불일치

- [ ] **Step 3: 구현** — `src/screens/TaskScreen.tsx`

(1) import: `import { FeedbackBox } from './FeedbackBox'` 줄 아래에 더한다.

```ts
import { itemOpen, markFor, missingText, recordLabel, restoreInputs } from '../app/recordSteps'
import { NumberField, type FieldIo } from './RecordFields'
```

(2) 상태. 바꿀 곳:

```ts
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [graded, setGraded] = useState<Record<string, boolean | null>>({})
```

바꾼 글:

```ts
  // 제출한 값은 수행 기록에서 다시 채운다(화면 전환·이어서 하기, 설계 2026-11-10 §7). 사건은 만들지 않는다
  const [inputs, setInputs] = useState<Record<string, string>>(() => restoreInputs(initialRun))
```

(3) 칸 표시. 바꿀 곳:

```ts
  const mark = (id: string) => (!showMarks ? (graded[id] !== undefined ? '저장' : '') : graded[id] === true ? '✓' : graded[id] === false ? '✗' : '')
  const markClass = (id: string) => (!showMarks ? '' : graded[id] === true ? 'ok' : graded[id] === false ? 'bad' : '')
```

바꾼 글:

```ts
  // 칸 표시는 수행 기록의 최종 답에서 읽는다(설계 §7) — 안내 없음은 최초 답이 다 모이기 전까지 '저장'만
  const mark = (id: string) => markFor(run, id).text
  const markClass = (id: string) => markFor(run, id).cls
```

(4) doStep의 빈 칸 안내. 바꿀 곳:

```ts
      return setShown({ kind: 'guidance', title: '이 단계를 끝내려면 값을 먼저 입력하세요', text: null, plain: `${ITEM_LABEL[item] ?? item} 입력이 필요합니다.`, focusItem: item })
```

바꾼 글:

```ts
      return setShown({ kind: 'guidance', title: '이 단계를 끝내려면 값을 먼저 입력하세요', text: null, plain: missingText(ITEM_LABEL[item] ?? item, !!inputs[item]?.trim()), focusItem: item })
```

(5) submit에서 이 줄을 지운다.

```ts
    setGraded((g) => ({ ...g, [itemId]: res.grading?.correct ?? null }))
```

(6) 계기 값과 작업 목록 칸. 바꿀 곳:

```ts
  const gauge = { axle: done('enter') ? `${m.axleWeight} ${m.unit}` : '---', lr: done('press') ? `L ${shownL}   R ${shownR}  (${m.unit})` : done('motor') ? '측정 대기 — 페달을 밟으세요' : '---', hold: done('press') && rise >= 1 }
```

바꾼 글:

```ts
  // measuring: 페달 뒤 숫자가 올라가는 동안. 좌·우 칸을 닫아 둔다(설계 §2, Codex 지적 9)
  const gauge = { axle: done('enter') ? `${m.axleWeight} ${m.unit}` : '---', lr: done('press') ? `L ${shownL}   R ${shownR}  (${m.unit})` : done('motor') ? '측정 대기 — 페달을 밟으세요' : '---', hold: done('press') && rise >= 1, measuring: done('press') && rise < 1 }
  /** 작업 목록(서랍·기본 화면) 칸. 기록 창과 같은 값·제출 함수를 쓴다(설계 §9) */
  const listIo: FieldIo = {
    value: (id) => inputs[id] ?? '',
    change: (id, v) => setInputs((cur) => ({ ...cur, [id]: v })),
    submit: (id) => submit(id),
    mark: (id) => markFor(run, id),
    open: (id) => itemOpen(run, id, gauge.hold),
    idOf: (id) => responseInputId(id),
  }
```

(7) 단계 버튼 이름. 바꿀 곳:

```ts
      out.push({ key: 'do', label: far ? '이동 필요' : '수행', onClick: () => doStep(stepId), cls: far ? 'far' : '' })
```

바꾼 글:

```ts
      out.push({ key: 'do', label: far ? '이동 필요' : recordLabel(task, stepId) ?? '수행', onClick: () => doStep(stepId), cls: far ? 'far' : '' })
```

(8) 조향각 칸. 바꿀 곳:

```tsx
          {(['leftAngle', 'rightAngle'] as const).map((id) => (
            <div className="field" key={id}>
              <label>{ITEM_LABEL[id]}</label>
              <input id={responseInputId(id)} inputMode="numeric" value={inputs[id] ?? ''} onChange={(e) => setInputs({ ...inputs, [id]: e.target.value })} disabled={!done('steer')} aria-label={ITEM_LABEL[id]} />
              <button onClick={() => submit(id)} disabled={!done('steer')}>입력</button>
              <span className={`mark ${markClass(id)}`}>{mark(id)}</span>
            </div>
          ))}
```

바꾼 글:

```tsx
          {(['leftAngle', 'rightAngle'] as const).map((id) => <NumberField key={id} itemId={id} io={listIo} />)}
```

(9) 제동력 표시창의 측정 중 표시. 바꿀 곳:

```tsx
            {gauge.hold && <div><span>MAX HOLD</span><b>최대값 고정</b></div>}
```

바꾼 글:

```tsx
            {gauge.hold && <div><span>MAX HOLD</span><b>최대값 고정</b></div>}
            {gauge.measuring && <div><span>MAX HOLD</span><b>측정 중…</b></div>}
```

(10) 제동력 판독 칸. 바꿀 곳:

```tsx
          {(['axleWeight', 'left', 'right'] as const).map((id) => (
            <div className="field" key={id}>
              <label>{ITEM_LABEL[id]}</label>
              <input id={responseInputId(id)} inputMode="numeric" value={inputs[id] ?? ''} onChange={(e) => setInputs({ ...inputs, [id]: e.target.value })} disabled={id === 'axleWeight' ? !done('enter') : !done('press')} aria-label={ITEM_LABEL[id]} />
              <button onClick={() => submit(id)} disabled={id === 'axleWeight' ? !done('enter') : !done('press')}>입력</button>
              <span className={`mark ${markClass(id)}`}>{mark(id)}</span>
            </div>
          ))}
```

바꾼 글:

```tsx
          {(['axleWeight', 'left', 'right'] as const).map((id) => <NumberField key={id} itemId={id} io={listIo} />)}
          {gauge.measuring && <p className="small">좌·우 값은 최대값이 고정되면 적을 수 있습니다.</p>}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/recordDrawer.test.ts tests/feedbackVisible.test.ts && npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS, 형 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/screens/TaskScreen.tsx tests/recordDrawer.test.ts tests/feedbackVisible.test.ts
git commit -m "feat(기록 창): 작업 목록 칸 값 복원·공용 칸·기록 단계 이름·제동력 좌우는 최대값 고정 뒤" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 작업 목록 측정판을 눈금 그림으로, 측정 당시 다시 보기

**Files:**
- Modify: `src/screens/TaskScreen.tsx`
- Test: `tests/recordDial.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/recordDial.test.ts`

```ts
// 작업 목록의 측정판(설계 2026-11-10 §5, 결정 A): 숫자 대신 눈금 그림, 오답을 안 뒤에만 측정 당시 다시 보기
import { describe, expect, test } from 'vitest'
import { answer, renderPanel, turnToReturn, turnToSteer } from './helpers/recordRuns'

const needles = (h: string) => [...h.matchAll(/<line class="needle" x1="[-\d.]+" y1="[-\d.]+" x2="([-\d.]+)"/g)].map((m) => Number(m[1]))

describe('작업 목록의 측정판', () => {
  test('조향 중: 눈금 그림 두 개, 각도 숫자 표시는 없고 바늘은 좌회전이라 오른쪽', () => {
    const h = renderPanel(turnToSteer())
    expect(h.match(/class="tt-dial"/g)?.length).toBe(2)
    expect(h).not.toContain('회전반경 측정판 (숫자식)')
    expect(h).not.toMatch(/<b>-?\d+°<\/b>/)
    expect(needles(h).every((x) => x > 310)).toBe(true)
  })
  test('직진 복귀 뒤에는 바늘이 0°', () => {
    expect(needles(renderPanel(turnToReturn('guided', '35', '30')))).toEqual([310, 310])
  })
  test('측정 당시 다시 보기는 각도 오답이 드러난 뒤에만', () => {
    expect(renderPanel(turnToReturn('guided', '34', '30'))).toContain('측정 당시 눈금 다시 보기')
    const u = turnToReturn('unguided', '34', '30')
    expect(renderPanel(u)).not.toContain('측정 당시 눈금 다시 보기')
    expect(renderPanel(answer(answer(u, 'radius', '5.5'), 'vehicleCondition', 'pass'))).toContain('측정 당시 눈금 다시 보기')
    expect(renderPanel(turnToReturn('guided', '35', '30'))).not.toContain('측정 당시 눈금 다시 보기')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recordDial.test.ts`
Expected: FAIL — `tt-dial` 없음, `(숫자식)` 있음

- [ ] **Step 3: 구현** — `src/screens/TaskScreen.tsx`

(1) import. 바꿀 곳:

```ts
import { itemOpen, markFor, missingText, recordLabel, restoreInputs } from '../app/recordSteps'
```

바꾼 글:

```ts
import { canReviewDial, itemOpen, markFor, missingText, recordLabel, restoreInputs } from '../app/recordSteps'
import { steeredRig, turningRigState } from '../scene/turningRig'
import { dialCaption, ReviewToggle, TurningDialPicture } from './TurningDialPicture'
```

(2) 상태. `  const [action, setAction] = useState('')` 줄 아래에 더한다.

```ts
  /** 측정 당시 눈금 다시 보기를 켰는지(설계 §5). 조건이 사라지면(각도를 고쳐 맞힘) 저절로 꺼진다 */
  const [review, setReview] = useState(false)
```

(3) 바늘. `  const markClass = (id: string) => markFor(run, id).cls` 줄 아래에 더한다.

```ts
  // 측정판 눈금 그림(설계 §5, 결정 A): 바늘은 핸들을 돌린 동안만 기운다. 각도 오답을 안 뒤에만 측정 당시 바늘을 다시 본다
  const canReview = canReviewDial(run)
  const reviewing = review && canReview
  const needles = reviewing ? steeredRig(task) : turningRigState(run)
```

(4) 숫자식 측정판. 바꿀 곳:

```tsx
          <h2>회전반경 측정판 (숫자식)</h2>
          <div className="gauge">
            <div><span>좌측 바퀴</span><b>{done('steer') && !done('return') ? `${m.leftAngleDeg}°` : '0°'}</b></div>
            <div><span>우측 바퀴</span><b>{done('steer') && !done('return') ? `${m.rightAngleDeg}°` : '0°'}</b></div>
          </div>
```

바꾼 글:

```tsx
          <h2>회전반경 측정판</h2>
          <TurningDialPicture side="left" deg={needles.leftDeg} caption={dialCaption('left', reviewing)} />
          <TurningDialPicture side="right" deg={needles.rightDeg} caption={dialCaption('right', reviewing)} />
          {canReview && <ReviewToggle reviewing={reviewing} onToggle={() => setReview(!reviewing)} />}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/recordDial.test.ts && npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS, 형 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/screens/TaskScreen.tsx tests/recordDial.test.ts
git commit -m "feat(기록 창): 작업 목록 측정판을 눈금 그림으로, 각도 오답 뒤 측정 당시 다시 보기" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 작업 목록의 고치기

**Files:**
- Modify: `src/screens/TaskScreen.tsx`
- Test: `tests/recordWiring.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/recordWiring.test.ts`

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recordWiring.test.ts`
Expected: FAIL — `fixItems: wrongIds` 없음

- [ ] **Step 3: 구현** — `src/screens/TaskScreen.tsx`

(1) submit의 다시 확인할 항목 안내. 바꿀 곳:

```ts
    const wrongNow = res.run.responses.items.filter((i) => i.finalCorrect === false).map((i) => ITEM_LABEL[i.itemId] ?? i.itemId)
    if (run.difficultyMode === 'unguided' && !answerFeedbackAllowed(run) && wrongNow.length > 0) {
      // 방금 마지막 최초 응답이 저장됨 → 틀린 항목 이름만 알려 준다(정답은 알려 주지 않음)
      return setShown({ kind: 'explanatory', title: '최초 응답이 모두 저장되었습니다', text: null, plain: `다시 확인할 항목: ${wrongNow.join(', ')}. 해당 칸을 고쳐 다시 입력하면 설명을 보여 줍니다.` })
    }
```

바꾼 글:

```ts
    const wrongIds = res.run.responses.items.filter((i) => i.finalCorrect === false).map((i) => i.itemId)
    if (run.difficultyMode === 'unguided' && !answerFeedbackAllowed(run) && wrongIds.length > 0) {
      // 방금 마지막 최초 응답이 저장됨 → 틀린 항목 이름과 고치기 버튼만 보인다(정답은 알려 주지 않음, 설계 §6)
      return setShown({ kind: 'explanatory', title: '최초 응답이 모두 저장되었습니다', text: null, plain: `다시 확인할 항목: ${wrongIds.map((i) => ITEM_LABEL[i] ?? i).join(', ')}. 해당 칸을 고쳐 다시 입력하면 설명을 보여 줍니다.`, fixItems: wrongIds })
    }
```

(2) 고치기 함수. `inspect` 함수 바로 뒤, 아래 주석 줄의 바로 위에 더한다.

```ts
  // U1 근사(교사 허용 2026-10-27, 장비 수리 후 확인): 페달을 끝까지 밟으면 버튼 없이 최대값이 자동 고정된다고 가정. 새 버튼·성공 사건 없음
```

더할 글:

```ts
  /** 고치기(설계 §6): 그 칸으로 간다 */
  const fixItem = (itemId: string) => { focusResponse(document, itemId) }
```

(3) 패널 안내 상자. 바꿀 곳:

```tsx
      {shown && <FeedbackBox className={`panel-feedback feedback ${shown.kind}`} shown={shown} onClose={() => setShown(null)} onFocusItem={(id) => focusResponse(document, id)} />}
```

바꾼 글:

```tsx
      {shown && <FeedbackBox className={`panel-feedback feedback ${shown.kind}`} shown={shown} onClose={() => setShown(null)} onFocusItem={(id) => focusResponse(document, id)} onFix={fixItem} />}
```

(4) NPC 보완 목록. 바꿀 곳:

```tsx
            <ul>{inspection.issues.map((i, k) => (<li key={k}>{i.kind === 'step' ? `${task.steps.findIndex((s) => s.stepId === i.stepId) + 1}번 단계` : i.kind === 'response' ? ITEM_LABEL[i.itemId] ?? i.itemId : i.conditionId}: {ISSUE_LABEL[i.reasonCode] ?? i.reasonCode}</li>))}</ul>
```

바꾼 글:

```tsx
            <ul>{inspection.issues.map((i, k) => (<li key={k}>{i.kind === 'step' ? `${task.steps.findIndex((s) => s.stepId === i.stepId) + 1}번 단계` : i.kind === 'response' ? ITEM_LABEL[i.itemId] ?? i.itemId : i.conditionId}: {ISSUE_LABEL[i.reasonCode] ?? i.reasonCode}{i.kind === 'response' && itemOpen(run, i.itemId, true) && <> <button className="link" onClick={() => fixItem(i.itemId)}>고치기</button></>}</li>))}</ul>
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/recordWiring.test.ts tests/inspectionVisibility.test.ts && npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS, 형 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/screens/TaskScreen.tsx tests/recordWiring.test.ts
git commit -m "feat(기록 창): 다시 확인할 항목·NPC 보완 목록에 고치기" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 기록 창 안 내용(`RecordSheet.tsx`)

**Files:**
- Create: `src/screens/RecordSheet.tsx`
- Test: `tests/recordSheet.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/recordSheet.test.ts`

```ts
// 기록 창 안 내용(설계 2026-11-10 §4): 단계마다 계기와 그 단계 칸만, 계산 단계는 내가 적은 값
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { recordInputId } from '../src/app/focusResponse'
import { itemOpen, markFor } from '../src/app/recordSteps'
import type { TaskRun } from '../src/domain/taskEngine'
import { STRAIGHT, steeredRig } from '../src/scene/turningRig'
import type { FieldIo } from '../src/screens/RecordFields'
import { RecordSheet, type BrakeGauge } from '../src/screens/RecordSheet'
import { answer, brakeToEnter, brakeToOff, brakeToPress, turn, turnToReturn, turnToSteer } from './helpers/recordRuns'

const io = (run: TaskRun, hold = true): FieldIo => ({ value: () => '', change: () => {}, submit: () => {}, mark: (id) => markFor(run, id), open: (id) => itemOpen(run, id, hold), idOf: recordInputId })
const gauge: BrakeGauge = { axle: '600 kg', lr: 'L 240   R 200  (kg)', hold: true, measuring: false }
type SheetProps = Parameters<typeof RecordSheet>[0]
const sheet = (run: TaskRun, stepId: string, over: Partial<SheetProps> = {}) =>
  renderToStaticMarkup(createElement(RecordSheet, { run, stepId, io: io(run), gauge, needles: STRAIGHT, reviewing: false, canReview: false, onToggleReview: () => {}, note: '', onNote: () => {}, ...over }))
const ids = (h: string) => [...h.matchAll(/id="rec-([A-Za-z]+)"/g)].map((m) => m[1])

describe('기록 창 내용', () => {
  test('축중: 표시창과 축중 칸만', () => {
    const h = sheet(brakeToEnter(), 'axle')
    expect(h).toContain('AXLE Load')
    expect(h).toContain('600 kg')
    expect(ids(h)).toEqual(['axleWeight'])
  })
  test('좌·우 제동력: 숫자가 올라가는 동안은 측정 중이고 칸이 닫힌다', () => {
    const r = brakeToPress()
    const h = sheet(r, 'read', { io: io(r, false), gauge: { ...gauge, hold: false, measuring: true } })
    expect(ids(h)).toEqual(['left', 'right'])
    expect(h).toContain('측정 중')
    expect(h).toMatch(/id="rec-left"[^>]*disabled=""/)
    expect(sheet(r, 'read')).toContain('최대값 고정')
  })
  test('계산·판정: 실제 값이 아니라 내가 적은 값을 보인다', () => {
    const h = sheet(answer(brakeToOff(), 'axleWeight', '610'), 'calc')
    expect(h).toContain('내가 적은 값: 축중 610 · 좌 240 · 우 200 (kg)')
    expect(ids(h)).toEqual(['deviation', 'sum', 'vehicleCondition'])
    expect(h.match(/name="rec-verdict"/g)?.length).toBe(2)
    expect(h).toContain('정비 및 조치할 사항')
  })
  test('조향각: 바퀴마다 눈금 그림과 칸, 다시 보기 버튼은 넘겨받은 조건일 때만', () => {
    const r = turnToSteer()
    const h = sheet(r, 'read', { needles: steeredRig(turn) })
    expect(h.match(/class="tt-dial"/g)?.length).toBe(2)
    expect(ids(h)).toEqual(['leftAngle', 'rightAngle'])
    expect(h).not.toContain('측정 당시 눈금 다시 보기')
    expect(sheet(r, 'read', { canReview: true })).toContain('측정 당시 눈금 다시 보기')
    expect(sheet(r, 'read', { canReview: true, reviewing: true })).toContain('측정 당시(핸들을 끝까지 돌렸을 때)')
  })
  test('반경·판정: 작업지시서·내가 적은 조향각·sin 표', () => {
    const h = sheet(turnToReturn('guided', '34', '30'), 'record')
    expect(h).toContain('작업지시서: 좌회전 · 축거 L 2.7 m · r 0.1 m')
    expect(h).toContain('내가 적은 조향각: 좌 34° · 우 30°')
    expect(h).toContain('sin 30° = 0.5')
    expect(ids(h)).toEqual(['radius', 'vehicleCondition'])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recordSheet.test.ts`
Expected: FAIL — `Failed to resolve import "../src/screens/RecordSheet"`

- [ ] **Step 3: 구현** — `src/screens/RecordSheet.tsx`

```tsx
// 기록 창 안 내용(설계 2026-11-10 §4): 단계마다 계기 그림과 그 단계의 칸만 보인다.
// 표시창 값은 작업 목록의 숫자식 계기와 같다(새로 보여 주는 값 없음). 계산 단계에는 실제 값 대신 학생이 제출한 값
// (내가 적은 값)을 보인다 — 판독 실수를 화면이 몰래 고쳐 주지 않게. 비채점 칸(조치·산출 근거)은 점수·기록이 없다.
import type { TaskRun } from '../domain/taskEngine'
import type { TurningRig } from '../scene/turningRig'
import { NumberField, VerdictField, type FieldIo } from './RecordFields'
import { dialCaption, ReviewToggle, TurningDialPicture } from './TurningDialPicture'

/** 제동력 표시창(TaskScreen의 gauge와 같은 값) */
export interface BrakeGauge { axle: string; lr: string; hold: boolean; measuring: boolean }

const DIR_LABEL = { left: '좌회전', right: '우회전' } as const
/** 창의 판정 라디오 이름(작업 목록의 'verdict'와 따로) */
const RADIO = 'rec-verdict'

export function RecordSheet({ run, stepId, io, gauge, needles, reviewing, canReview, onToggleReview, note, onNote }: {
  run: TaskRun
  stepId: string
  io: FieldIo
  gauge: BrakeGauge
  /** 그림에 그릴 바늘(다시 보기 중이면 측정 당시 각도) */
  needles: TurningRig
  reviewing: boolean
  canReview: boolean
  onToggleReview: () => void
  /** 비채점 칸(정비 및 조치할 사항·산출 근거) */
  note: string
  onNote: (v: string) => void
}) {
  const task = run.task
  const m = task.measurement
  const cond = task.steps.find((s) => s.stepId === stepId)?.completionCondition
  const mine = (id: string) => run.responses.items.find((i) => i.itemId === id)?.finalInput ?? '—'

  if (cond === 'axleWeightRead') return (
    <div className="rec-row led">
      <div className="gauge"><div><span>AXLE Load</span><b>{gauge.axle}</b></div></div>
      <div><NumberField itemId="axleWeight" io={io} /></div>
    </div>
  )
  if (cond === 'readingsSubmitted') return (
    <div className="rec-row led">
      <div className="gauge">
        <div><span>BRAKE L / R</span><b>{gauge.lr}</b></div>
        <div><span>MAX HOLD</span><b>{gauge.hold ? '최대값 고정' : gauge.measuring ? '측정 중…' : '---'}</b></div>
      </div>
      <div>
        <NumberField itemId="left" io={io} />
        <NumberField itemId="right" io={io} />
        {gauge.measuring && <p className="small">최대값이 고정되면 적을 수 있습니다.</p>}
      </div>
    </div>
  )
  if (cond === 'answersSubmitted') return (
    <>
      <p className="rec-mine">내가 적은 값: 축중 {mine('axleWeight')} · 좌 {mine('left')} · 우 {mine('right')} ({m.unit})</p>
      <p className="small">산출식: 편차 = (큰 값 − 작은 값) ÷ 축중 × 100, 합 = (좌 + 우) ÷ 축중 × 100. 소수 첫째 자리까지 적고 둘째 자리는 버립니다.</p>
      <p className="small">기준: 편차 {task.ruleset.deviationMaxPercent}% 이내 · 합 뒤축 {task.ruleset.sumMinRearPercent}% 이상 · 둘 다 기준 안이면 양호</p>
      <NumberField itemId="deviation" io={io} decimal />
      <NumberField itemId="sum" io={io} decimal />
      <VerdictField io={io} radioName={RADIO} />
      <label className="rec-note">정비 및 조치할 사항 <span className="small">(채점·기록 없음)</span>
        <input value={note} onChange={(e) => onNote(e.target.value)} placeholder="양호면 '없음'" />
      </label>
    </>
  )
  if (cond === 'anglesRead') return (
    <>
      {(['left', 'right'] as const).map((side) => (
        <div className="rec-row" key={side}>
          <TurningDialPicture side={side} deg={side === 'left' ? needles.leftDeg : needles.rightDeg} caption={dialCaption(side, reviewing)} />
          <NumberField itemId={side === 'left' ? 'leftAngle' : 'rightAngle'} io={io} />
        </div>
      ))}
      {canReview && <ReviewToggle reviewing={reviewing} onToggle={onToggleReview} />}
    </>
  )
  if (cond === 'radiusSubmitted') return (
    <>
      <p className="rec-mine">작업지시서: {m.turnDirection ? DIR_LABEL[m.turnDirection] : '-'} · 축거 L {m.wheelbaseM} m · r {m.kingpinOffsetM} m<br />내가 적은 조향각: 좌 {mine('leftAngle')}° · 우 {mine('rightAngle')}°</p>
      <p className="small">산출식: R = L ÷ sin α + r (α = 회전할 때 바깥쪽 앞바퀴의 최대 조향각). 소수 첫째 자리까지 적고 둘째 자리는 버립니다.</p>
      {m.sinTable && <p className="small sintable">{Object.entries(m.sinTable).map(([a, v]) => `sin ${a}° = ${v}`).join(' · ')}</p>}
      <p className="small">기준: {task.ruleset.radiusMaxM} m 이하이면 양호</p>
      <NumberField itemId="radius" io={io} decimal />
      <VerdictField io={io} radioName={RADIO} />
      <label className="rec-note">산출 근거 <span className="small">(채점·기록 없음)</span>
        <input value={note} onChange={(e) => onNote(e.target.value)} placeholder="예: L ÷ sin α + r" />
      </label>
    </>
  )
  return null
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/recordSheet.test.ts && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: PASS, 형 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/screens/RecordSheet.tsx tests/recordSheet.test.ts
git commit -m "feat(기록 창): 단계별 창 내용(계기 그림·칸·내가 적은 값)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 기록 창 틀(`RecordWindow.tsx`)

**Files:**
- Create: `src/screens/RecordWindow.tsx`
- Test: `tests/recordWindow.test.ts`(새)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/recordWindow.test.ts`

```ts
// 기록 창 틀(설계 2026-11-10 §3·§8): 대화 상자 역할, 제목에 초점, Tab 돌리기, 닫은 뒤 초점, 창 안 스크롤만
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { focusRecordField, RecordWindow, restoreFocus, wrapTab } from '../src/screens/RecordWindow'

type WinProps = Parameters<typeof RecordWindow>[0]
const html = (over: Partial<WinProps> = {}) => renderToStaticMarkup(createElement(RecordWindow, { title: '축중 기록', onClose: () => {}, footer: createElement('button', null, '단계 완료'), children: createElement('p', null, '내용'), ...over }))

describe('기록 창 틀', () => {
  test('대화 상자 역할·제목·닫기·내용·아래 줄', () => {
    const h = html()
    expect(h).toMatch(/role="dialog" aria-modal="true" aria-labelledby="rec-title"/)
    expect(h).toContain('<h2 id="rec-title" tabindex="-1">축중 기록</h2>')
    expect(h).toContain('<div class="g-recordwrap" tabindex="-1">')
    expect(h).toContain('aria-label="기록 창 닫기"')
    expect(h).toContain('<p>내용</p>')
    expect(h).toContain('<div class="rec-foot"><button>단계 완료</button></div>')
    expect(h).not.toContain('AI 교관에게 질문')
  })
  test('AI 질문은 넘겨받았을 때만 창 머리에', () => {
    expect(html({ onAskAi: () => {} })).toContain('>AI 교관에게 질문</button>')
  })
})

describe('Tab 돌리기', () => {
  const a = {} as HTMLElement, b = {} as HTMLElement, c = {} as HTMLElement
  test('끝에서 앞으로, 처음에서 뒤로 돌고, 사이에서는 브라우저에 맡긴다', () => {
    expect(wrapTab([a, b, c], c, false)).toBe(a)
    expect(wrapTab([a, b, c], a, true)).toBe(c)
    expect(wrapTab([a, b, c], b, false)).toBeNull()
    expect(wrapTab([a, b, c], null, false)).toBe(a)
    expect(wrapTab([], a, false)).toBeNull()
    expect(wrapTab([a, b, c], b, true)).toBeNull()
    expect(wrapTab([a, b, c], null, true)).toBe(c)
  })
})

describe('닫은 뒤 초점', () => {
  const el = (over: { isConnected?: boolean; rects?: number } = {}) => {
    const calls: string[] = []
    const node = { isConnected: over.isConnected ?? true, disabled: false, tagName: 'BUTTON', getClientRects: () => ({ length: over.rects ?? 1 }), focus: () => calls.push('focus') } as unknown as HTMLElement
    return { node, calls }
  }
  const doc = (map: Record<string, HTMLElement>) => ({ querySelector: (s: string) => map[s] ?? null }) as unknown as Pick<Document, 'querySelector'>
  test('연 버튼이 보이면 그것', () => {
    const o = el()
    expect(restoreFocus(o.node, doc({}))).toBe(o.node)
    expect(o.calls).toEqual(['focus'])
  })
  test('연 버튼이 사라졌으면 다시 열린 목록의 닫기, 없으면 행동 버튼, 없으면 작업 목록 버튼', () => {
    const gone = el({ isConnected: false }).node, x = el().node, act = el().node, list = el().node
    expect(restoreFocus(gone, doc({ '.g-drawer.open > .g-x': x, '.g-actions > .g-act': act, '.g-quest-btns > button': list }))).toBe(x)
    expect(restoreFocus(gone, doc({ '.g-actions > .g-act': act, '.g-quest-btns > button': list }))).toBe(act)
    expect(restoreFocus(el({ rects: 0 }).node, doc({ '.g-quest-btns > button': list }))).toBe(list)
    expect(restoreFocus(null, doc({}))).toBeNull()
  })
  test('고른 버튼에 실제로 초점이 간다', () => {
    const gone = el({ isConnected: false }).node, x = el()
    restoreFocus(gone, doc({ '.g-drawer.open > .g-x': x.node }))
    expect(x.calls).toEqual(['focus'])
  })
  test('숨겨진(visibility:hidden) 버튼은 건너뛴다', () => {
    const hidden = el(), list = el()
    vi.stubGlobal('getComputedStyle', (n: unknown) => ({ visibility: n === hidden.node ? 'hidden' : 'visible' }))
    try { expect(restoreFocus(hidden.node, doc({ '.g-quest-btns > button': list.node }))).toBe(list.node) } finally { vi.unstubAllGlobals() }
  })
  test('all=false면 연 버튼·목록 닫기만 본다', () => {
    const gone = el({ isConnected: false }).node, act = el().node, list = el().node
    expect(restoreFocus(gone, doc({ '.g-actions > .g-act': act, '.g-quest-btns > button': list }), false)).toBeNull()
  })
})

describe('창 안 칸으로', () => {
  test('칸의 줄이 창 안에 보이게 scrollTop만 바꾸고 초점을 준다', () => {
    const body = { scrollTop: 100, getBoundingClientRect: () => ({ top: 100, bottom: 400 }) }
    const row = { getBoundingClientRect: () => ({ top: 450, bottom: 520 }), closest: (s: string) => (s === '.rec-body' ? body : null) }
    const calls: string[] = []
    const input = { closest: (s: string) => (s === '.rec-row' ? row : null), focus: (o: unknown) => calls.push(JSON.stringify(o)), scrollIntoView: () => calls.push('scrollIntoView') }
    const d = { getElementById: (id: string) => (id === 'rec-axleWeight' ? input : null) } as unknown as Pick<Document, 'getElementById'>
    expect(focusRecordField(d, 'axleWeight')).toBe(true)
    expect(body.scrollTop).toBe(228)
    expect(calls).toEqual(['{"preventScroll":true}'])
    expect(focusRecordField(d, 'left')).toBe(false)
  })
  test('줄(.rec-row)이 없으면 칸 한 줄(.field), 비채점 칸이면 이름까지(.rec-note)를 보인다', () => {
    for (const hit of ['.field', '.rec-note']) {
      const body = { scrollTop: 0, getBoundingClientRect: () => ({ top: 100, bottom: 400 }) }
      const box = { getBoundingClientRect: () => ({ top: 380, bottom: 430 }), closest: (s: string) => (s === '.rec-body' ? body : null) }
      const input = { closest: (s: string) => (s === hit ? box : null), focus: () => {} }
      const d = { getElementById: () => input } as unknown as Pick<Document, 'getElementById'>
      expect(focusRecordField(d, 'deviation')).toBe(true)
      expect(body.scrollTop).toBe(38)
    }
  })
})

describe('배선', () => {
  test('연 버튼은 처음 한 번만 기억하고, 돌려줄 때 먼저 연 버튼·목록 닫기만 본다', () => {
    const src = fs.readFileSync('src/screens/RecordWindow.tsx', 'utf8')
    expect(src).toContain('if (openerRef.current === undefined)')
    expect(src).toContain('restoreFocus(opener, document, false)')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recordWindow.test.ts`
Expected: FAIL — `Failed to resolve import "../src/screens/RecordWindow"`

- [ ] **Step 3: 구현** — `src/screens/RecordWindow.tsx`

```tsx
// 기록 창 틀(설계 2026-11-10 §3·§8). 어두운 바탕이 게임 화면을 덮고, 창은 보이는 화면(visualViewport) 위쪽에 붙는다.
// 오래된 학교 태블릿 크롬 때문에 HTML 대화 상자 요소·비활성 속성·새 화면 높이 단위를 쓰지 않고 div와 role로 만든다.
// 열 때 초점은 제목에 둔다(칸에 주면 키보드가 바로 올라와 계기를 가린다). 닫으면 연 자리로 초점을 돌려준다.
// 창 안 스크롤은 scrollTop만 바꾼다(바깥 화면까지 밀어 버리는 브라우저 스크롤 함수는 11-09 옆 밀림의 원인이라 쓰지 않음).
// 어두운 바탕을 눌러도 닫지 않는다. ✕와 Esc(초점이 창 안일 때)로만 닫고, 닫기는 제출·완료가 아니다.
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { recordInputId } from '../app/focusResponse'
import { recordWindowBox, scrollDelta } from '../app/recordSteps'

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]'

/** 칸이 든 줄: 계기 그림과 칸을 묶은 줄(.rec-row)을 먼저, 없으면 칸 한 줄(.field), 비채점 칸이면 이름까지(.rec-note) */
const rowOf = (el: Element): Element => el.closest('.rec-row') ?? el.closest('.field') ?? el.closest('.rec-note') ?? el

/** el이 든 창 안 스크롤 영역(.rec-body)을 움직여 el이 다 보이게 한다 */
export function revealInBody(el: Element | null): void {
  const body = el?.closest('.rec-body') as HTMLElement | null | undefined
  if (!el || !body) return
  const d = scrollDelta(body.getBoundingClientRect(), el.getBoundingClientRect())
  if (d !== 0) body.scrollTop += d
}

/** 창 안 칸으로: 그 칸의 줄(계기 그림 포함)을 보이고 초점을 준다(이때는 키보드가 올라온다) */
export function focusRecordField(doc: Pick<Document, 'getElementById'>, itemId: string): boolean {
  const el = doc.getElementById(recordInputId(itemId))
  if (!el) return false
  revealInBody(rowOf(el))
  el.focus({ preventScroll: true })
  return true
}

/** Tab이 창 밖으로 나가지 않게: 처음·끝에서 반대쪽으로 돌린다. 돌릴 필요가 없으면 null(브라우저에 맡김) */
export function wrapTab(items: readonly HTMLElement[], current: Element | null, back: boolean): HTMLElement | null {
  if (items.length === 0) return null
  const at = current ? items.indexOf(current as HTMLElement) : -1
  if (back) return at <= 0 ? items[items.length - 1]! : null
  return at === -1 || at === items.length - 1 ? items[0]! : null
}

/** 닫은 뒤 초점: 연 버튼이 보이면 그것, 아니면 다시 열린 작업 목록의 닫기, (all이면) 행동 버튼, 의뢰 카드의 작업 목록 버튼 순.
 *  all=false면 연 버튼·목록 닫기만 본다(작업 목록이 다시 열리길 기다리는 동안) */
export function restoreFocus(opener: HTMLElement | null, doc: Pick<Document, 'querySelector'>, all = true): HTMLElement | null {
  const usable = (el: HTMLElement | null | undefined): el is HTMLElement => {
    if (!el || !el.isConnected || el.tagName === 'BODY' || (el as HTMLButtonElement).disabled) return false
    if (el.getClientRects().length === 0) return false
    return typeof getComputedStyle !== 'function' || getComputedStyle(el).visibility !== 'hidden'
  }
  const candidates = [opener, doc.querySelector<HTMLElement>('.g-drawer.open > .g-x'), ...(all ? [doc.querySelector<HTMLElement>('.g-actions > .g-act'), doc.querySelector<HTMLElement>('.g-quest-btns > button')] : [])]
  const target = candidates.find(usable) ?? null
  target?.focus({ preventScroll: true })
  return target
}

export function RecordWindow({ title, onClose, onAskAi, footer, children }: {
  title: string
  onClose: () => void
  /** 창 머리의 AI 질문(바깥 질문 버튼 대신, §3.3). 없으면 버튼이 없다(비기록 모드) */
  onAskAi?: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const winRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [box, setBox] = useState(() => recordWindowBox(null, typeof window === 'undefined' ? 800 : window.innerHeight))

  // 닫힐 때 연 자리로 초점을 돌려준다(아래 제목 초점보다 먼저 선언해야 연 버튼을 기억한다).
  // 개발 모드(StrictMode)는 효과를 두 번 돌리므로 처음 기억한 것만 쓴다. 작업 목록이 다시 열리는 데 오래 걸리는 기기를 위해
  // 0.08초 뒤부터 0.5초까지 화면마다 연 버튼·목록 닫기만 다시 보고, 끝까지 없으면 행동 버튼·작업 목록 버튼으로 간다.
  // 그사이 다른 기록 창이 떴거나 누가 초점을 가져갔으면 하지 않는다.
  const openerRef = useRef<HTMLElement | null | undefined>(undefined)
  useEffect(() => {
    if (openerRef.current === undefined) { const a = document.activeElement; openerRef.current = a instanceof HTMLElement ? a : null }
    return () => {
      const opener = openerRef.current ?? null
      const until = Date.now() + 500
      const attempt = () => {
        if (document.querySelector('.g-record')) return
        const a = document.activeElement
        if (a && a !== document.body) return
        if (restoreFocus(opener, document, false)) return
        if (Date.now() >= until) { restoreFocus(opener, document); return }
        requestAnimationFrame(attempt)
      }
      setTimeout(attempt, 80)
    }
  }, [])
  // 열 때와 다른 단계 창으로 바뀔 때: 맨 위부터, 초점은 제목에
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
    titleRef.current?.focus({ preventScroll: true })
  }, [title])
  // 보이는 화면 따라가기: 화면 키보드가 올라오면 창이 줄고, 초점이 있는 칸의 줄을 다시 보인다
  useEffect(() => {
    const vv = window.visualViewport ?? null
    let lastH = -1
    const update = () => {
      setBox(recordWindowBox(vv ? { height: vv.height, offsetTop: vv.offsetTop } : null, window.innerHeight))
      const h = vv ? vv.height : window.innerHeight
      if (h === lastH) return
      lastH = h
      requestAnimationFrame(() => {
        const a = document.activeElement
        if (a && a.tagName === 'INPUT' && bodyRef.current?.contains(a)) revealInBody(rowOf(a))
      })
    }
    update()
    const target: EventTarget = vv ?? window
    target.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    return () => { target.removeEventListener('resize', update); vv?.removeEventListener('scroll', update) }
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !e.nativeEvent.isComposing) { e.stopPropagation(); onClose(); return }
    if (e.key !== 'Tab' || !winRef.current) return
    const to = wrapTab(Array.from(winRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)), document.activeElement, e.shiftKey)
    if (to) { e.preventDefault(); to.focus({ preventScroll: true }) }
  }
  // 칸을 누르면 그 줄(계기 그림 포함)이 창 안에 보이게
  const onFocusIn = (e: FocusEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT') revealInBody(rowOf(t))
  }

  return (
    <div className="g-recordwrap" tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="g-record" ref={winRef} role="dialog" aria-modal="true" aria-labelledby="rec-title" style={{ top: box.top, maxHeight: box.maxHeight }}>
        <div className="rec-head">
          <h2 id="rec-title" ref={titleRef} tabIndex={-1}>{title}</h2>
          {onAskAi && <button className="rec-ai" onClick={onAskAi}>AI 교관에게 질문</button>}
          <button className="rec-x" aria-label="기록 창 닫기" onClick={onClose}>✕</button>
        </div>
        <div className="rec-body" ref={bodyRef} onFocus={onFocusIn}>{children}</div>
        {footer && <div className="rec-foot">{footer}</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/recordWindow.test.ts && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: PASS, 형 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/screens/RecordWindow.tsx tests/recordWindow.test.ts
git commit -m "feat(기록 창): 창 틀 — 제목 초점·Esc·Tab 돌리기·닫은 뒤 초점·보이는 화면 따라가기" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 과제 패널에 기록 창 연결

**Files:**
- Modify: `src/screens/TaskScreen.tsx`
- Test: `tests/recordWiring.test.ts`(더하기)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/recordWiring.test.ts` 맨 끝에 더한다.

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recordWiring.test.ts`
Expected: FAIL — 새 describe의 시험들이 실패(창 연결 코드 없음)

- [ ] **Step 3: 구현** — `src/screens/TaskScreen.tsx`

(1) import. 맨 위에 더한다.

```ts
import { createPortal } from 'react-dom'
```

바꿀 곳:

```ts
import { focusResponse, responseInputId } from '../app/focusResponse'
```

바꾼 글:

```ts
import { focusResponse, recordInputId, responseInputId } from '../app/focusResponse'
```

바꿀 곳:

```ts
import { canReviewDial, itemOpen, markFor, missingText, recordLabel, restoreInputs } from '../app/recordSteps'
```

바꾼 글:

```ts
import { canReviewDial, itemOpen, markFor, missingText, recordLabel, recordStepOf, restoreInputs } from '../app/recordSteps'
import { RecordSheet } from './RecordSheet'
import { focusRecordField, RecordWindow, revealInBody } from './RecordWindow'
```

(2) TaskContext. 바꿀 곳:

```ts
  /** 지금 상태로 초안을 다시 저장(D4) */
  retrySave: () => void
}
```

바꾼 글:

```ts
  /** 지금 상태로 초안을 다시 저장(D4) */
  retrySave: () => void
  /** 기록 창이 열려 있는지(설계 2026-11-10 §3.3) — 게임 화면이 걷기·버튼·알림을 멈춘다 */
  recordOpen: boolean
  /** 그 칸의 기록 창을 연다(게임 알림의 입력칸으로·고치기, §6) */
  openRecordFor: (itemId: string) => void
}
```

(3) props. 바꿀 곳:

```ts
export function TaskScreen({ repo, noRecord = false, session, initialRun, onFinish, embedded = false, proximity = null, onRunChange, onContext, initialSaveStatus = 'saved', onSaveStatus }: {
```

바꾼 글:

```ts
export function TaskScreen({ repo, noRecord = false, session, initialRun, onFinish, embedded = false, proximity = null, onRunChange, onContext, initialSaveStatus = 'saved', onSaveStatus, recordHost = null, onAskAi }: {
```

바꿀 곳:

```ts
  onSaveStatus?: (s: SaveState) => void
}) {
```

바꾼 글:

```ts
  onSaveStatus?: (s: SaveState) => void
  /** 게임 화면이 주는 기록 창 자리(설계 2026-11-10). 없으면(기본 화면·도식) 창 없이 칸으로 안내한다 */
  recordHost?: HTMLElement | null
  /** 기록 창 머리의 AI 질문(비기록 모드는 넘기지 않는다) */
  onAskAi?: () => void
}) {
```

(4) 상태. `  const [review, setReview] = useState(false)` 줄 아래에 더한다.

```ts
  /** 열린 기록 창의 단계(설계 §3). 창을 열고 닫는 것은 기록하지 않는다 */
  const [record, setRecord] = useState<string | null>(null)
```

(5) 창 열기·닫기. `  const doStep = (stepId: string) => {` 줄 바로 위에 더한다.

```ts
  const openRecord = (stepId: string) => { setShown(null); setReview(false); setRecord(stepId) }
  const closeRecord = () => { setShown(null); setReview(false); setRecord(null) }
  /** 그 칸의 기록 창을 연다(고치기·입력칸으로, 설계 §6). 칸이 아직 열리지 않았으면 열지 않는다. 엔진을 거치지 않아 기록이 없다 */
  const openRecordFor = (itemId: string) => {
    const st = recordStepOf(task, itemId)
    if (st && itemOpen(run, itemId, true)) openRecord(st)
  }
```

(6) doStep. 바꿀 곳:

```ts
    if (res.outcome === 'completed') { setRun(res.run); setShown(null); return }
```

바꾼 글:

```ts
    if (res.outcome === 'completed') { setRun(res.run); setShown(null); if (record === stepId) closeRecord(); return }
```

바꿀 곳:

```ts
      const item = res.reasonCode?.replace('NEEDS_RESPONSE_', '') ?? ''
      return setShown({ kind: 'guidance', title: '이 단계를 끝내려면 값을 먼저 입력하세요', text: null, plain: missingText(ITEM_LABEL[item] ?? item, !!inputs[item]?.trim()), focusItem: item })
```

바꾼 글:

```ts
      const item = res.reasonCode?.replace('NEEDS_RESPONSE_', '') ?? ''
      // 게임 화면: 칸이 빈 단계는 기록 창을 연다(엔진은 이 시도를 기록하지 않음, 설계 §3.1). 창 안에서 다시 누르면 빠진 칸을 알린다
      if (recordHost && record !== stepId && res.reasonCode?.startsWith('NEEDS_RESPONSE_')) return openRecord(stepId)
      return setShown({ kind: 'guidance', title: '이 단계를 끝내려면 값을 먼저 입력하세요', text: null, plain: missingText(ITEM_LABEL[item] ?? item, !!inputs[item]?.trim()), focusItem: item })
```

(7) 고치기. 바꿀 곳:

```ts
  const fixItem = (itemId: string) => { focusResponse(document, itemId) }
```

바꾼 글:

```ts
  const fixItem = (itemId: string) => (recordHost ? openRecordFor(itemId) : void focusResponse(document, itemId))
```

(8) 창 칸과 안내 보이기. 바꿀 곳(`listIo` 묶음의 끝):

```ts
    idOf: (id) => responseInputId(id),
  }
```

바꾼 글:

```ts
    idOf: (id) => responseInputId(id),
  }
  /** 기록 창 칸: 작업 목록과 같은 값·제출 함수, id만 rec-(같은 화면에 함께 붙어 있어도 겹치지 않게) */
  const recIo: FieldIo = { ...listIo, idOf: recordInputId }
  // 창 안 안내가 새로 뜨면 창 안에서 보이게 한다(키보드를 닫으면 안내는 칸 아래에 있다, 설계 §3.2)
  useEffect(() => {
    if (record && shown) revealInBody(document.querySelector('.g-record .rec-feedback'))
  }, [record, shown])
```

(9) 게임 화면에 알리기. 바꿀 곳:

```ts
      saveStatus, retrySave,
```

바꾼 글:

```ts
      saveStatus, retrySave,
      recordOpen: record !== null, openRecordFor,
```

바꿀 곳:

```ts
  }, [run, shown, nearKey, onContext, shownL, shownR, gauge.hold, saveStatus])
```

바꾼 글:

```ts
  }, [run, shown, nearKey, onContext, shownL, shownR, gauge.hold, saveStatus, record, recordHost])
```

(10) 창 그리기. 파일 맨 끝의 바꿀 곳:

```tsx
      </section>
    </main>
  )
}
```

바꾼 글:

```tsx
      </section>

      {/* 기록 창(설계 2026-11-10): 게임 화면이 준 자리에 그린다. 칸 값·제출 함수는 작업 목록과 같다 */}
      {recordHost && record && createPortal(
        <RecordWindow title={recordLabel(task, record) ?? '기록'} onClose={closeRecord} onAskAi={onAskAi}
          footer={done(record) ? <button onClick={closeRecord}>닫기</button> : <button className="primary" onClick={() => doStep(record)}>단계 완료</button>}>
          <p className="small rec-sub">{task.steps.find((s) => s.stepId === record)?.instruction}</p>
          <RecordSheet run={run} stepId={record} io={recIo} gauge={gauge} needles={needles} reviewing={reviewing} canReview={canReview} onToggleReview={() => setReview(!reviewing)} note={action} onNote={setAction} />
          {shown && <FeedbackBox className={`rec-feedback feedback ${shown.kind}`} shown={shown} onClose={() => setShown(null)} onFocusItem={(id) => focusRecordField(document, id)} onFix={openRecordFor} />}
        </RecordWindow>,
        recordHost,
      )}
    </main>
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/recordWiring.test.ts && npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS, 형 오류 없음(기존 `renderPanel` 시험은 창 자리를 넘기지 않아 portal을 부르지 않는다)

- [ ] **Step 5: 커밋**

```bash
git add src/screens/TaskScreen.tsx tests/recordWiring.test.ts
git commit -m "feat(기록 창): 칸이 빈 기록 단계는 창으로, 단계 완료·고치기·창 안 안내 연결" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 3D 장면 — 창이 열린 동안 걷기 멈춤(`holdStill`)

**Files:**
- Modify: `src/scene/LabScene.tsx`(props 형, Walker, LabScene)
- Test: `tests/recordWiring.test.ts`(더하기)

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/recordWiring.test.ts` 맨 끝에 더한다.

```ts
describe('3D 장면 걷기 멈춤(§3.3)', () => {
  const scene = read('src/scene/LabScene.tsx')
  test('창이 열리면 가던 길과 이동 요청을 버리고 조이스틱을 무시한다', () => {
    expect(scene).toMatch(/holdStill\?: boolean/)
    expect(scene).toMatch(/if \(holdStill\) \{\n\s+requestRef\.current = null\n\s+if \(pathRef\.current\) \{ pathRef\.current = null; onMove\(posRef\.current, false\) \}/)
    expect(scene).toMatch(/const mag = j && !frozen && !holdStill \? Math\.hypot\(j\.x, j\.y\) : 0/)
    expect(scene).toMatch(/<Walker [^\n]*frozen=\{camBusy\} holdStill=\{holdStill\}/)
  })
  test('학생 모습은 숨기지 않는다(숨김은 대화·확대 때의 frozen만)', () => {
    expect(scene).toMatch(/<group visible=\{!frozen && view !== 'first'\}>/)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recordWiring.test.ts`
Expected: FAIL — `holdStill` 없음

- [ ] **Step 3: 구현** — `src/scene/LabScene.tsx`

(1) props 형. 바꿀 곳:

```ts
  /** 측정판 가까이 보기(좌·우 앞바퀴) */
  turntableCloseUp?: 'left' | 'right' | null
}
```

바꾼 글:

```ts
  /** 측정판 가까이 보기(좌·우 앞바퀴) */
  turntableCloseUp?: 'left' | 'right' | null
  /** 기록 창이 열린 동안 걷기 멈춤(설계 2026-11-10 §3.3): 가던 길·이동 요청·조이스틱을 버린다. 학생은 숨기지 않는다 */
  holdStill?: boolean
}
```

(2) Walker 정의. 바꿀 곳:

```ts
function Walker({ layout, start, onMove, requestRef, lowSpec, joystickRef, frozen, posRef, view, onStep, cue, ppe, look }: { layout: SceneLayout; start: Pt; onMove: (p: Pt, moving: boolean) => void; requestRef: React.MutableRefObject<Pt | null>; lowSpec: boolean; joystickRef?: React.MutableRefObject<MoveInput>; frozen: boolean; posRef: React.MutableRefObject<Pt>;
```

바꾼 글:

```ts
function Walker({ layout, start, onMove, requestRef, lowSpec, joystickRef, frozen, holdStill = false, posRef, view, onStep, cue, ppe, look }: { layout: SceneLayout; start: Pt; onMove: (p: Pt, moving: boolean) => void; requestRef: React.MutableRefObject<Pt | null>; lowSpec: boolean; joystickRef?: React.MutableRefObject<MoveInput>; frozen: boolean; holdStill?: boolean; posRef: React.MutableRefObject<Pt>;
```

(같은 줄의 나머지 `view: ViewMode; …`는 그대로 둔다.)

(3) Walker의 useFrame. 바꿀 곳:

```ts
    // 새 목적지 요청 처리
    if (requestRef.current) {
```

바꾼 글:

```ts
    // 기록 창이 열린 동안(설계 2026-11-10 §3.3): 가던 길과 새 이동 요청을 버리고 조이스틱을 무시한다. 학생은 숨기지 않는다(frozen과 다름)
    if (holdStill) {
      requestRef.current = null
      if (pathRef.current) { pathRef.current = null; onMove(posRef.current, false) }
    }
    // 새 목적지 요청 처리
    if (requestRef.current) {
```

바꿀 곳:

```ts
    const mag = j && !frozen ? Math.hypot(j.x, j.y) : 0
```

바꾼 글:

```ts
    const mag = j && !frozen && !holdStill ? Math.hypot(j.x, j.y) : 0
```

(4) LabScene. 바꿀 곳:

```ts
turning = STRAIGHT, turntableCloseUp = null }: LabSceneProps) {
```

바꾼 글:

```ts
turning = STRAIGHT, turntableCloseUp = null, holdStill = false }: LabSceneProps) {
```

바꿀 곳:

```tsx
frozen={camBusy} posRef={posRef}
```

바꾼 글:

```tsx
frozen={camBusy} holdStill={holdStill} posRef={posRef}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/recordWiring.test.ts && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: PASS, 형 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/scene/LabScene.tsx tests/recordWiring.test.ts
git commit -m "feat(기록 창): 창이 열린 동안 3D 걷기 멈춤(학생은 보임)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: 게임 화면 연결·창 모양·겹침 측정 목록

**Files:**
- Modify: `src/screens/LabScreen.tsx`
- Modify: `src/styles.css`(맨 끝에 더하기)
- Modify: `src/app/hudLayout.ts`(HUD_EXCLUDED)
- Modify: `tests/feedbackVisible.test.ts`(게임 알림·안내 줄 시험 두 개)
- Test: `tests/recordWiring.test.ts`(더하기)

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/recordWiring.test.ts` 맨 끝에 더한다.

```ts
describe('게임 화면 연결(§3.3·§6)', () => {
  const lab = read('src/screens/LabScreen.tsx')
  test('기록 창 자리를 작업 목록 밖에 두고 과제 패널에 넘긴다(AI 질문은 비기록 모드 제외)', () => {
    expect(lab).toMatch(/<div className="g-recordhost" ref=\{setRecordHost\} \/>/)
    expect(lab).toMatch(/recordHost=\{recordHost\} onAskAi=\{noRecord \? undefined : \(\) => setChatOpen\(true\)\}/)
  })
  test('창이 열린 동안 조이스틱·행동 버튼·가운데 버튼·바깥 질문 버튼을 숨기고 3D 장면에 멈춤을 알린다', () => {
    expect(lab).toMatch(/const recording = !!ctx\?\.recordOpen/)
    expect(lab).toMatch(/\{!viewing && !practicing && !recording && <Joystick/)
    expect(lab).toMatch(/\{!ttSide && !recording && <div className="g-actions">/)
    expect(lab).toMatch(/!noRecord && !recording && <button className="g-chatbtn"/)
    expect(lab).toMatch(/holdStill=\{recording\}/)
    expect(lab).toMatch(/joystickRef\.current = \{ x: 0, y: 0 \}/)
    const all = lab.match(/className="g-gaugebtn/g)?.length ?? 0
    expect(all).toBeGreaterThan(0)
    expect(lab.match(/!recording && [^\n]*className="g-gaugebtn/g)?.length).toBe(all)
  })
  test('목록에서 열었으면 창을 닫을 때 목록을 다시 연다', () => {
    expect(lab).toMatch(/if \(drawerOpen\) \{ reopenDrawer\.current = true; setDrawerOpen\(false\) \}/)
    expect(lab).toMatch(/reopenDrawer\.current = false\n\s+setDrawerOpen\(true\)/)
  })
})

describe('창 모양·오래된 크롬(§8)', () => {
  const css = read('src/styles.css')
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '')
  test('층은 게임 부품(4~6) 위, 작업 목록·질문 창(8) 아래', () => {
    expect(css).toMatch(/\.g-recordwrap \{ position:absolute; inset:0; z-index:7;/)
  })
  test('누르기 크기: 닫기 버튼 폭 44px', () => {
    expect(css).toMatch(/\.rec-head \.rec-x \{ width:44px;/)
  })
  test('새 화면 높이 단위·:has()·HTML 대화 상자·비활성 속성·form·브라우저 스크롤 함수를 쓰지 않는다', () => {
    expect(cssCode).not.toMatch(/\d(dvh|svh|lvh)\b/)
    expect(cssCode).not.toContain(':has(')
    for (const f of ['src/screens/RecordWindow.tsx', 'src/screens/RecordSheet.tsx', 'src/screens/RecordFields.tsx']) {
      const c = code(f)
      expect(c, f).not.toMatch(/<dialog|\binert\b|<form|scrollIntoView\(/)
    }
  })
})
```

`tests/feedbackVisible.test.ts`에서 바꿀 곳:

```ts
  test('서랍이 열려 있으면 게임 알림을 띄우지 않고(서랍 뒤에 가려짐), 알림의 칸 이동은 서랍을 연다', () => {
    expect(lab).toMatch(/ctx\?\.shown && !drawerOpen && \(/)
    expect(lab).toMatch(/onFocusItem=\{\(id\) => \{ setDrawerOpen\(true\); setTimeout\(\(\) => focusResponse\(document, id\), 60\) \}\}/)
  })
  test('계기·측정판을 크게 볼 때와 연습 중에는 안내 줄을 숨기고, 장비 이름은 괄호 설명을 빼고 쓴다', () => {
    expect(lab).toMatch(/className="g-hud" hidden=\{practicing \|\| viewing\}/)
```

바꾼 글:

```ts
  test('서랍이나 기록 창이 열려 있으면 게임 알림을 띄우지 않고, 알림의 칸 이동·고치기는 그 칸의 기록 창을 연다', () => {
    expect(lab).toMatch(/ctx\?\.shown && !drawerOpen && !recording && \(/)
    expect(lab).toMatch(/onFocusItem=\{\(id\) => ctx\?\.openRecordFor\(id\)\} onFix=\{\(id\) => ctx\?\.openRecordFor\(id\)\}/)
  })
  test('계기·측정판을 크게 볼 때, 연습 중, 기록 창이 열렸을 때는 안내 줄을 숨기고, 장비 이름은 괄호 설명을 빼고 쓴다', () => {
    expect(lab).toMatch(/className="g-hud" hidden=\{practicing \|\| viewing \|\| recording\}/)
```

(그 아래 `근처:` 줄은 그대로 둔다.)

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recordWiring.test.ts tests/feedbackVisible.test.ts tests/hudLayout.test.ts`
Expected: FAIL — 게임 화면 연결·창 모양 시험이 실패

- [ ] **Step 3: 구현**

**`src/screens/LabScreen.tsx`**

(1) import 줄을 지운다(알림의 칸 이동이 기록 창으로 바뀌어 더 쓰지 않음).

```ts
import { focusResponse } from '../app/focusResponse'
```

(2) 창 자리 상태. 바꿀 곳:

```ts
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
```

바꾼 글:

```ts
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  /** 기록 창 자리(설계 2026-11-10). 과제 패널이 이 자리에 창을 그린다 */
  const [recordHost, setRecordHost] = useState<HTMLDivElement | null>(null)
```

(3) 창이 열린 동안. 바꿀 곳:

```ts
  const viewing = closeUp || ttSide !== null
```

바꾼 글:

```ts
  const viewing = closeUp || ttSide !== null
  /** 기록 창이 열려 있으면 걷기·행동 버튼·알림을 멈춘다(설계 2026-11-10 §3.3) */
  const recording = !!ctx?.recordOpen
  /** 목록에서 연 창이면 닫힐 때 목록을 다시 연다 */
  const reopenDrawer = useRef(false)
  useEffect(() => {
    if (recording) {
      joystickRef.current = { x: 0, y: 0 }
      if (drawerOpen) { reopenDrawer.current = true; setDrawerOpen(false) }
    } else if (reopenDrawer.current) {
      reopenDrawer.current = false
      setDrawerOpen(true)
    }
  }, [recording]) // eslint-disable-line react-hooks/exhaustive-deps -- 창이 열리고 닫힐 때만
```

(4) 3D 장면. 바꿀 곳:

```tsx
moveRequestRef={moveRequestRef} rig={rig} labelMode={labelMode} />
        </div>
```

바꾼 글:

```tsx
moveRequestRef={moveRequestRef} rig={rig} labelMode={labelMode} holdStill={recording} />
        </div>
```

(게임 화면 쪽 `<LabScene …>` 한 곳만 바뀐다. 기본 화면 쪽 `<LabScene …>`은 `</div>`가 아니라 `<div className="quicknav">`가 이어지므로 바뀌지 않는다.)

(5) 게임 알림. 바꿀 곳:

```tsx
            {ctx?.shown && !drawerOpen && (
              <FeedbackBox className={`g-toast feedback ${ctx.shown.kind}`} shown={ctx.shown} onClose={ctx.clearShown}
                onFocusItem={(id) => { setDrawerOpen(true); setTimeout(() => focusResponse(document, id), 60) }} />
            )}
```

바꾼 글:

```tsx
            {ctx?.shown && !drawerOpen && !recording && (
              <FeedbackBox className={`g-toast feedback ${ctx.shown.kind}`} shown={ctx.shown} onClose={ctx.clearShown}
                onFocusItem={(id) => ctx?.openRecordFor(id)} onFix={(id) => ctx?.openRecordFor(id)} />
            )}
```

(6) 안내 줄. 바꿀 곳: `<div className="g-hud" hidden={practicing || viewing}>` → 바꾼 글: `<div className="g-hud" hidden={practicing || viewing || recording}>`

(7) 조이스틱. 바꿀 곳: `{!viewing && !practicing && <Joystick input={joystickRef} />}` → 바꾼 글: `{!viewing && !practicing && !recording && <Joystick input={joystickRef} />}`

(8) 가운데 버튼 다섯 줄. 각 줄의 조건 앞부분만 바꾼다(줄의 나머지는 그대로).

| 바꿀 곳 | 바꾼 글 |
|---|---|
| `{run && !viewing && panelNear && <button className="g-gaugebtn"` | `{run && !viewing && !recording && panelNear && <button className="g-gaugebtn"` |
| `{run && !viewing && !practicing && turningNear && <button className="g-gaugebtn"` | `{run && !viewing && !practicing && !recording && turningNear && <button className="g-gaugebtn"` |
| `{!practicing && !viewing && discNear && <button className="g-gaugebtn"` | `{!practicing && !viewing && !recording && discNear && <button className="g-gaugebtn"` |
| `{!practicing && !viewing && blNear && <button className="g-gaugebtn"` | `{!practicing && !viewing && !recording && blNear && <button className="g-gaugebtn"` |
| `{closeUp && <button className="g-gaugebtn on"` | `{closeUp && !recording && <button className="g-gaugebtn on"` |

(9) 바깥 질문 버튼. 바꿀 곳: `{!practicing && !ttSide && !noRecord && <button className="g-chatbtn"` → 바꾼 글: `{!practicing && !ttSide && !noRecord && !recording && <button className="g-chatbtn"`

(10) 행동 버튼. 바꿀 곳: `{!ttSide && <div className="g-actions">` → 바꾼 글: `{!ttSide && !recording && <div className="g-actions">`

(11) 작업 목록 안 과제 패널과 창 자리. 바꿀 곳:

```tsx
              proximity={{ nearIds, labelOf: (id) => layout.equipment.find((e) => e.id === id)?.label ?? id }}
              onFinish={onGameFinish} />
          </aside>
        )}
```

바꾼 글:

```tsx
              proximity={{ nearIds, labelOf: (id) => layout.equipment.find((e) => e.id === id)?.label ?? id }}
              recordHost={recordHost} onAskAi={noRecord ? undefined : () => setChatOpen(true)}
              onFinish={onGameFinish} />
          </aside>
        )}
        {/* 기록 창 자리(설계 2026-11-10): 작업 목록 밖에 두어 목록을 닫아도 창이 보인다. 층은 z 7(질문 창 아래) */}
        <div className="g-recordhost" ref={setRecordHost} />
```

**`src/app/hudLayout.ts`** — `HUD_EXCLUDED`의 `'.g-more': '대화 말풍선 안의 넘기기 표시',` 줄 아래에 더한다.

```ts
  '.g-recordwrap': '기록 창의 어두운 바탕. 게임 화면 전체를 덮는다',
  '.g-record': '기록 창. 바탕 위에 뜨는 창이라 다른 부품과 겹쳐도 된다(창 안 배치는 브라우저로 확인)',
```

**`src/styles.css`** 맨 끝에 더한다.

```css
/* 기록 창(설계 2026-11-10, docs/superpowers/specs/2026-11-10-record-window-design.md).
   어두운 바탕이 게임 화면을 덮고 창은 보이는 화면 위쪽에 붙는다(top·max-height는 RecordWindow가 visualViewport로 넣는다).
   층: 게임 부품(4~6) 위, 작업 목록·질문 창(8) 아래. 오래된 태블릿 크롬 때문에 새 화면 높이 단위와 :has()를 쓰지 않는다 */
.g-recordwrap { position:absolute; inset:0; z-index:7; background:rgba(10,14,20,.45); }
.g-record { position:absolute; left:50%; transform:translateX(-50%); width:min(600px, calc(100vw - 32px)); display:flex; flex-direction:column; background:#fff; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,.3); overflow:hidden; -webkit-user-select:text; user-select:text; }
.rec-head { display:flex; align-items:center; gap:8px; padding:6px 6px 6px 16px; border-bottom:1px solid var(--line); }
.rec-head h2 { flex:1; margin:0; font-size:18px; outline:none; }
.rec-head .rec-ai { padding:6px 12px; font-size:14px; }
.rec-head .rec-x { width:44px; padding:0; border:none; border-radius:50%; background:rgba(0,0,0,.06); color:#333; font-size:18px; }
.rec-body { flex:1 1 auto; min-height:0; overflow:auto; overscroll-behavior:contain; padding:10px 16px 12px; }
.rec-sub { margin:0 0 8px; }
.rec-foot { display:flex; justify-content:flex-end; gap:8px; padding:8px 16px; border-top:1px solid var(--line); }
.rec-row { margin:0 0 12px; }
.rec-row.led .gauge { margin-bottom:8px; }
@media (min-width: 600px) { .rec-row.led { display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1.3fr); gap:12px; align-items:start; } .rec-row.led .gauge { margin-bottom:0; } }
.rec-mine { background:#f4f6f8; border-radius:8px; padding:8px 10px; margin:0 0 8px; }
.rec-note { margin:10px 0 0; }
.rec-feedback { position:relative; margin:10px 0 0; padding-right:44px; }
.game.wa .g-record { background:var(--wa-paper); border:2px solid var(--wa-line); }
.game.wa .rec-head { background:var(--wa-cream); }
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 모두 PASS(특히 `hudLayout`·`noHasSelector`·`gameLayoutOverlap`·`chatConversation`·`saveRecovery`·`finishGate`), 형 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/screens/LabScreen.tsx src/app/hudLayout.ts src/styles.css tests/recordWiring.test.ts tests/feedbackVisible.test.ts
git commit -m "feat(기록 창): 게임 화면 연결 — 창 자리·걷기 멈춤·목록 다시 열기·알림 연결·창 모양" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: 전체 확인(시험·빌드·브라우저)

**Files:** 고치는 파일 없음(문제를 찾으면 superpowers:systematic-debugging으로 원인부터 찾고, 시험을 먼저 쓴 뒤 고친다)

- [ ] **Step 1: 전체 시험·형 검사·빌드**

```bash
npm test
node_modules/.bin/tsc -p tsconfig.json --noEmit
npm run build
git status --short
```

Expected: 시험 모두 통과(개수를 기록), 형 오류 없음, 빌드 성공. `git status`에는 `?? tsconfig.tsbuildinfo`만 남는다(`src/data/assetVersions.json`이 바뀌었으면 자산이 바뀐 것이 아니므로 원인을 확인하고 커밋하지 않는다).

- [ ] **Step 2: 브라우저 확인 준비** — launch.json 임시 항목(끝나면 되돌린다)

```bash
cp "/Users/jamingchu/claude code/.claude/launch.json" "/Users/jamingchu/claude code/.claude/launch.json.bak-record-window"
python3 -I - <<'PY'
import json
p = '/Users/jamingchu/claude code/.claude/launch.json'
d = json.load(open(p, encoding='utf-8'))
d['configurations'] = [c for c in d['configurations'] if c.get('name') != 'cozy-transmit-check']
d['configurations'].append({'name': 'cozy-transmit-check', 'runtimeExecutable': 'sh', 'runtimeArgs': ['-c', "cd '/Users/jamingchu/claude code/chassis-3d-lab-cozy' && exec npx vite --port 4319 --strictPort --host 127.0.0.1"], 'port': 4319})
json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
PY
```

그다음 `preview_start {name: "cozy-transmit-check"}`로 연다. 시작 화면에서 코드 `A-01`을 넣고 과제·도움 방식을 고른 뒤, 실습장에서 교관에게 가서 과제를 받는다.

**쓰기 요청 막기(페이지를 열거나 새로고침할 때마다 다시 넣는다):** 실제 서버(Supabase)에 기록·대화가 가지 않게 한다.

```js
(() => { const f = window.fetch.bind(window); window.fetch = (u, o = {}) => { const m = String(o.method ?? (u instanceof Request ? u.method : 'GET')).toUpperCase(); return m === 'GET' ? f(u, o) : Promise.reject(new Error('blocked-non-GET')) }; navigator.sendBeacon = () => false; return 'blocked' })()
```

- [ ] **Step 3: 두 과제 × 두 안내 조건**(합성 코드 `A-01`, 기록은 이 브라우저의 기기 저장소에만)
  1. **제동력·안내 있음:** 축중 단계에서 큰 버튼이 "축중 기록"인지 본다. 누르면 창이 열리고, 초점이 제목에 있는지(`document.activeElement.id === 'rec-title'`) 본다. 600 입력 → 창 안에 ✓와 안내 → 단계 완료 → 창이 닫히고 다음 행동이 나오는지 본다. 좌·우 단계에서는 숫자가 올라가는 동안 칸이 막히고 "측정 중"인지 본다. 계산 단계의 "내가 적은 값"이 내가 낸 값인지 보고, NPC 검사 통과까지 간다.
  2. **제동력·안내 없음:** 작업 목록 줄의 "축중 기록"을 누르면 목록이 닫히고 창이 열린다. ✕를 누르면 목록이 다시 열린다. 최초 답이 다 모이기 전에는 "저장"만 보이고 ✓·✗가 없는지 본다.
  3. **최소회전반경·안내 있음:** "조향각 기록" 창에 눈금 그림 두 개가 있고, 바늘이 3D "측정판 보기" 화면과 같은 쪽으로 기우는지 본다(사례 1은 좌회전). 각도 숫자는 어디에도 없어야 한다. 직진 복귀 뒤 "반경·판정 기록" 창에 내가 적은 조향각이 보이는지 본다.
  4. **최소회전반경·안내 없음:** 좌측 조향각을 일부러 34로 적고 반경·판정까지 낸다. "다시 확인할 항목: 좌측 바퀴 조향각"과 고치기 버튼이 나오는지 본다. 고치기를 누르면 조향각 창이 열리고 아래 줄은 "닫기"인지 본다. "측정 당시 눈금 다시 보기"로 바늘이 측정 당시로 바뀌는지, 35로 고치면 버튼이 사라지는지 보고, NPC 검사 통과까지 간다.
  5. **값 복원:** 축중을 적은 뒤 메뉴 → 기본 화면(패널)으로 → 칸에 값이 있는지 본다. 게임 화면으로 돌아오고, 새로고침 → 이어서 하기 뒤에도 값이 있는지 본다.
  6. **걷기 멈춤:** 창을 연 채 W 키를 1초 누르기 전후 화면을 찍어 학생이 움직이지 않는지 본다.
  7. **AI 질문:** 창 머리의 "AI 교관에게 질문"을 누르면 질문 창이 기록 창 위에 열리고, 닫으면 기록 창이 그대로 있는지 본다(쓰기 요청은 막혀 있다).
  8. **기본 화면:** 고치기를 누르면 칸으로 이동하는지, 버튼 이름이 "축중 기록"인지, 측정판 그림이 나오는지 본다.

- [ ] **Step 4: 크기와 화면 키보드 흉내**
  - 폭×높이 375×812, 768×1024, 1024×768, 1280×800에서 창이 화면 안에 있고 아래 줄(단계 완료)이 보이는지 본다.
  - 키보드를 흉내 낸 낮은 높이 1024×420, 375×420에서 칸을 누른 뒤를 본다. 제목·지금 칸·안내·단계 완료가 창 안에 보이거나, 창 안 스크롤로 닿는지 `getBoundingClientRect`로 잰다. 페이지 전체가 옆으로 밀리지 않는지(`document.scrollingElement.scrollLeft === 0`)도 본다.
  - 창을 닫은 상태에서 `window.__hudOverlaps()`를 네 폭에서 잰다. 이전 결과(폰 가로의 장비 설명 카드 13px만)보다 겹침이 늘지 않아야 한다.
  - 크기 바꾸기가 끝나면 `resize_window {preset: "desktop"}`으로 되돌린다.

- [ ] **Step 5: 정리**
  - 새로고침해 쓰기 막기를 없앤 뒤 `preview_stop`.
  - launch.json을 되돌린다.

```bash
cp "/Users/jamingchu/claude code/.claude/launch.json.bak-record-window" "/Users/jamingchu/claude code/.claude/launch.json" && cmp "/Users/jamingchu/claude code/.claude/launch.json.bak-record-window" "/Users/jamingchu/claude code/.claude/launch.json" && rm "/Users/jamingchu/claude code/.claude/launch.json.bak-record-window" && echo restored
```

  - `git status --short`에 `?? tsconfig.tsbuildinfo`만 있는지 본다.

- [ ] **Step 6: MOON에게 보고**(push·합치기 없이)
  - 바뀐 점, 시험 수, 브라우저 확인 결과(두 과제 × 두 조건, 크기별 결과)
  - MOON 확인 부탁: 실제 학교 태블릿에서 화면 키보드, 눈금 읽기 크기, 손가락으로 누르기
  - Hermes 전달: 최소회전반경 조향각은 이제 숫자 대신 눈금 읽기(A)라 이전 판과 나눠 분석해야 한다. 제동력 좌·우는 숫자가 올라가는 중에 적을 수 없다. 창 열기·고치기·다시 보기는 기록하지 않는다. 화면 낭독기로는 조향각을 읽을 수 없다. 피드백 정책 버전은 그대로다.
  - 다음 결정: 합치기·재배포 여부(MOON), 채점 규칙 6.69(가·나·다)

---

## 설계 대응표

| 설계 | 작업 |
|---|---|
| §2 기록 단계·칸·열림, 좌·우 막기 | 1, 3, 7 |
| §3.1 열기(버튼 이름, 칸 빈 시도 → 창, 목록 닫기·다시 열기) | 7, 12, 14 |
| §3.2 창 안(입력만 제출, 창 안 안내, 칸 표시, 단계 완료, 빠진 칸 문구, 닫기) | 3, 5, 6, 11, 12 |
| §3.3 창이 열린 동안(걷기 멈춤, 숨기기, AI 질문 창 머리) | 11, 13, 14 |
| §4 단계별 창 내용 | 10 |
| §5 눈금 그림, 바늘, 숫자 없음, 다시 보기 | 2, 3, 4, 8, 10 |
| §6 고치기 | 6, 9, 12, 14 |
| §7 값 복원 | 3, 7 |
| §8 배치·키보드·초점·Tab·오래된 크롬·층·겹침 목록 | 3, 11, 14, 15 |
| §10 확인 방법 | 각 작업의 시험, 15 |
| §11 자료 영향(Hermes) | 15 Step 6 |
