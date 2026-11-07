# 따뜻한 정비 공방 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시작·캐릭터·실습장·결과 화면을 A안 "따뜻한 정비 공방" 재질로 하나로 잇고, 손님 의뢰가 결과 화면 '정비 일지'에서 도장으로 마무리되며, 조작에 짧은 손맛 반응이 붙게 한다(설계 `docs/superpowers/specs/2026-11-06-cozy-workshop-design.md` §3~§5, 1단계).

**Architecture:** 화면 재질은 CSS 범위 클래스 `.wa` 하나로 덮어씌운다(기존 마크업·기능은 그대로). 문구·반응 규칙·정비 일지 묶음은 순수 함수 모듈(`src/app/requests.ts`, `src/app/reactions.ts`, `src/app/workLog.ts`)로 만들어 Vitest로 시험한다. 3D는 조명·배경 색과 둘레 소품만 바꾸고, 계측부(측정판·계기)는 이미 조명 영향 없는 재질이라 그대로 둔다.

**Tech Stack:** React 18 + TypeScript, react-three-fiber/drei, Vite, Vitest, CSS(전역 `src/styles.css`), Web Audio 합성음(`src/scene/sound.ts`).

**시작 조건:** 11-10 시연이 끝난 뒤 시작한다(11-08 코드 고정). 재배포는 MOON이 "재배포해"라고 한 뒤에만 한다. 2단계(정비 수첩·숨은 것·의뢰판)는 이 계획에 없다 — IRB 확인 뒤 따로 계획한다.

**지키는 규칙(설계 §2 요약):**
- 계측부(측정판·계기·안전 표시·입력 칸·정비 일지의 측정→계산→판정 칸)는 원래 색을 유지한다.
- 판정·채점·기록 형식은 바꾸지 않는다.
- 안내 없음에서 다음 단계 단서를 주지 않는다.
- 시간·힌트·오답으로 보상하지 않는다.
- 연출이 조작을 막지 않는다.
- 움직임 줄이기 설정이면 정지 표시로 바꾼다.

---

## 파일 구조

| 파일 | 할 일 | 새로/수정 |
|---|---|---|
| `src/app/requests.ts` | 과제별 손님 사연(짧은 말투)·교관 한마디 — 문구 단일 원본 | 새로 |
| `src/app/reactions.ts` | 사건(단계 완료·조향 끝·보호구·검사 통과) → 허용 연출 목록. 모드 무관, 움직임 줄이기 반영 | 새로 |
| `src/app/workLog.ts` | 응답 요약 → 정비 일지 세 묶음(측정·계산·판정) 글줄 | 새로 |
| `src/screens/WorkLog.tsx` | 결과 화면 맨 위 '정비 일지' 카드 + '의뢰 완료' 도장 + 종이 조각 | 새로 |
| `src/scene/sound.ts` | `tick()`(딸깍) 합성음 추가 | 수정 |
| `src/scene/Surroundings.tsx` | 둘레 색 따뜻하게 + 생활 흔적 소품(`decorSpots`) | 수정 |
| `src/scene/LabScene.tsx` | 조명·배경·안개 색, 품질 높음 햇살 | 수정 |
| `src/screens/StartScreen.tsx`·`AvatarScreen.tsx`·`ResultScreen.tsx` | `main`에 `wa` 클래스, 게시판 제목 띠 | 수정 |
| `src/screens/LabScreen.tsx` | `main.game`에 `wa`, 퀘스트 제목 "오늘의 의뢰"+사연, 반응 연결 | 수정 |
| `src/styles.css` | `--wa-*` 토큰, `.wa` 범위 덮어쓰기, 연출 애니메이션 | 수정 |
| `tests/requests.test.ts`·`tests/reactions.test.ts`·`tests/workLog.test.ts`·`tests/decor.test.ts` | 단위 시험 | 새로 |
| `scripts/check/flow-check.mjs` | 헤드리스 흐름 확인 스크립트(이미 있음 — 이번 계획에서 추가) | 참고 |

---

### Task 1: 손님 사연·교관 한마디 문구 모듈

**Files:**
- Create: `src/app/requests.ts`
- Test: `tests/requests.test.ts`

- [ ] **Step 1: 실패하는 시험 쓰기**

```ts
// tests/requests.test.ts — 손님 사연 문구(설계 2026-11-06 §10-1)
import { describe, expect, it } from 'vitest'
import { requestCopy } from '../src/app/requests'

describe('requestCopy — 과제별 손님 사연', () => {
  it('최소회전반경·제동력 사연', () => {
    expect(requestCopy('min-turning-radius').complaint).toBe('좁은 길에서 잘 안 돌아요')
    expect(requestCopy('braking-force').complaint).toBe('브레이크를 밟으면 한쪽으로 쏠려요')
  })
  it('모르는 과제는 제동력 문구(서버·패널 작업지시와 같은 기본값)', () => {
    expect(requestCopy('unknown')).toEqual(requestCopy('braking-force'))
  })
  it('판정을 암시하는 낱말이 없다(사연·한마디 모두)', () => {
    for (const id of ['min-turning-radius', 'braking-force']) {
      const c = requestCopy(id)
      for (const t of [c.complaint, c.closing]) expect(t).not.toMatch(/양호|불량|정상|고장|이상 없/)
    }
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/requests.test.ts`
Expected: FAIL — `Failed to load url ../src/app/requests`

- [ ] **Step 3: 구현**

```ts
// src/app/requests.ts
// 손님 의뢰 문구 단일 원본(설계 docs/superpowers/specs/2026-11-06-cozy-workshop-design.md §10-1).
// 짧은 말투, 판정(양호/불량)을 암시하지 않는다. 문구를 바꾸면 MOON 검토. 패널 작업지시(panelWorkOrder)는 따로 둔다.
export interface RequestCopy {
  /** 손님 사연(퀘스트·정비 일지 머리) */
  complaint: string
  /** 검사 통과 뒤 정비 일지의 교관 한마디(고정 — 시간·힌트·오답과 무관) */
  closing: string
}

const COPY: Record<'min-turning-radius' | 'braking-force', RequestCopy> = {
  'min-turning-radius': { complaint: '좁은 길에서 잘 안 돌아요', closing: '앞바퀴 각도를 직접 읽고 판단까지 마쳤구나. 의뢰 끝!' },
  'braking-force': { complaint: '브레이크를 밟으면 한쪽으로 쏠려요', closing: '제동력을 직접 재고 판단까지 마쳤구나. 의뢰 끝!' },
}

export function requestCopy(taskId: string): RequestCopy {
  return taskId === 'min-turning-radius' ? COPY['min-turning-radius'] : COPY['braking-force']
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/requests.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/app/requests.ts tests/requests.test.ts
git commit -m "feat(공방): 손님 사연·교관 한마디 문구 모듈(판정 암시 낱말 금지 시험)"
```

---

### Task 2: 반응 규칙 모듈

**Files:**
- Create: `src/app/reactions.ts`
- Test: `tests/reactions.test.ts`

- [ ] **Step 1: 실패하는 시험 쓰기**

```ts
// tests/reactions.test.ts — 손맛 반응 규칙(설계 §5, §2-3·§2-6)
import { describe, expect, it } from 'vitest'
import { reactionsFor, reactionEventForStep, type ReactionEvent } from '../src/app/reactions'

const EVENTS: ReactionEvent[] = ['stepDone', 'steerLimit', 'ppeOn', 'inspectionPassed']

describe('reactionsFor', () => {
  it('안내 있음·안내 없음에서 똑같다(다음 단계 단서가 끼어들 자리 없음)', () => {
    for (const ev of EVENTS) for (const reducedMotion of [false, true]) for (const sound of [false, true])
      expect(reactionsFor(ev, { mode: 'unguided', reducedMotion, sound })).toEqual(reactionsFor(ev, { mode: 'guided', reducedMotion, sound }))
  })
  it('사건별 연출', () => {
    const o = { mode: 'guided' as const, reducedMotion: false, sound: true }
    expect(reactionsFor('stepDone', o)).toEqual(['checkPop'])
    expect(reactionsFor('steerLimit', o)).toEqual(['tick'])
    expect(reactionsFor('ppeOn', o)).toEqual(['sparkle'])
    expect(reactionsFor('inspectionPassed', o)).toEqual(['stamp', 'confetti'])
  })
  it('소리는 켰을 때만', () => {
    expect(reactionsFor('steerLimit', { mode: 'guided', reducedMotion: false, sound: false })).toEqual([])
  })
  it('움직임 줄이기: 움직이는 연출을 빼고 도장은 정지 표시로 남긴다', () => {
    const o = { mode: 'guided' as const, reducedMotion: true, sound: false }
    expect(reactionsFor('stepDone', o)).toEqual([])
    expect(reactionsFor('ppeOn', o)).toEqual([])
    expect(reactionsFor('inspectionPassed', o)).toEqual(['stamp'])
  })
})

describe('reactionEventForStep — 새로 끝난 단계 → 사건', () => {
  it('보호구·핸들 끝·그 밖', () => {
    expect(reactionEventForStep('ppe')).toBe('ppeOn')
    expect(reactionEventForStep('steer')).toBe('steerLimit')
    expect(reactionEventForStep('turntable')).toBe('stepDone')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/reactions.test.ts`
Expected: FAIL — `Failed to load url ../src/app/reactions`

- [ ] **Step 3: 구현**

```ts
// src/app/reactions.ts
// 손맛 반응 규칙(설계 2026-11-06 §5). 이미 일어난 일에 대한 반응만 다룬다 — 다음 단계를 가리키는 연출은 없다.
// 그래서 안내 있음·안내 없음에서 결과가 같다(§2-3). 움직임 줄이기면 움직이는 연출을 뺀다(§2-6).
import type { DifficultyMode } from '../domain/taskEngine'

export type ReactionEvent = 'stepDone' | 'steerLimit' | 'ppeOn' | 'inspectionPassed'
export type Effect = 'checkPop' | 'tick' | 'sparkle' | 'stamp' | 'confetti'

export function reactionsFor(ev: ReactionEvent, o: { mode: DifficultyMode; reducedMotion: boolean; sound: boolean }): Effect[] {
  void o.mode // 모드는 일부러 쓰지 않는다(시험이 같음을 확인)
  switch (ev) {
    case 'stepDone': return o.reducedMotion ? [] : ['checkPop']
    case 'steerLimit': return o.sound ? ['tick'] : [] // 핸들이 조작 한계에 닿은 소리 — 정답 각도 신호 아님
    case 'ppeOn': return o.reducedMotion ? [] : ['sparkle']
    case 'inspectionPassed': return o.reducedMotion ? ['stamp'] : ['stamp', 'confetti']
  }
}

/** 새로 끝난 단계 하나 → 사건(LabScreen의 newCue 결과에 붙인다) */
export function reactionEventForStep(stepId: string): ReactionEvent {
  if (stepId === 'ppe') return 'ppeOn'
  if (stepId === 'steer') return 'steerLimit'
  return 'stepDone'
}

/** 브라우저의 움직임 줄이기 설정 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/reactions.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/app/reactions.ts tests/reactions.test.ts
git commit -m "feat(공방): 손맛 반응 규칙 — 모드 무관·움직임 줄이기 반영"
```

---

### Task 3: 정비 일지 묶음 모듈

**Files:**
- Create: `src/app/workLog.ts`
- Test: `tests/workLog.test.ts`

- [ ] **Step 1: 실패하는 시험 쓰기**

```ts
// tests/workLog.test.ts — 정비 일지(설계 §4 결과 화면)
import { describe, expect, it } from 'vitest'
import { listTasks } from '../src/app/session'
import { createTaskRun, submitResponse } from '../src/domain/taskEngine'
import { summarizeResponses } from '../src/domain/grading'
import { workLogGroups } from '../src/app/workLog'

const turning = listTasks().find((t) => t.taskId === 'min-turning-radius' && t.measurement.caseId === 'case-left-35-30-2.7')!

describe('workLogGroups', () => {
  it('최소회전반경 사례 1 — 측정·계산·판정 세 묶음, 최종 답과 한글 이름', () => {
    let run = createTaskRun(turning, { difficultyMode: 'guided' })
    for (const [id, v] of [['leftAngle', '35'], ['rightAngle', '30'], ['radius', '5.5'], ['vehicleCondition', 'pass']] as const)
      run = submitResponse(run, id, v, `a-${id}`).run
    const g = workLogGroups(summarizeResponses(run.responses))
    expect(g.map((x) => x.title)).toEqual(['측정', '계산', '판정'])
    expect(g[0]!.lines).toEqual(['좌측 바퀴 조향각 35°', '우측 바퀴 조향각 30°'])
    expect(g[1]!.lines).toEqual(['최소회전반경(m) 5.5'])
    expect(g[2]!.lines).toEqual(['판정 양호'])
  })
  it('아직 안 쓴 칸은 —', () => {
    const g = workLogGroups(summarizeResponses(createTaskRun(turning, { difficultyMode: 'guided' }).responses))
    expect(g[0]!.lines[0]).toBe('좌측 바퀴 조향각 —')
    expect(g[2]!.lines[0]).toBe('판정 —')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/workLog.test.ts`
Expected: FAIL — `Failed to load url ../src/app/workLog`. (판정 입력값은 'pass'/'fail' — `tests/feedbackPolicy.test.ts:22`와 같다.)

- [ ] **Step 3: 구현**

```ts
// src/app/workLog.ts
// 결과 화면 '정비 일지' 세 묶음(측정 → 계산 → 판정). 최종 답만 보인다(최초·최종 비교는 아래 기존 표).
// 계측부라 화면에서 원래 색을 쓴다(설계 §2-1). 기록 형식은 건드리지 않는다.
import type { ResponseSummary } from '../domain/grading'
import { itemLabel, verdictLabel } from './resultLabels'

export interface WorkLogGroup { title: '측정' | '계산' | '판정'; lines: string[] }

export function workLogGroups(sum: ResponseSummary): WorkLogGroup[] {
  const unitOf = (u: string | null | undefined) => (u === '°' ? '°' : u ? ` ${u}` : '')
  return [
    { title: '측정', lines: sum.measurementInputs.map((i) => `${itemLabel(i.itemId)} ${i.finalInput ?? '—'}${i.finalInput ? unitOf(i.unit) : ''}`) },
    { title: '계산', lines: sum.calculationAnswers.map((i) => `${itemLabel(i.itemId)} ${i.finalInput ?? '—'}`) },
    { title: '판정', lines: sum.judgmentAnswers.map((i) => `${itemLabel(i.itemId)} ${i.finalAnswer ? verdictLabel(i.finalAnswer) : '—'}`) },
  ]
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/workLog.test.ts`
Expected: PASS (2 tests). (`ResponseSummary`는 `src/domain/grading.ts:163`에서 이미 export됨.)

- [ ] **Step 5: 커밋**

```bash
git add src/app/workLog.ts tests/workLog.test.ts
git commit -m "feat(공방): 정비 일지 묶음(측정·계산·판정 최종 답, 한글 이름)"
```

---

### Task 4: 디자인 토큰과 `.wa` 공통 재질(CSS)

**Files:**
- Modify: `src/styles.css` (파일 끝에 덧붙임)

- [ ] **Step 1: 토큰과 범위 재질 덧붙이기**

`src/styles.css` 끝에 그대로 덧붙인다:

```css
/* ── 따뜻한 정비 공방(A안, 설계 2026-11-06) — main 에 .wa 를 붙인 화면만 바뀐다 ── */
/* 공통 규칙은 :where(.wa) 로 우선순위를 낮춰, 기존 부품 규칙(.g-*, .av-swatch 등)이 그대로 이기게 한다 */
:root { --wa-cream:#fff6e5; --wa-paper:#fffaf0; --wa-line:#c98b4f; --wa-brown:#8b5e34; --wa-ink:#5b3a1e; --wa-orange:#f28c28; --wa-orange-d:#b45f12; --wa-navy:#26364a; --wa-stamp:#d2463a; }
:root:has(main.wa.screen) body { background-color:#ffcf96; }
:root:has(main.wa.screen) body::before { content:""; position:fixed; inset:0; z-index:-1; background:linear-gradient(180deg,#ffe0b2 0%,#ffcf96 55%,#f6b27a 100%); }
.wa.screen { color:var(--wa-ink); }
.wa.screen h1 { display:inline-block; background:var(--wa-brown); color:#fff; padding:6px 18px; border-radius:12px 12px 4px 4px; box-shadow:0 3px 0 #5e3c1d; }
:where(.wa) .card { background:var(--wa-cream); border:2px solid var(--wa-line); border-radius:16px; box-shadow:0 3px 0 var(--wa-line); }
:where(.wa) button { border:2px solid var(--wa-line); background:var(--wa-paper); color:var(--wa-ink); border-radius:999px; box-shadow:0 2px 0 var(--wa-line); }
:where(.wa) button:where(:active:not(:disabled)) { translate:0 2px; box-shadow:none; }
:where(.wa) button.primary { background:var(--wa-orange); border-color:var(--wa-orange-d); color:#fff; box-shadow:0 2px 0 var(--wa-orange-d); }
:where(.wa) button.link { border:none; background:none; box-shadow:none; color:var(--wa-brown); }
.wa.screen .small { color:#8a6a4c; }
.wa input:not([type=radio],[type=checkbox],[type=range],[type=color],[type=file]):not(table.sheet input, .field input), .wa select { border:2px solid var(--wa-line); border-radius:10px; background:#fff; }
/* 계측부는 원래 색(설계 §2-1): 답안 표·입력 칸. 계기(.gauge)는 원래 검은 바탕·연두 글자라 건드리지 않는다 */
.wa table.sheet, .wa .field input { color:#17202a; }
.wa table.sheet { background:#fff; }
.wa table.sheet th, .wa table.sheet td { border-color:#d4d4d8; }
/* 숫자 자릿수 고정 */
.wa table.sheet, .wa .wl-step b { font-variant-numeric:tabular-nums; }
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build 2>&1 | grep -E "built in|error"`
Expected: `✓ built in …` (오류 없음). 아직 `.wa`를 붙인 화면이 없으므로 화면 변화는 없다.

- [ ] **Step 3: 커밋**

```bash
git add src/styles.css
git commit -m "style(공방): A안 색 토큰과 .wa 범위 공통 재질(계측부 원래 색 유지)"
```

---

### Task 5: 시작·캐릭터 화면에 재질 적용

**Files:**
- Modify: `src/screens/StartScreen.tsx:71` (`<main className="screen start">`)
- Modify: `src/screens/AvatarScreen.tsx:47` (`<main className="screen avatar">`)
- Modify: `src/styles.css` (캐릭터 미리보기 배경)

- [ ] **Step 1: 클래스 붙이기**

`src/screens/StartScreen.tsx`:
```tsx
    <main className="screen start wa">
```
`src/screens/AvatarScreen.tsx`:
```tsx
    <main className="screen avatar wa">
```
그리고 `AvatarScreen.tsx`의 미리보기 배경색 한 줄을 따뜻하게(실습복 준비 공간):
```tsx
            <color attach="background" args={['#f6e7d2']} />
```

- [ ] **Step 2: 캐릭터 화면 세부 CSS 덧붙이기**

`src/styles.css` 끝에:
```css
.wa.avatar .av-preview { background:#f6e7d2; border:2px solid var(--wa-line); box-shadow:0 3px 0 var(--wa-line); }
.wa.avatar .av-nick { color:var(--wa-ink); }
.wa .av-chip { border:2px solid var(--wa-line); background:var(--wa-paper); color:var(--wa-ink); }
.wa .av-chip[aria-pressed="true"] { background:var(--wa-navy); border-color:var(--wa-navy); color:#fff; }
.wa .av-swatch[aria-pressed="true"] { box-shadow:0 0 0 3px var(--wa-navy); }
```

- [ ] **Step 3: 화면 확인(헤드리스, 서버 기록 없음)**

```bash
npm run build && (cd dist && python3 -m http.server 4312 --bind 127.0.0.1 &) && sleep 1
```
그다음 `scripts/check/flow-check.mjs`(puppeteer-core, 시스템 Chrome, GET 외 요청 막음)를 참고해 `http://127.0.0.1:4312/`의 시작 화면과 캐릭터 화면(「기록 없이 하기」)을 찍는다. puppeteer-core는 저장소 의존성이 아니므로 임시 폴더에 설치해 실행한다(`scripts/demo-video/README.md`와 같은 방식).
Expected:
- 노을 배경 위 크림 패널이 보인다.
- 제목 띠가 갈색이고, 주 버튼(과제 수령하러 가기·이대로 시작)이 주황이다.
- 페이지 오류가 0이다.

- [ ] **Step 4: 시험 전체·커밋**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests "` → 모두 통과
```bash
git add src/screens/StartScreen.tsx src/screens/AvatarScreen.tsx src/styles.css
git commit -m "style(공방): 시작·캐릭터 화면을 공방 재질로"
```

---

### Task 6: 결과 화면 '정비 일지'와 '의뢰 완료' 도장

**Files:**
- Create: `src/screens/WorkLog.tsx`
- Modify: `src/screens/ResultScreen.tsx` (main 클래스, h1 바로 아래에 WorkLog)
- Modify: `src/styles.css`

- [ ] **Step 1: 컴포넌트 만들기**

```tsx
// src/screens/WorkLog.tsx
// 결과 화면 맨 위 '정비 일지'(설계 2026-11-06 §4): 손님 사연 → 측정·계산·판정(원래 색) → 의뢰 완료 도장(검사 통과일 때만).
// 아래의 기존 요약·최초/최종 표·상세 기록은 그대로 둔다.
import { useMemo } from 'react'
import type { TaskRun } from '../domain/taskEngine'
import { summarizeResponses } from '../domain/grading'
import { requestCopy } from '../app/requests'
import { workLogGroups } from '../app/workLog'
import { prefersReducedMotion, reactionsFor } from '../app/reactions'

export function WorkLog({ run, passed, nickname }: { run: TaskRun; passed: boolean; nickname?: string }) {
  const copy = requestCopy(run.task.taskId)
  const groups = workLogGroups(summarizeResponses(run.responses))
  const fx = useMemo(() => (passed ? reactionsFor('inspectionPassed', { mode: run.difficultyMode, reducedMotion: prefersReducedMotion(), sound: false }) : []), [passed, run.difficultyMode])
  return (
    <section className="card worklog" aria-label="정비 일지">
      <div className="wl-head"><span className="wl-tag">정비 일지</span><b>“{copy.complaint}”{nickname ? ` — ${nickname}` : ''}</b></div>
      <div className="wl-flow">
        {groups.map((g, i) => (
          <div key={g.title} className="wl-cell">
            <div className="wl-step"><small>{g.title}</small>{g.lines.map((l) => <b key={l}>{l}</b>)}</div>
            {i < groups.length - 1 && <span className="wl-arrow" aria-hidden>→</span>}
          </div>
        ))}
      </div>
      {fx.includes('stamp') && <span className={`wl-stamp ${fx.includes('confetti') ? 'anim' : ''}`} role="img" aria-label="의뢰 완료 도장">의뢰 완료</span>}
      {fx.includes('confetti') && <div className="wl-confetti" aria-hidden>{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ left: `${8 + k * 11}%`, animationDelay: `${(k % 4) * 0.08}s` }} />)}</div>}
      {passed && <p className="wl-closing">교관: “{copy.closing}”</p>}
    </section>
  )
}
```

- [ ] **Step 2: 결과 화면에 붙이기**

`src/screens/ResultScreen.tsx`:
- `import { WorkLog } from './WorkLog'`를 다른 import 아래에 추가한다.
- `<main className="screen result">`를 `<main className="screen result wa">`로 바꾼다.
- `<h1>…</h1>` 바로 다음 줄에 넣는다:
```tsx
      <WorkLog run={run} passed={completionStatus === 'completed' && payload.ok && payload.value.npcInspectionResult === 'passed'} nickname={nickname} />
```

- [ ] **Step 3: CSS 덧붙이기**

```css
.worklog { position:relative; overflow:hidden; }
.wl-head { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding-right:110px; }
.wl-tag { background:var(--wa-brown); color:#fff; font-size:13px; font-weight:700; padding:2px 10px; border-radius:8px; }
.wl-flow { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
.wl-cell { display:flex; align-items:center; gap:6px; flex:1 1 180px; }
.wl-step { flex:1; background:#fff; border:2px solid #d8dde3; border-radius:10px; padding:8px; text-align:center; color:#17202a; display:flex; flex-direction:column; gap:2px; }
.wl-step small { color:#56616c; }
.wl-step b { font-size:17px; }
.wl-arrow { color:var(--wa-brown); font-weight:800; }
.wl-stamp { position:absolute; top:10px; right:14px; transform:rotate(-10deg); border:3px solid var(--wa-stamp); color:var(--wa-stamp); background:var(--wa-cream); font-weight:800; font-size:16px; padding:2px 10px; border-radius:8px; letter-spacing:1px; }
.wl-stamp.anim { animation:wl-stamp .35s ease-out both; }
@keyframes wl-stamp { from { transform:rotate(-10deg) scale(2.2); opacity:0 } to { transform:rotate(-10deg) scale(1); opacity:1 } }
.wl-confetti { position:absolute; inset:0; pointer-events:none; }
.wl-confetti i { position:absolute; top:-10px; width:8px; height:12px; border-radius:2px; background:var(--wa-orange); animation:wl-fall 1.1s ease-in forwards; }
.wl-confetti i:nth-child(3n) { background:var(--wa-navy); } .wl-confetti i:nth-child(3n+1) { background:#8fbf7a; }
@keyframes wl-fall { to { transform:translateY(160px) rotate(260deg); opacity:0 } }
.wl-closing { margin:10px 0 0; }
@media (prefers-reduced-motion: reduce) { .wl-stamp.anim, .wl-confetti i { animation:none } }
```

- [ ] **Step 4: 화면 확인**

빌드 뒤 헤드리스로 최소회전반경 사례 1을 끝까지 수행한다(`node scripts/check/flow-check.mjs http://127.0.0.1:4312/ out guided` — 결과 화면 사진이 `out/guided_result.png`). 결과 화면을 찍는다.
Expected:
- 맨 위에 정비 일지가 있다: "좁은 길에서 잘 안 돌아요"와 세 칸 '좌측 바퀴 조향각 35° · 우측 바퀴 조향각 30°' / '최소회전반경(m) 5.5' / '판정 양호'.
- '의뢰 완료' 도장과 교관 한마디가 보인다.
- 세 칸 바탕은 흰색이고, 도장이 세 칸을 가리지 않는다.
- '중단하고 끝내기'로 끝내면 도장이 나오지 않는다.
- 아래쪽 기존 표·상세 기록은 그대로다.

- [ ] **Step 5: 시험 전체·커밋**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests "` → 모두 통과
```bash
git add src/screens/WorkLog.tsx src/screens/ResultScreen.tsx src/styles.css
git commit -m "feat(공방): 결과 화면 정비 일지 — 손님 사연·측정→계산→판정·의뢰 완료 도장(검사 통과일 때만)"
```

---

### Task 7: 실습장 HUD 재질과 "오늘의 의뢰"

**Files:**
- Modify: `src/screens/LabScreen.tsx` (게임 화면 `main`, 퀘스트 제목 블록)
- Modify: `src/styles.css`

- [ ] **Step 1: 클래스와 퀘스트 제목 바꾸기**

`src/screens/LabScreen.tsx`:
- 게임 화면 `<main className={\`game ${talking ? 'talking' : ''}\`}>`를 다음으로 바꾼다.
```tsx
      <main className={`game wa ${talking ? 'talking' : ''}`}>
```
- 퀘스트 제목 줄 `<div className="g-quest-title">{run ? task.title : '실습장 둘러보기'}</div>`를 다음으로 바꾼다.
```tsx
              <div className="g-quest-title">{run ? '오늘의 의뢰' : '실습장 둘러보기'}</div>
              {run && <p className="g-req">“{requestCopy(run.task.taskId).complaint}” <span className="g-req-task">{task.title}</span></p>}
```
- import 추가: `import { requestCopy } from '../app/requests'`

- [ ] **Step 2: HUD CSS 덧붙이기**

```css
/* 실습장 HUD — 공방 재질(설계 §4). 3D 이름표·계기는 건드리지 않는다 */
.game.wa .g-badge, .game.wa .g-icon, .game.wa .g-view, .game.wa .g-chatbtn, .game.wa .g-hud, .game.wa .g-act.small { background:var(--wa-cream); color:var(--wa-ink); border:2px solid var(--wa-line); box-shadow:0 2px 0 var(--wa-line); backdrop-filter:none; }
.game.wa .g-badge b.g-norec { color:var(--wa-stamp); }
.game.wa .g-quest { background:var(--wa-cream); color:var(--wa-ink); border:2px solid var(--wa-line); box-shadow:0 3px 0 var(--wa-line); backdrop-filter:none; }
.game.wa .g-quest-title { color:#fff; background:var(--wa-brown); display:inline-block; padding:1px 10px; border-radius:8px; }
.game.wa .g-quest .g-next { color:var(--wa-ink); }
.game.wa .g-quest .g-progress { color:#8a6a4c; }
.game.wa .g-req { font-weight:700; }
.game.wa .g-req-task { display:block; font-weight:400; font-size:12px; color:#8a6a4c; }
.game.wa .g-quest-btns button { background:var(--wa-paper); color:var(--wa-ink); border:2px solid var(--wa-line); }
.game.wa .g-act { background:linear-gradient(180deg,#f7a04a,var(--wa-orange)); border-color:#fff; }
.game.wa .g-act.far { background:linear-gradient(180deg,#c8b8a6,#a8957f); }
.game.wa .g-bubble { background:var(--wa-cream); border:2px solid var(--wa-line); box-shadow:0 4px 0 var(--wa-line); color:var(--wa-ink); }
.game.wa .g-bubble::after { border-top-color:var(--wa-cream); }
.game.wa .g-name { background:var(--wa-brown); }
.game.wa .g-more { color:var(--wa-orange); }
.game.wa .g-choices button { background:var(--wa-paper); border:2px solid var(--wa-line); color:var(--wa-ink); }
.game.wa .g-choices button.primary { background:var(--wa-orange); border-color:var(--wa-orange-d); color:#fff; }
.game.wa .g-menu { background:var(--wa-cream); border:2px solid var(--wa-line); }
.game.wa .g-gaugebtn { background:var(--wa-navy); }
```

- [ ] **Step 3: 화면 확인(품질 높음·낮음)**

헤드리스로 「기록 없이 하기」를 실습장까지 진행해 `?q=high`, `?q=low` 두 번 찍는다. 과제 수령 전·후, 교관 대화창을 찍는다.
Expected:
- 퀘스트 패널이 크림색이다. 과제 수령 뒤 제목 띠는 '오늘의 의뢰'이고 아래에 "좁은 길에서 잘 안 돌아요"가 있다.
- 대화창은 크림 말풍선에 갈색 이름 띠다.
- 측정판 확대 화면(📟 측정판 보기)의 눈금 색이 바뀌기 전 화면과 같다(Task 9의 픽셀 비교로 확인).
- 페이지 오류가 0이다.

- [ ] **Step 4: 시험 전체·커밋**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests "` → 모두 통과
```bash
git add src/screens/LabScreen.tsx src/styles.css
git commit -m "style(공방): 실습장 HUD·대화창 공방 재질, 퀘스트 '오늘의 의뢰'+손님 사연"
```

---

### Task 8: 손맛 연결 — 단계 완료 체크·보호구 반짝임·핸들 끝 딸깍

**Files:**
- Modify: `src/scene/sound.ts` (`tick()` 추가)
- Modify: `src/screens/LabScreen.tsx` (기존 `newCue` 효과 옆에 반응 상태)
- Modify: `src/styles.css`

- [ ] **Step 1: 딸깍 합성음 추가**

`src/scene/sound.ts`의 `step()` 메서드 바로 아래에 추가한다:
```ts
  /** 핸들이 조작 한계에 닿는 '딸깍'(짧은 고음 두 번). 정답 신호가 아니다 */
  tick(): void {
    const ctx = this.ctx
    if (!this.enabled || !ctx) return
    const t = ctx.currentTime
    for (const [dt, f] of [[0, 2400], [0.045, 1800]] as const) {
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t + dt)
      g.gain.exponentialRampToValueAtTime(0.05, t + dt + 0.003)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.035)
      o.connect(g).connect(ctx.destination)
      o.start(t + dt)
      o.stop(t + dt + 0.04)
    }
  }
```

- [ ] **Step 2: LabScreen에 반응 상태 연결**

`src/screens/LabScreen.tsx`:
- import 추가:
```ts
import { prefersReducedMotion, reactionEventForStep, reactionsFor, type Effect } from '../app/reactions'
```
- 기존 `const [avatarCue, setAvatarCue] = useState<AvatarCue | null>(null)` 바로 위에 상태를 둔다.
```ts
  /** 손맛 반응(설계 2026-11-06 §5): 방금 끝난 단계에 대한 연출만. seq가 바뀌면 CSS 애니메이션을 다시 건다 */
  const [fx, setFx] = useState<{ effects: Effect[]; seq: number }>({ effects: [], seq: 0 })
```
- 기존 `newCue` 효과 안에서 `if (!step) return` 바로 다음 줄에 추가한다(몸짓 처리 전에, 몸짓이 없는 단계에도 반응하도록).
```ts
    const effects = reactionsFor(reactionEventForStep(step), { mode: run.difficultyMode, reducedMotion: prefersReducedMotion(), sound: soundOn })
    if (effects.includes('tick')) sound.tick()
    setFx((f) => ({ effects, seq: f.seq + 1 }))
```
  그리고 이 효과의 의존 배열을 `[run, task, layout, sound, soundOn]`으로 바꾼다.
- 상태 배지(`<div className="g-badge">…</div>`) 안 마지막 `{run && <span>안전 위반 …</span>}` 다음에 넣는다.
```tsx
                {ppe && <span key={fx.effects.includes('sparkle') ? fx.seq : 'ppe'} className={`g-ppe ${fx.effects.includes('sparkle') ? 'spark' : ''}`}>보호구 착용</span>}
```
- 퀘스트의 진행 줄 `<p className="g-progress">{ctx.doneCount}/{ctx.total} 단계 완료</p>`를 다음으로 바꾼다.
```tsx
              {run && ctx && <p key={fx.effects.includes('checkPop') ? fx.seq : 'p'} className={`g-progress ${fx.effects.includes('checkPop') ? 'pop' : ''}`}>✓ {ctx.doneCount}/{ctx.total} 단계 완료</p>}
```

- [ ] **Step 3: 연출 CSS 덧붙이기**

```css
.g-ppe { background:#fff; color:var(--wa-navy); border-radius:10px; padding:1px 8px; font-size:12px; font-weight:700; }
.g-ppe.spark { animation:g-spark .6s ease-out; }
@keyframes g-spark { 0% { box-shadow:0 0 0 0 rgba(255,213,74,.9) } 100% { box-shadow:0 0 0 12px rgba(255,213,74,0) } }
.g-progress.pop { animation:g-pop .3s ease-out; }
@keyframes g-pop { 0% { transform:scale(1.25) } 100% { transform:scale(1) } }
@media (prefers-reduced-motion: reduce) { .g-ppe.spark, .g-progress.pop { animation:none } }
```

- [ ] **Step 4: 확인**

Run: `npx tsc --noEmit -p . && npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected: 타입 오류 0, 모두 통과.

헤드리스로 확인한다(「기록 없이 하기」, 안내 있음·안내 없음 두 번).
Expected:
- 보호구 단계 뒤 배지에 '보호구 착용'이 반짝인다.
- 단계마다 진행 줄이 한 번 튀어 오른다.
- 핸들 끝 단계에서 페이지 오류가 없다. 소리는 헤드리스에서 들리지 않으므로 `tick`은 시험 대신 코드로 확인한다.
- 안내 없음에서도 연출이 같고, 다음 장비 강조는 여전히 없다(`.need` 없음).

- [ ] **Step 5: 커밋**

```bash
git add src/scene/sound.ts src/screens/LabScreen.tsx src/styles.css
git commit -m "feat(공방): 손맛 — 단계 완료 체크·보호구 반짝임·핸들 끝 딸깍(모드 무관, 움직임 줄이기 반영)"
```

---

### Task 9: 3D 조명·배경 온기, 둘레 생활 흔적, 품질 높음 햇살

**Files:**
- Modify: `src/scene/LabScene.tsx:873-878` (배경·안개·조명)
- Modify: `src/scene/Surroundings.tsx` (색·소품)
- Test: `tests/decor.test.ts`

- [ ] **Step 1: 소품 자리 시험 쓰기**

```ts
// tests/decor.test.ts — 둘레 생활 흔적은 실습장(걸을 수 있는 곳) 밖, 건물 안에만
import { describe, expect, it } from 'vitest'
import rawLayout from '../src/data/layout/layout.dev-provisional.json'
import { loadSceneLayout } from '../src/scene/layoutModel'
import { decorSpots, hallBounds } from '../src/scene/Surroundings'

const layout = loadSceneLayout(rawLayout)
const zones = [layout.mainZone, ...(layout.absProtrusion ? [layout.absProtrusion] : [])]
const inside = (x: number, z: number, r: { xMin: number; xMax: number; zMin: number; zMax: number }, pad = 0) => x > r.xMin - pad && x < r.xMax + pad && z > r.zMin - pad && z < r.zMax + pad

describe('decorSpots', () => {
  it('세 가지(공구 정리판·부품함·휴식 코너)', () => {
    expect(decorSpots(hallBounds(layout), layout).map((d) => d.kind)).toEqual(['pegboard', 'cabinet', 'rest'])
  })
  it('실습장 구역과 0.5 m 이상 떨어지고 건물 안', () => {
    const b = hallBounds(layout)
    for (const d of decorSpots(b, layout)) {
      for (const zn of zones) expect(inside(d.x, d.z, zn, 0.5)).toBe(false)
      expect(inside(d.x, d.z, b)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/decor.test.ts`
Expected: FAIL — `decorSpots is not a function`(또는 export 없음)

- [ ] **Step 3: Surroundings에 소품과 따뜻한 색**

`src/scene/Surroundings.tsx`:
- `hallBounds` 아래에 추가:
```ts
export interface DecorSpot { kind: 'pegboard' | 'cabinet' | 'rest'; x: number; z: number; rotY: number }

/** 생활 흔적 소품 자리(설계 2026-11-06 §3): 서쪽 너머 건물 벽 쪽 — 이동 격자 밖이라 걸어 들어갈 수 없고 누를 수도 없다 */
export function decorSpots(b: HallBounds, layout: SceneLayout): DecorSpot[] {
  const midZ = (layout.mainZone.zMin + layout.mainZone.zMax) / 2
  return [
    { kind: 'pegboard', x: b.xMin + 0.06, z: midZ - 2, rotY: Math.PI / 2 },
    { kind: 'cabinet', x: b.xMin + 0.45, z: midZ + 1.5, rotY: Math.PI / 2 },
    { kind: 'rest', x: b.xMin + 1.6, z: b.zMax - 1.6, rotY: Math.PI / 4 },
  ]
}

function Decor({ d }: { d: DecorSpot }) {
  if (d.kind === 'pegboard') return (
    <group position={[d.x, 1.5, d.z]} rotation-y={d.rotY}>
      <mesh><boxGeometry args={[2.4, 1.2, 0.04]} /><meshStandardMaterial color="#c9a27a" roughness={0.9} /></mesh>
      {[-0.8, -0.3, 0.2, 0.7].map((x, i) => <mesh key={i} position={[x, (i % 2) * 0.2 - 0.1, 0.05]}><boxGeometry args={[0.08, 0.45, 0.03]} /><meshStandardMaterial color={i % 2 ? '#f28c28' : '#26364a'} /></mesh>)}
    </group>
  )
  if (d.kind === 'cabinet') return (
    <group position={[d.x, 0.55, d.z]} rotation-y={d.rotY}>
      <mesh><boxGeometry args={[1.6, 1.1, 0.5]} /><meshStandardMaterial color="#26364a" roughness={0.7} /></mesh>
      {[0.3, 0, -0.3].map((y) => <mesh key={y} position={[0, y, 0.26]}><boxGeometry args={[1.4, 0.04, 0.02]} /><meshStandardMaterial color="#c98b4f" /></mesh>)}
    </group>
  )
  return (
    <group position={[d.x, 0, d.z]} rotation-y={d.rotY}>
      <mesh position={[0, 0.25, 0]}><boxGeometry args={[1.2, 0.08, 0.45]} /><meshStandardMaterial color="#b07a4a" roughness={0.9} /></mesh>
      {[-0.5, 0.5].map((x) => <mesh key={x} position={[x, 0.12, 0]}><boxGeometry args={[0.06, 0.24, 0.4]} /><meshStandardMaterial color="#8b5e34" /></mesh>)}
      <mesh position={[0.9, 0.3, 0]}><cylinderGeometry args={[0.16, 0.12, 0.3, 12]} /><meshStandardMaterial color="#c98b4f" /></mesh>
      <mesh position={[0.9, 0.62, 0]}><sphereGeometry args={[0.24, 12, 10]} /><meshStandardMaterial color="#6f9a5b" roughness={1} /></mesh>
    </group>
  )
}
```
- `Surroundings` 안 `mats`의 색을 따뜻하게 바꾼다: `floor: '#a39a8f'`, `wall: '#f3ece2'`, `wallLow: '#b8a58f'`, `ceiling: '#e6ded3'`.
- `return (<group>` 바로 안쪽 맨 끝(`</group>` 앞)에 추가:
```tsx
      {decorSpots(b, layout).map((d) => <Decor key={d.kind} d={d} />)}
```

- [ ] **Step 4: 조명·배경·햇살**

`src/scene/LabScene.tsx` 조명 블록을 다음과 같이 바꾼다(그 밖의 줄은 그대로).
```tsx
      <color attach="background" args={['#efe4d6']} />
      <fog attach="fog" args={['#efe4d6', 24, 60]} />
      <Surroundings layout={layout} />
      <hemisphereLight args={['#fff1dc', '#4f6b4c', lowSpec ? 1.1 : 0.7]} />
      <directionalLight color="#ffe9cf" position={[mz.xMax * 0.6, 14, mz.zMax * 0.3]} intensity={lowSpec ? 1.0 : 1.4} castShadow={!lowSpec}
```
차량·바닥 반사를 조금 줄인다(설계 §3): 품질 높음 HDRI 줄 `<Environment files={hdri} environmentIntensity={0.55} />`의 `0.55`를 `0.45`로 바꾼다(낮음의 Lightformer는 그대로).

햇살(품질 높음만)은 `<LayerSetup />` 바로 위에 넣는다. 창 쪽 서쪽 너머에서 비스듬히 드는 반투명 판 두 장이다.
```tsx
      {!lowSpec && [0, 1].map((i) => (
        <mesh key={i} position={[mz.xMin - 1.2, 2.2, (mz.zMin + mz.zMax) / 2 - 3 + i * 4]} rotation={[0, Math.PI / 2, -0.5]}>
          <planeGeometry args={[1.4, 5]} />
          <meshBasicMaterial color="#fff4d6" transparent opacity={0.18} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
```

> 구현 뒤 화면 확인에서 떠 있는 회색 판처럼 보여 제거함(ca30a71).

- [ ] **Step 5: 시험·계측부 색 확인**

Run: `npx vitest run tests/decor.test.ts && npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected: decor 2개 통과, 전체 통과.

계측부 색 비교: 바꾸기 전 판(현재 production 번들)과 바꾼 판에서 똑같이 📟 측정판 보기 화면을 찍는다. 화면 아래 버튼 줄을 뺀 눈금판 영역(가운데 1280×560)을 잘라 비교한다.
```bash
ffmpeg -v error -i before.png -i after.png -lavfi "[0]crop=1280:560:0:80[a];[1]crop=1280:560:0:80[b];[a][b]blend=all_mode=difference,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG" -f null - 2>&1 | grep YAVG
```
Expected: 눈금판 부분의 YAVG 차이가 작다(바탕 바닥 색 변화 정도, 대략 10 이하).
- 눈금판·바늘은 이미 조명 영향 없는 재질(`TurntableDial.tsx` meshBasicMaterial toneMapped=false)이라 색이 같아야 한다.
- 차이가 크면 확대 화면에서 따뜻한 빛이 눈금판에 들어간 것이다. 그 경우 측정판 근처 조명을 원래 값으로 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add src/scene/LabScene.tsx src/scene/Surroundings.tsx tests/decor.test.ts
git commit -m "feat(공방): 3D 조명·배경 온기, 둘레 생활 흔적 소품 3종, 품질 높음 햇살(계측부 색 유지 확인)"
```

---

### Task 10: 마무리 확인·문서

**Files:**
- Modify: `docs/design/docs/20_2026-10-28_면담결정_변경기록.md` (새 결정 줄)
- Modify: `scripts/demo-video/` (필요하면 영상 다시 찍기)

- [ ] **Step 1: 전체 확인**

Run: `npx tsc --noEmit -p . && npx vitest run 2>&1 | grep -E "Test Files|Tests " && npm run build 2>&1 | grep -E "built in|error"`
Expected: 타입 오류 0, 시험 모두 통과, 빌드 성공.

- [ ] **Step 2: 기록 형식이 그대로인지**

헤드리스로 D-01 기록 모드 흐름을 바꾸기 전 판과 바꾼 판에서 한 번씩 수행한다(GET 외 요청 막음, 이 기기 저장만). IndexedDB의 payload 키 목록과 schemaVersion을 비교한다. `tests/record.test.ts` 통과로도 확인한다.
Expected: 키·버전이 같다(시각·ID 값만 다름).

- [ ] **Step 3: 자료 크기**

Run: `ls -l dist/assets/*.js dist/assets/*.css | awk '{s+=$5} END {print s}'` — 바꾸기 전 빌드와 비교
Expected: 증가 +300 KB 이하(제안 목표). 3D 모델·HDRI는 그대로다.

- [ ] **Step 4: 변경 기록·MOON 검토 요청**

변경 기록 표에 D44 줄을 추가한다. 내용: "따뜻한 정비 공방 1단계(설계 2026-11-06): A안 재질(.wa), 정비 일지·의뢰 완료 도장, 손맛 반응(모드 무관), 조명 온기·둘레 소품·햇살. 판정·기록 형식 변화 없음."
MOON에게 `src/app/requests.ts`의 문구 4개(사연 2·한마디 2) 검토를 요청한다.

- [ ] **Step 5: 커밋(배포는 MOON "재배포해" 뒤)**

```bash
git add docs/design/docs/20_2026-10-28_면담결정_변경기록.md
git commit -m "docs(설계): D44 따뜻한 정비 공방 1단계 기록"
```

---

## 이 계획에 없는 것(다음 계획)

- 교관의 고개 끄덕임·시선 다듬기(설계 §4 대화창): 캐릭터 동작 추가가 필요해 1단계 범위에서 뺀다(다음 계획 후보).
  - 2026-11-07 후속(브랜치 cozy-stage1): **검사 통과 끄덕임만** 넣음. 게임 화면에서 교관 곁에서 검사를 통과하면, 기록 저장이 끝난 뒤 결과 화면으로 가기 전 약 2.3초 동안 교관이 고개를 두 번 끄덕이고 "좋아, 검사 통과야. 수고했어!"라고 말한다(누르면 바로 넘어감). 모델 클립을 새로 만들지 않고 Head 뼈를 코드로 돌린다. 저장 실패·중단·교관에게서 먼 곳(서랍)·움직임 줄이기에서는 바로 결과 화면. 시선(다음 장비 보기)은 하지 않는다.
- 직접 그린 SVG 아이콘 세트(설계 §3): 1단계 화면에는 새 아이콘 자리가 없어 2단계(정비 수첩 도장 그림)와 함께 만든다.
  - 2026-11-07 후속(브랜치 cozy-stage1): 새 자리는 만들지 않고, 게임 화면·캐릭터 만들기의 **컬러 이모지 10종**(🎥🔊🔇💬🔍📟🔧🎲🕹️👆)을 직접 그린 선 아이콘(`src/screens/Icon.tsx`, 10개)으로 바꿈. 버튼 글자·aria-label은 그대로. 단색 기호(✕ ✓ ▶ ◀ ▼ ☰ ◆)는 그대로. 2단계 도장 그림은 그때 이 세트에 더한다.
- 과제별 문구 한 곳 모으기(2026-11-07 브랜치): 손님 사연·교관 첫 대사·기본 화면 작업지시를 `src/app/requests.ts` 하나로. 화면 문구는 그대로(`tests/copyGolden.test.ts`).

- 2단계: 정비 수첩·숨은 것 3개·오늘의 의뢰판·교사 설정 확장. Hermes의 IRB 확인 결과를 받은 뒤, 사용성 평가 전에 따로 계획한다(설계 §6·§10-3).
- 측정판 확대 구도 조정: 실기기 점검에서 눈금 가림이 재현될 때만 한다(설계 §4).
- 인트로 셔터 빛·간판 색: 인트로 그림(`src/screens/IntroArt.tsx`)은 SVG라서 Task 4의 토큰만으로는 바뀌지 않는다. 1단계를 마친 뒤 MOON이 화면을 보고 원하면 작은 후속 작업으로 한다.
  - 2026-11-07 후속(브랜치 cozy-stage1): 셔터 안쪽 천장등·벽 빛을 호박색으로, 간판을 나무(갈색)+크림 글자+테두리로, 닫힌 셔터 아래 틈으로 따뜻한 불빛이 새고 열리면 사라지게 함. 셔터 철판(청회색)·노란 쿠페·로고는 그대로.

### 2026-11-07 독립 검토 반영(브랜치 cozy-stage1)

- 1번 끄덕임 중 재검사: 끄덕임(2.3초) 동안 교관을 다시 눌러 검사·중단을 또 하면 두 번째 확정 저장이 ALREADY_FROZEN으로 실패해 결과 화면이 '저장 실패'로 덮였다. `src/app/finishGate.ts`로 결과 요청을 한 번만 받고, 끄덕임이 시작되면 교관 누르기·대화창을 막는다(LabScreen).
- 2번 확정 뒤 초안 부활: TaskScreen이 finish를 시작하면 초안 자동 저장·숨김 일시중지를 멈추고 finish도 한 번만 한다(`finishingRef`).
- 3번 시험: `tests/finishGate.test.ts`(관문 동작 5개 + 화면 배선 2개). 브라우저에서 끄덕임 중 교관 몸을 실제로 눌러도 대화창이 안 열리고 결과 화면이 한 번 뜸을 확인.
- 4번 대비: `.game.wa .g-act` 흰 글자 바탕 #a9520f→#8f4a10(5.38:1 이상), 멀 때 #7d6d5c→#6a5c4d(4.98:1 이상), 노을 바탕 오류 글자 `.wa .error` #8a1a10(가장 밝은 #f6b27a 위 5.17:1).
- 6번: 끄덕임 대사를 `requests.ts`의 `NOD_LINE`으로 옮기고 copyGolden에 고정, 대사가 뜨면 말풍선으로 초점 이동.
- 5번(손님 사연이 판정을 암시할 수 있음)은 연구 판단이라 MOON 결정 대기.
- 5번(2026-11-07 MOON 결정): 제동력 손님 사연(퀘스트 창·정비 일지 머리)을 '브레이크를 밟으면 한쪽으로 쏠려요' → '브레이크 점검 받으러 왔어요'로 — 늘 보이는 문구가 '불량'을 암시하지 않게. 교관 대사(npcAsk)·작업지시(workOrder)의 '한쪽으로 쏠린다' 호소는 main과 같은 문구라 그대로 둠.

### 시연(11-10) 뒤 할 일 — MOON 결정 2026-11-07

- 손님 호소 문구에서 판정 암시 빼기(같은 이유, 5번 후속):
  - 제동력 교관 첫 대사 `npcAsk` "손님 차량이 제동할 때 한쪽으로 쏠린다고 했어." · 기본 화면 작업지시 `workOrder` "제동 시 한쪽으로 쏠린다는 호소" → 점검 의뢰 말투로.
  - 최소회전반경 손님 사연 `complaint` "좁은 길에서 잘 안 돌아요"(+ 같은 호소가 든 `npcAsk`·`workOrder`) → "핸들 점검 받으러 왔어요"처럼.
  - 새 문구는 MOON 검토 뒤 `tests/copyGolden.test.ts`·`tests/requests.test.ts`도 함께 고친다. 문구는 `src/app/requests.ts` 한 곳에 있다.
- 결과 화면 '수업 시점: 대기 중 예습'을 시작 화면 '1~2차시 연습'과 같은 말로, '이어서 하기' 화면 저장 시각을 UTC 원문 대신 한국 시각으로(시연 리허설 발견).
- cozy-stage1을 main에 합친 뒤 시연 문서(`docs/demo/*.html`)의 🎥 등 이모지 표기를 아이콘에 맞게 고친다.

### 2026-11-08 Codex 회의 반영(브랜치 cozy-stage1, MOON 승인 "브랜치에서 세 건 바로 진행")
회의 기록: `docs/CODEX_발전과제_토의결과_2026-11-08.md`(main에 있음).
- **G1 최초 답 보호**: 안내 없음에서 처음 답을 다 적기 전 NPC 검사를 받으면 응답 항목은 '미응답'만 보이고, 적은 칸의 정오(최종 답 오답·채점 불가)는 숨긴다. 건수도 보이는 목록으로 센다. 단계·안전 문제는 그대로. 검사 횟수·npcInspected 사건 기록은 그대로. `visibleInspection`(src/domain/npcInspection.ts), 게임 화면 교관 검사도 같은 경로. 시험 tests/inspectionVisibility.test.ts.
- **G2 확정 원본 하나**: 결과 화면·JSON·CSV 내려받기가 확정 저장한 원본을 쓴다(src/app/resultPayload.ts). 저장 실패 때는 저장하려던 원본. 시험 tests/frozenPayload.test.ts.
- **H1 판 번호에 커밋**: clientAppVersion = `0.3.0-demo+<커밋 12자리>`(고친 파일이 있는 로컬 빌드는 `-dirty`, 모르면 `unknown`). Vercel은 VERCEL_GIT_COMMIT_SHA. 기록 형식 그대로, 64자 안. 시험 tests/buildInfo.test.ts.
- 남은 일(연구판 때): 사용성 평가판·현장 적용판에 git 태그를 달고 **태그–커밋–배포 주소–세션 스냅샷–AI 설정 대응표**를 남긴다. 연구 도중 재배포하지 않는다.
