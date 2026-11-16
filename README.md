# chassis-3d-lab — 자동차섀시정비 3D 가상 실습장

> **2026-10-28:** 수신 서버를 Supabase로 바꾸기로 해 Apps Script 수신점은 `archive/apps-script/`로 보관했다(시험·개발용 가짜 수신점은 계속 그 코드를 씀). 결정 기록은 `docs/design/docs/20_2026-10-28_면담결정_변경기록.md`, 영향 분석은 `docs/05_영향분석_2026-10-28.md`.

대구공고 섀시 실습장을 재현한 브라우저용 3D 게임형 가상 실습장. 1차 과제는 제동력 측정·판독 하나다.

- 설계 정본: 인계 폴더(Codex 협업) `design-current/`. 이 저장소의 `docs/design/`은 2026-10-21 시점 사본(사진 제외).
- 한글 요약: `docs/01_설계안_2026-10-20.md`, `docs/02_설계안_v2_2026-10-20.md`.
- 진행 단계: 로드맵(`docs/design/docs/06_MVP_ROADMAP.md`) **1단계 + 2단계(화면 시연·기기 저장) 완료** — 3D·전송은 아직 없음.

## 실행

```bash
npm install
npm test          # vitest, 258 tests
npx tsc --noEmit  # 타입 검사
npm run dev       # 시연 화면 (Vite 기본 포트 5173; 앱 내 .claude/launch.json은 5174)
```

## 0C: 직접 제출 전송 (`src/delivery/`, `archive/apps-script/`)

| 파일 | 역할 | 지키는 원칙 |
|---|---|---|
| `src/delivery/jcs.ts` | RFC 8785 정규화·SHA-256 | 키 UTF-16 순 정렬, NFC/NFD·trim·숫자 재절사 없음, 비유한 수·짝 없는 서로게이트 거절. 서버 `Jcs.gs`와 결과 동일 |
| `src/delivery/submit.ts` | 제출 1건 전송·ack 검증 | `text/plain` POST, cors·omit·follow, 인증 헤더·쿼리 없음. JSON 모양·protocol·recordId·독립 계산 hash·receipt·시각이 모두 맞아야 acknowledged. HTML·opaque·네트워크 오류는 confirmationPending |
| `src/delivery/outbox.ts` | 대기열 처리(교사 조작·수업용 자동 전송) | 같은 ID·같은 원본만 재전송, rejected·conflict는 자동 재시도 없음, 보내기 전 uploading 저장. 2026-11-16(0.4.0-demo): `auto` 모드는 수업용 세션 기록만 보내고 거절 기록을 다시 보내지 않음, 시연·리허설 세션의 학번 기록은 교사 전송에서도 건너뜀(`STUDENT_NUMBER_OUTSIDE_CLASS`), 수업용 기록의 `SESSION_NOT_ALLOWED` 거절은 교사 전송으로 다시 보냄 |
| `src/delivery/autoSend.ts` | 수업용 세션 자동 전송(2026-11-16) | 앱을 열 때·`online`(끊겨 못 보낸 기록은 재시도 시각을 기다리지 않음)·기록 확정 때, 그리고 앱이 켜져 있는 동안 가장 이른 재시도 시각에 맞춘 타이머 하나로 돈다. 인터넷이 끊겨 있으면 시도하지 않고, 시도 상한이 없다(간격 최대 10분). 다시 보내도 소용없는 사유·거절·충돌은 교사 버튼으로만. 전송함 처리는 `outbox.ts`가 한 줄로 세워 교사 전송과 겹치지 않는다. 전송 주소가 없으면 아무것도 안 함. 결과 화면 전송 상태 문구(정오 없음) |
| `archive/apps-script/*.gs` | Apps Script 수신점 | 엄격 파싱(prototype 없는 객체, 중복 키 거절) → 버전별 스키마(record 1.0.0·1.1.0) → 의미 검증 → 허용 스냅샷 문맥 대조(`DemoSnapshots.gs`) → 잠금 안 정본 1행(5열)·기존 행 재검증·중복/충돌·flush·재읽기 → ack. 접수 창·행 상한 설정은 필수(fail-closed) |
| `src/data/session/demo-snapshots.json`, `snapshot-ledger.json` | 세션 스냅샷 156개(active: 시연 72·리허설 48·수업용 36, 2026-11-16)와 append-only 원장(156항목, 수신점 목록은 합성 fixture 포함 157) | 선택(사례·모드·시점·진입 방향)마다 불변 ID·versions·승인(과제 pending)과 검증 범위(등록 단계·선행 그래프). 옛 스냅샷은 retired로 보존(접수번호 회수용). 같은 ID의 내용·검증 범위 변경, 중복 ID는 생성 실패(`scripts/snapshotLib.mjs`). `npm run build:gs-snapshots`로 수신점 목록과 함께 생성 |
| `server/dev/fakeSubmitServer.ts` | 개발 서버 가짜 수신점 | 같은 .gs 코드를 Node에서 실행. `/__fake-submit/control?mode=html|badhash|drop|lockbusy`로 D04·D07 재현. 운영 번들 제외 |

실배포(Google 웹 앱·GitHub Pages·학교 기기)는 아직 하지 않았다. 절차는 `archive/apps-script/README.md`, 시험 상태는 `docs/03_0C_전송_시험_계획_2026-10-26.md`, 학교 점검표는 `docs/design/docs/18_0C_DEPLOYMENT_CHECKLIST.md`. Codex 코드 검토는 2026-10-27(커밋 54634d4)에 종결(배포 승인 아님).

## 3단계: 3D 실습장 (`src/scene/`, `src/screens/LabScreen.tsx`)

| 파일 | 역할 | 지키는 원칙 |
|---|---|---|
| `src/data/layout/layout.dev-provisional.json` | 개발용 임시 배치(장비 23·기둥 4·벽·트인 변·시작점·NPC) | `sourceStatus=devProvisional`, `layoutConfirmed=false`, `metricScaleKnown=false`. 항목마다 근거(`basis`: measured / measured-partial / sketch / assumption / teacher)를 적는다. 제동력 구역만 2026-10-21 실측값, 나머지는 스케치 비례·가정 |
| `scene/layoutModel.ts` | 배치 읽기·발자국(footprint)·근접 판정 | 원점은 임시 배치의 북서 모서리, x=동, z=남, 단위 m. 접근점 반경 1.3m 안이면 ‘근처’ |
| `scene/pathfind.ts` | 격자(0.5m) A* 길찾기 | 장비·기둥·벽 밖을 막고 아바타 반경만큼 띄운다. 막힌 곳이 목적지면 경로 없음(null) |
| `scene/LabScene.tsx` | three.js(R3F) 장면 | 단순 도형만, 그림자 없음, 저사양 체크 시 해상도·안티에일리어싱 낮춤. 바닥 탭 이동, 드래그 회전, 3인칭 추적 카메라, 장비 라벨(drei Html, 고정 크기). 과제 중에는 고른 장비·다음 단계 장비·작동 장비 이름표만(‘이름표 모두 보기’로 전환). 사진·NCS 그림 사용 안 함 |
| `screens/LabScreen.tsx` | 실습장 HUD | 장비 탭 → 설명 카드·도감, 지정 위치 이동 버튼(교관·시험기·조작부·시작점), NPC 교관 근처(2m)에서 ‘과제 수령’ → 수행 번호 발급·초안 저장. 과제 패널은 3D 모드에서 해당 장비 접근점에 서야 단계 수행 가능(‘이동 필요’) |
| `screens/CodexWindow.tsx`, `app/codexList.ts`, `app/codexStore.ts` | 도감 창(2026-11-16, 0.4.1-demo) | 이름표의 ‘도감 n/23’(기본 화면은 ‘도감 보기’)을 누르면 장비 카드 23장(배치 순서, 못 본 장비는 ‘?’). 도감은 학번별로 이 기기 localStorage(`chassis.codex.v1`)에만 — 기록 없이 하기는 저장 안 함, 수행 기록·서버에 안 들어감, 여닫기는 사건 없음 |
| `screens/ResultScreen.tsx`, `app/debrief.ts`, `scene/nameTag.ts` | 정리 화면과 수행 뒤 둘러보기(2026-11-16, 0.4.4-demo) | 검사 통과·중단 뒤 정리 화면: 정비 일지, 기록 한 줄, 내 답 표(정답 값 숨김), 교관의 정리(잘한 점·보완할 점·어려웠던 것으로 보이는 점 — 규칙으로 만든 고정 문장, 항목 이름·횟수만), 오늘 쓴 공식과 규정값(과제 자료의 계산·판정 설명 그대로, 안내 없음 중단이면 가림). 두 단추(‘실습장으로 이동’·‘마치기’)는 30초 동안 잠김. 실습장으로 가면 과제를 다시 받지 않고 도감만 모으며, ☰ 메뉴·기본 화면 머리의 ‘마치기’로 시작 화면. 내려받기·교사용 상세·상태 3칸은 학생 화면에서 뺐다(교사는 교사 화면 ③, 확정 저장 실패 때만 ‘기록 파일 내려받기’). 학생 머리 위 닉네임(1인칭·대화 중엔 숨김). 기록·서버에 들어가는 것 없음 |
| `chat/debriefClient.ts`, `app/debrief.ts`, `supabase/functions/_shared/chat/debriefCore.ts`·`debriefPrompt.ts` | 정리 화면의 AI 정리(2026-11-16, 0.4.5-demo, 설계 같은 문서 2단계) | 검사 통과한 수행(기록 모드·대화 주소·확정 기록·저장 성공·온라인)이면 정리 화면이 뜰 때 한 번, 대화와 같은 주소(`VITE_CHAT_ENDPOINT`)에 `protocolVersion: debrief-1`로 부른다. 보내는 것은 항목 정오(불리언)·알려진 오류/안전 키의 횟수·힌트·검사 횟수·걸린 초뿐(값·닉네임 없음). 서버(chat 함수의 새 갈래)가 허용 목록으로 검사해 요약 글로 바꾸고 지시문 `debrief-ko-0.3.0`(교사 검토 문서 `docs/06b_AI정리_지시문_초안.md`)과 함께 AI에 보낸 뒤, 답을 검사(JSON·세 묶음·3문장·120자·양호/불량·요약과 판정 기준에 없는 숫자 — 전각 숫자·한글 수사 횟수 포함)해 `chat_logs`에 남긴다(`prompt_version`이 `debrief-`로 시작, 같은 수행은 다시 쓰고, 학생 하루 10번·세션 하루 한도는 정리 행만, 대화 한도는 정리 행을 세지 않음). 화면은 12초 기다리며 ‘교관이 정리를 쓰고 있어요…’, AI 글이면 ‘AI 교관이 쓴 글이에요(사람 아님).’, 늦거나 실패하면 규칙 정리(한번 보인 글은 바꾸지 않음). AI 글은 기록·기기 저장에 넣지 않는다. 교사 대화 점검에는 ‘수행 정리’로 보이고 대화 기록 CSV 끝에 kind 열. 평가 도구 `scripts/chat-eval/run-debrief.mjs`. 서버 반영 전 |
| `scene/brakeRig.ts` | 제동력 시험기 연출 상태 | 과제 진행에서 차량(밖·들림·롤러 위)·리프트·롤러 회전만 계산. 표시 전용이며 단계 완료·판정과 무관. 진입 방향 미설정이면 진입·이탈 연출 없음(U6). 장면은 차량 진입/이탈·바퀴 구름·리프트 판 상승·롤러 회전, 계기는 0→최대값 상승 뒤 ‘최대값 고정’(U1 근사). 모션 줄이기 설정이면 즉시 표시 |
| 엔진 추가 | `changeDisplayMode` | 3D↔도식 전환을 `displayModeChanged` 이벤트(from/to/사유)로 남기고 `experiencedDisplayModes`에 누적. 기록 payload의 `displayMode`는 시작 모드 |

배치 눈검토(교사): 과제 수령 전 실습장 상단 ‘배치 눈검토(교사)’ → 경계 5·기둥 4·장비 23·위치 2(34항목)를 맞음/조금 다름/많이 다름/없음으로 표시, 항목을 누르면 캐릭터가 그 자리로 이동. 이 기기 초안(localStorage) + `LAYOUT_3D_REVIEW_날짜.json` 내려받기만, 전송 없음. 결과와 무관하게 layoutConfirmed=false 유지(`src/review/layoutReview.ts`, `screens/LayoutReviewPanel.tsx`).

실측 입력(교사): 같은 자리 ‘실측 입력(교사)’ → 실습장 전체(북·동 벽 길이, 천장)·기둥 4·장비 22(시험 차량 제외)를 중요도 순으로, 가로·세로·높이와 북쪽 벽/동쪽 벽(안쪽 면)에서 각 끝까지 거리를 m로 입력. 칸에 지금 3D 짐작값 표시, 잘못된 값(cm·문자) 표시, 이 기기 초안 + `LAYOUT_SURVEY3_날짜.json` 내려받기만(`src/review/layoutSurvey.ts`, `screens/LayoutSurveyPanel.tsx`).

화면 흐름: 시작 → 실습장(둘러보기·도감) → NPC 교관에게 과제 수령 → 과제 패널(3D 옆) → NPC 검사 또는 중단 → 결과. 도식 모드로 바꾸면 3D 없이 과제 패널만 보인다(저사양 대체).

## 2단계 전반부: 시연 화면 (`src/screens/`)

시작(학번 네 자리 입력 — 리허설 세션은 가상 코드 `D-01`~`D-99` · 오늘 과제 한 줄. 세션·과제·차시·도움 방식은 학생이 고르지 않고 교사 설정이나 수업 주소를 따르며, 설정이 없으면 기본값. 2026-11-14 변경, 그 전에는 익명 코드 `A-01`과 사례·안내 방식을 학생이 골랐다) → 과제 화면(NPC 작업지시서, 12단계 체크리스트, 안전 확인·위험 행동 버튼, 계기 화면, 판독 입력, 기록표, 힌트, NPC 검사) → 결과(실습 결과·기기 저장·온라인 접수 3상태, 요약, 최초/최종 답 표, 연구 기록 payload JSON — 2026-11-16 0.4.4-demo부터는 30초 정리 화면: 기록 한 줄·최초/최종 답 표·교관의 정리·오늘 쓴 공식과 규정값, 그 뒤 ‘실습장으로 이동’(수행 뒤 둘러보기) 또는 ‘마치기’. 0.4.5-demo부터 검사 통과한 수행의 교관의 정리는 AI가 쓸 수 있고, 12초 안에 오지 않으면 규칙 정리. 설계 `docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md`). 모든 수행은 `runPurpose=demo`, `researchEligible=false`. 2026-11-16(0.4.0-demo, 설계 `docs/superpowers/specs/2026-11-15-class-records-design.md`): 수업용 세션(`CLS-L12` 수업 · 연습, `CLS-L5` 수업 · 정리)은 학번으로 들어오고, 마치거나 중단하면 기록이 서버로 바로 간다(시작 화면 안내 한 줄, 결과 화면 전송 상태 한 줄). 서버는 수업용 세션만 학번을 받고 시연·리허설은 `D-xx`만 받는다. 피드백은 실제 표시 직후 `feedbackShown` 이벤트로 기록한다.

## 2단계 후반부: 기기 저장 (`src/records/`)

| 파일 | 역할 | 지키는 원칙 |
|---|---|---|
| `repository.ts` | IndexedDB 저장소(초안·확정 기록·현재 포인터) | ‘저장됨’은 transaction complete. recordId 1회 발급·초안 덮어쓰기·확정 1회(ALREADY_FROZEN). 확정 payload+envelope를 한 트랜잭션에 쓰고 초안 삭제. 실패는 `{status:'failed'}`로 반환. 네트워크 없음 |
| `csv.ts` | 요약 CSV | 고정 헤더, UTF-8 BOM, 쉼표·따옴표·개행 이스케이프, 수식 문자(= + - @) 차단, null은 빈 칸 |
| `types.ts` | `DeliveryEnvelope` | delivery.schema 대응. 연구 payload와 분리 |
| 엔진 추가 | `pauseRun / resumeRun / serializeRun / rehydrateRun` | 숨김·새로고침 공백은 학습시간 제외(`timeQuality: resumed`). 복원 시 모터는 정지 상태 |

화면: 시작 시 초안 저장이 끝나야 과제로 진입 · 조작마다 자동저장(상단에 ‘이 기기 저장됨/실패’) · 화면 숨김 시 일시중지 · 새로고침 후 ‘이어서 하기/새 수행’ · 완료·중단 시 확정 저장 · ‘마치기’(0.4.4-demo 전에는 ‘다음 학생’)는 포인터만 초기화(확정 기록 보존) · 시작 화면 하단 ‘교사 화면’(시연 PIN 0000, 보안 통제 아님): 수업 설정(세션·사례·수업 시점·도움 방식·진입 방향을 이 기기에 저장하고, 학생용 수업 주소 `#v=1&…`·복사 버튼·QR로 학생 기기에 전달 — 학생 기기는 그 주소로 열면 설정을 저장하고 `#` 값을 지움. `src/app/teacherPreset.ts`·`src/app/classLink.ts`·`src/teacher/qr.ts`, 2026-11-14)과 기록 관리(요약 CSV·대기 기록 전송, `screens/TeacherPanel.tsx`), 교사 로그인 뒤 학생별 성취 표(수업용 세션 서버 기록을 학번×과제로 — 완료 여부·검사·오류 수·걸린 시간·수행 횟수, `src/teacher/achievement.ts`·`screens/AchievementTable.tsx`, 2026-11-16).

## 1단계 결과물 (`src/domain/`)

| 파일 | 역할 | 지키는 원칙 |
|---|---|---|
| `judge.ts` | 차량 판정 `calculateVehicleVerdict` | 기준값 없으면 8/20/50을 넣지 않고 판정 불가. 음수·0 축중·비유한수·미지정 축은 입력 오류. 절사(1자리) 정책으로 비교, 경계값 포함 |
| `grading.ts` | 응답 채점 `createResponseSheet / submitAnswer / summarizeResponses` | 최초 답은 덮어쓰지 않음. 미입력은 null. 정수 입력 정책. `judgmentCorrect`는 최초 판정 기준. 분모 6 고정 |
| `taskEngine.ts` | 단계 전이·안전 인터록 `createTaskRun / attempt / submitResponse / requestHint` | 선행 안전 조건 → 선행 단계 → 응답 요구 순으로 검사. 안전 위반과 학습 오류 분리, 같은 actionId 1회 집계. 힌트는 요청만. 이벤트 200개 한도. `off`는 하위 행동 `subStep`(MOTOR OFF → 주변 재확인 → 상승 → 이탈)으로만 완료, 점검 단계는 `s-engine`(시동 OFF 확인) 선행 |
| `npcInspection.ts` | 최종 수행 검사 `inspectPerformance` | 차량 판정·최초 정오와 별개. 불량 차량을 정확히 판정하거나 보완 정답이면 통과. 이전 오류 보존 |
| `record.ts` | 기록 payload `buildRecordPayload` | `record.schema.json` 1.1.0 형식(usagePhase 필수). 전송 상태 미포함. `researchEligible`은 승인 4종·research·completed·passed일 때만 |
| `types.ts` | 과제 데이터 형식 | `docs/design/contracts/task.schema.json` 1.1.0 대응. 과제 전체는 pending(동작 매핑 미완료), 규칙은 교사 승인 |
| `feedbackPolicy.ts` | 피드백 노출 정책 | 무안내: 필수 응답 6개 최초 답 저장 뒤 정답 피드백. 안전 피드백은 즉시 |

과제 데이터: `src/data/tasks/task.braking-force.case-lv1.json`, `case-lv2.json` — 교사 확인 0A(2026-10-21) 값을 담은 1.1.0 파일에 U3 제안(tire·equip의 `s-engine`, `blocked_safety_engine`)을 더한 사본(`taskDefinitionVersion` 접미 `+u2u3-proposal-2026-10-26`, 전체 pending). 학생 화면 제목은 ‘사례 1/2’(정답 비노출). 미해결 항목과 교사 확인지 0E는 `docs/design/docs/12_0D_준비검토.md` §2-2.

## 아직 없는 것

실제 Google 배포·GitHub Pages·학교 기기 시험(0C 실배포), 교사 설정 화면, 여러 탭 잠금, 실측 기반 실제 배치(임시 배치는 실제 학교 재현이 아님), 제동력 외 장비의 작업 애니메이션, U1 실물 확인(장비 수리 후).
