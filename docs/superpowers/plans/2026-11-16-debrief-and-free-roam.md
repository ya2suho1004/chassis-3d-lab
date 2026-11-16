# 정리 화면과 수행 뒤 둘러보기 — 1단계 Implementation Plan

**Goal:** 실습장 학생 머리 위 닉네임, 검사 통과(또는 중단) 뒤 30초 정리 화면(규칙 정리 + 공식·규정값), "실습장으로 이동" 뒤 수행 뒤 둘러보기, "마치기"로 시작 화면. 채점·기록·전송(`src/domain`, `src/delivery`, `src/records`)과 기록 형식은 그대로.

**설계 문서:** `docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md` 1단계(1-1 ~ 1-8). 2단계(AI·서버)는 하지 않는다.

**작업 규칙:** 폴더 `chassis-3d-lab-cozy`(브랜치 `cozy-stage1`). push·합치기·재배포·`git stash`·새 패키지·`.env*` 읽기 금지. `tsconfig.tsbuildinfo` 커밋 금지(파일을 골라 `git add`). `supabase/`·배치 자료 손대지 않음. 시험은 vitest(node) — 순수 함수, `renderToStaticMarkup`, 원본 글 검사(지금 방식).

## 과제

1. **규칙 정리·공식·잠금 (`src/app/debrief.ts`, 순수)** — 설계 1-3·1-4·1-5와 30초 잠금 계산.
   - `debriefNotes(input)` → `{ good, improve, hard, withheld }`: 고정 틀에 항목 이름·횟수만. 중단 + `answerFeedbackAllowed` 거짓이면 정오에 기대는 문장을 빼고 `withheld`.
   - `debriefFacts(task)` → 과제 자료의 `feedback.wrong_calc.why`·`feedback.wrong_verdict.why`.
   - `debriefStats(run, durationSeconds)` → 걸린 시간·오류·안전 위반·힌트·검사 횟수 한 줄.
   - `lockLeft(startMs, nowMs)`, `startLockTimer(startMs, onLeft, now)` — 30초(`DEBRIEF_LOCK_SECONDS`), 가짜 타이머로 시험.
   - `resultLabels.ts`에 `countLabel(key)`를 더한다(오류·안전 이름).
   - 시험: `tests/debrief.test.ts`(묶음별 문장, 값 누출 없음, 사례 1·2 공식 같음, 가림, 잠금 시간).
2. **정리 화면 (`src/screens/ResultScreen.tsx`)** — 설계 1-2. 상태 3칸·요약 목록·교사용 상세·JSON/CSV·"다음 학생"을 없애고 기록 한 줄, 내 답 표(그대로), 교관의 정리, 오늘 쓴 공식과 규정값, 단추 줄("실습장으로 이동"·"마치기", 30초 잠금). 저장 실패면 "실습장으로 이동" 없음.
   - 시험: `tests/debriefScreen.test.ts`(잠금 전 disabled·남은 초, 잠금 뒤 눌림, 내려받기·상세 없음, 저장 실패, 기록 없이 하기 문구, 시연 저장 문구). 옛 구성을 고정한 시험(`classRecordsWiring`·`copyFixes`·`saveRecovery`)을 새 구성에 맞춘다.
3. **흐름 (`src/App.tsx`, `src/screens/LabScreen.tsx`, `src/screens/NpcDialog.tsx`)** — 설계 1-6. `lab` 화면 상태에 `after: 'completed' | 'aborted' | null`. 정리 화면 "실습장으로 이동" → `lab`(run null, after), ☰ 메뉴·기본 화면 머리 "마치기" → `clearCurrent` 뒤 시작 화면. 수행 뒤에는 과제 받기·교사용 단추 없음, 교관 대사·안내 문구 바꿈.
   - 시험: `tests/freeRoam.test.ts`(대본·배선·자동 전송 조건).
4. **머리 위 닉네임 (`src/scene/LabScene.tsx`)** — 설계 1-1. `Avatar`에 `label3d me` 이름표(키 × 체형 + 0.33), 1인칭·대화 중엔 그리지 않음. `labelHidden` 판단은 순수 함수.
   - 시험: `tests/nameTag.test.ts`.
5. **앱 판 0.4.4-demo** — `src/app/buildInfo.ts` 주석 줄과 값, `tests/buildInfo.test.ts`.
6. **문서·스크립트** — README·`docs/design/docs/02_GAME_FLOW_AND_STORYBOARD.md`·`docs/design/docs/20_…변경기록.md`(D50), `scripts/check/flow-check.mjs`·`scripts/demo-video/demovid.mjs`의 옛 단추.

## 확인
- `npm test`, `npm run build`
- 개발 서버 + 헤드리스 도구로: 3인칭 닉네임, 정리 화면 잠금, 30초 뒤 둘러보기, 마치기 → 시작 화면.
