# 최소회전반경 측정 과제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 제동력 과제 옆에 두 번째 정식 연구 과제 “최소회전반경 측정”을 3D 조작·판정·기록·서버 접수·AI 교관 문맥까지 동작하게 넣는다(설계: `docs/superpowers/specs/2026-11-02-min-turning-radius-task-design.md`).

**Architecture:** 과제 엔진·채점은 이미 단계·응답 항목 중심으로 일반화되어 있으므로, 과제별로 다른 것(기준값 계산)만 `turningJudge.ts`로 분리하고 `grading.createResponseSheet`가 `taskId`로 고른다. 기록은 **최소회전반경만 1.2.0**(taskId enum·계산 단위 enum)으로 쓰고 제동력은 1.1.0 그대로 둬 회귀를 막는다. 3D는 기존 K3 모델 노드(`Wheel_FL`·`Wheel_FR`·`Turntables`)를 움직이고 측정판 눈금은 CanvasTexture로 그린다.

**Tech Stack:** React 18 + TypeScript + @react-three/fiber/drei, Vitest, Ajv(계약 검사 시험), Supabase Edge Function(Deno, 생성 코드), Vercel.

---

## 파일 구조
- Create `src/domain/turningJudge.ts` — 최소회전반경 기준값·판정(순수 함수).
- Create `src/data/tasks/task.min-turning-radius.case-lv1.json`, `…-lv2.json` — 사례·단계·피드백.
- Modify `src/domain/types.ts` — measurement·ruleset 선택 필드.
- Modify `src/domain/grading.ts` — taskId별 기준값, 계산 단위.
- Modify `src/domain/taskEngine.ts` — 응답 요구(`anglesRead`·`radiusSubmitted`), `engineOff` 완료 시 s-engine.
- Modify `src/domain/record.ts` — taskId 일반화, 최소회전반경은 schemaVersion 1.2.0.
- Create `docs/design/contracts/record.schema.v1.2.0.json`; Modify `session.snapshot.schema.json`, `schema-index.json`, `archive/apps-script/Schemas.gs`·`Code.gs`, `scripts/build-demo-snapshots.mjs` → 재생성 `DemoSnapshots.gs`·`demo-snapshots.json`·`snapshot-ledger.json`·`receiverCore.generated.js`.
- Modify `src/app/session.ts` — 과제 목록 4개.
- Modify `scripts/build-chat-context.mjs`, `supabase/functions/_shared/chat/prompt.ts` → 재생성 `taskContext.generated.json`.
- Modify `src/screens/TaskScreen.tsx` — 제시값 패널·응답 칸(과제별).
- Create `src/scene/turningRig.ts`(조향 상태 계산), `src/scene/TurntableDials.tsx`(눈금판); Modify `LabScene.tsx`, `LabScreen.tsx`, `avatarActions.ts`, `layout.dev-provisional.json`.
- Tests: `tests/turningJudge.test.ts`, `tests/turningTask.test.ts`(엔진·채점·기록·서버), 기존 시험 유지.

---

### Task 1: 판정 함수

**Files:** Create `src/domain/turningJudge.ts`; Test `tests/turningJudge.test.ts`

- [ ] **Step 1: 실패하는 시험**
```ts
import { describe, expect, it } from 'vitest'
import { calculateTurningVerdict, outerWheel } from '../src/domain/turningJudge'
const P = { mode: 'rounded', digits: 1, rounding: 'truncate' } as const
const SIN = { '30': 0.5, '31': 0.515, '32': 0.5299, '33': 0.5446, '34': 0.5592, '35': 0.5736 }
const base = { wheelbaseM: 2.7, kingpinOffsetM: 0.1, sinTable: SIN }
describe('최소회전반경 판정', () => {
  it('좌회전은 우측, 우회전은 좌측 바퀴가 바깥쪽', () => {
    expect(outerWheel('left')).toBe('right'); expect(outerWheel('right')).toBe('left')
  })
  it('사례 1: 좌회전 좌35·우30 → 5.5 m 양호', () => {
    const r = calculateTurningVerdict({ ...base, turnDirection: 'left', leftAngleDeg: 35, rightAngleDeg: 30 }, { radiusMaxM: 12, decisionPrecision: P })
    expect(r).toMatchObject({ status: 'evaluable', radiusM: 5.5, outerAngleDeg: 30, verdict: 'pass' })
  })
  it('사례 2: 우회전 좌32·우36 → 5.1 m(절사) 양호', () => {
    const r = calculateTurningVerdict({ ...base, turnDirection: 'right', leftAngleDeg: 32, rightAngleDeg: 36 }, { radiusMaxM: 12, decisionPrecision: P })
    expect(r.radiusM).toBe(5.1); expect(r.verdict).toBe('pass')
  })
  it('12 m 경계 포함, 넘으면 불량', () => {
    const r = calculateTurningVerdict({ wheelbaseM: 5.95, kingpinOffsetM: 0.1, sinTable: SIN, turnDirection: 'left', leftAngleDeg: 35, rightAngleDeg: 30 }, { radiusMaxM: 12, decisionPrecision: P })
    expect(r.radiusM).toBe(12); expect(r.verdict).toBe('pass')
    const f = calculateTurningVerdict({ wheelbaseM: 6, kingpinOffsetM: 0.1, sinTable: SIN, turnDirection: 'left', leftAngleDeg: 35, rightAngleDeg: 30 }, { radiusMaxM: 12, decisionPrecision: P })
    expect(f.verdict).toBe('fail')
  })
  it('표에 없는 각도·기준 없음은 판정 불가', () => {
    expect(calculateTurningVerdict({ ...base, turnDirection: 'left', leftAngleDeg: 35, rightAngleDeg: 40 }, { radiusMaxM: 12, decisionPrecision: P }).status).toBe('notEvaluable')
    expect(calculateTurningVerdict({ ...base, turnDirection: 'left', leftAngleDeg: 35, rightAngleDeg: 30 }, { radiusMaxM: null, decisionPrecision: P }).reasonCode).toBe('RULESET_INCOMPLETE')
  })
})
```
- [ ] **Step 2:** `npx vitest run tests/turningJudge.test.ts` → FAIL(모듈 없음)
- [ ] **Step 3: 구현** — `applyPrecision`(judge.ts) 재사용. 반환 `{ status, reasonCode, outerWheel, outerAngleDeg, radiusM, radiusMaxM, verdict }`. R = wheelbase ÷ sinTable[outer] + kingpinOffset, 기재값 = applyPrecision(R, P), verdict = 기재값 ≤ radiusMaxM ? 'pass' : 'fail'.
- [ ] **Step 4:** 같은 명령 → PASS
- [ ] **Step 5:** 커밋 `feat(과제): 최소회전반경 판정 함수`

### Task 2: 과제 데이터·타입·채점

**Files:** Create 두 과제 JSON; Modify `types.ts`, `grading.ts`; Test `tests/turningTask.test.ts`

- [ ] **Step 1:** 과제 JSON(lv1/lv2) 작성 — `taskId: "min-turning-radius"`, `taskDefinitionVersion: "1.0.0-teacher-2026-11-02-lv1|lv2"`, measurement `{ measurementSetVersion: "1.0.0-teacher-2026-11-02", sourceType: "teacherApprovedCase", unit: "°", caseId, left:null, right:null, axleWeight:null, axlePosition:null, inputsIntegerOnly:true, turnDirection, leftAngleDeg, rightAngleDeg, wheelbaseM: 2.7, kingpinOffsetM: 0.1, sinTable }`, ruleset `{ rulesetVersion: "1.0.0-school-0G-2026-11-02", approvalStatus: "approved", deviationMaxPercent:null, sumMinFrontPercent:null, sumMinRearPercent:null, radiusMaxM: 12, decisionPrecision: truncate 1, sourceDocument: "NCS LM1506030326 p.73·78~79 + 학교 답안지 5-짝수 + 교사 확인 0G(2026-11-02)", sourcePage: "73, 78~79", approvedOn: "2026-11-02", judgmentValueSource: "written" }`, requiredResponseItems(leftAngle·rightAngle °/integer, radius m/truncate1, vehicleCondition), 8단계(설계 표), feedback 키 `blocked_ppe, blocked_order, blocked_safety_engine, wrong_reading, wrong_calc, wrong_verdict`, feedbackPolicy(제동력과 같은 version·answerFeedbackKeys `wrong_reading, wrong_calc, wrong_verdict`).
- [ ] **Step 2: 실패하는 시험** — `createResponseSheet(lv1)`의 referenceValue: leftAngle 35, rightAngle 30, radius 5.5, vehicleVerdict 'pass'; `submitAnswer(sheet,'radius','5.53')` 정답(절사), `'5.4'` 오답; `'radius'`를 안쪽 각(35°)로 계산한 `'4.8'` 오답.
- [ ] **Step 3: 구현** — types.ts measurement·ruleset에 선택 필드. grading.ts: `taskId === 'min-turning-radius'`면 `calculateTurningVerdict`로 vehicle·reference(leftAngle/rightAngle → 제시 각, radius → radiusM) 계산. `ResponseSheet.vehicle`은 공용 최소 형태 `{ status, reasonCode, verdict }`로 넓힌다. summarize의 계산 단위는 item.unit(`%`|`m`).
- [ ] **Step 4:** 시험 PASS + 기존 grading 시험 PASS
- [ ] **Step 5:** 커밋

### Task 3: 엔진

**Files:** Modify `taskEngine.ts`; Test `tests/turningTask.test.ts`
- [ ] **Step 1: 시험** — lv1 run: `steer` 먼저 시도 → blocked, reasonCode `SAFETY_s-ppe`; ppe 후 `steer` → `SAFETY_s-engine`, safetyViolationCount 1; ppe→engineOff→turntable→direction→steer→read(응답 없으면 `NEEDS_RESPONSE_leftAngle`)→응답 후 completed→return→record(응답 radius·vehicleCondition 필요)→allStepsCompleted.
- [ ] **Step 2: 구현** — `RESPONSE_REQUIREMENTS`에 `anglesRead: ['leftAngle','rightAngle']`, `radiusSubmitted: ['radius','vehicleCondition']`; 완료 부수효과 `if (step.stepId === 'engineOff') s-engine 추가`.
- [ ] **Step 3:** PASS, 커밋

### Task 4: 기록 1.2.0·서버·세션 스냅샷

**Files:** record.ts, 계약 파일, Schemas.gs, Code.gs, snapshot 생성기, 생성물
- [ ] **Step 1: 시험** — lv1 완료 run을 `buildRecordPayload` → `schemaVersion '1.2.0'`, `taskId 'min-turning-radius'`, calculationAnswers unit 'm'; Ajv로 v1.2.0 스키마 통과; 제동력은 여전히 1.1.0. `receiverCore`의 `validateAgainst(RECORD_SCHEMAS['1.2.0'], p)` 통과, `SUPPORTED_RECORD_VERSIONS`에 1.2.0. 세션 스냅샷에 min-turning-radius 조합이 있고 `createDemoSession({task: turningLv1, ...})`이 찾는다.
- [ ] **Step 2: 구현** — record.schema.v1.2.0.json = 1.1.0 복사 후 `$id` `urn:chassis-3d-lab:record:1.2.0`, schemaVersion const 1.2.0, taskId enum 두 개, calculationAnswers.unit enum `%`,`m`. Schemas.gs에 `'1.2.0'` 키 추가(JSON 한 줄), Code.gs SUPPORTED에 1.2.0. session.snapshot.schema의 taskId를 enum 두 개로. 생성기: tasks 4개, OFF_SUBSTEPS는 제동력에만. `npm run build:gs-snapshots` → `node scripts/build-receiver-core.mjs`.
- [ ] **Step 3:** 전체 시험 PASS, 커밋

### Task 5: 앱 연결·과제 화면
- [ ] session.ts `listTasks()` 4개. TaskScreen: 과제가 min-turning-radius면 제시값 카드(회전 방향, L, r, sin 표, 기준 12 m 이하)와 응답 칸(좌·우 각도 °, R m, 판정)을 보여 주고, 단계 버튼은 기존 방식 그대로. CSV 요약 열은 itemId 기반이라 확인만.
- [ ] 시험: 기존 화면 시험 PASS, 개발 서버에서 과제 목록에 두 사례 표시.
- [ ] 커밋

### Task 6: AI 교관 문맥
- [ ] build-chat-context.mjs: `{ tasks: [braking 요약, turning 요약(radiusMaxM, digits, steps)] }` — measurement·사례 값 제외. prompt.ts가 현재 과제 taskId의 문맥을 쓰도록. chatServer 시험(최신·무유출) 갱신. 커밋.

### Task 7: 3D
- [ ] `turningRig.ts`: `turningRigState(run)` → `{ steerSide: 'left'|'right'|null, leftDeg, rightDeg }`(steer 완료~return 전이면 사례 각, 그 외 0). 시험.
- [ ] LabScene: k3 장비 모델에서 `Wheel_FL`·`Wheel_FR` rotation.y를 부드럽게 따라가게(좌회전 = +y). `TurntableDials`: 각 측정판 위에 0~45° 눈금판(CanvasTexture), 바늘이 바퀴 각을 가리킴. 장비 `min-turning-radius-01` interactive, 과제 단계의 equipmentId.
- [ ] LabScreen: read 단계 근처에서 “📟 측정판 보기” → 좌·우 측정판 가까이 보기(◀ 좌 / 우 ▶ 전환).
- [ ] avatarActions: 새 stepId의 동작 매핑(없으면 기본).
- [ ] 개발 서버: 사례 1·2 처음부터 제출까지, 폰 가로·세로 화면. 커밋.

### Task 8: 기록·인계
- [ ] docs/20 D33, 결정기록, IRB 인계 문서(thesis), README 진행 줄. 커밋·푸시. 재배포(Vercel + `supabase functions deploy submit chat`)는 사용자 “재배포해” 때.
