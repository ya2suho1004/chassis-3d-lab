# chassis-3d-lab — 자동차섀시정비 3D 가상 실습장

대구공고 섀시 실습장을 재현한 브라우저용 3D 게임형 가상 실습장. 1차 과제는 제동력 측정·판독 하나다.

- 설계 정본: 인계 폴더(Codex 협업) `design-current/`. 이 저장소의 `docs/design/`은 2026-10-21 시점 사본(사진 제외).
- 한글 요약: `docs/01_설계안_2026-10-20.md`, `docs/02_설계안_v2_2026-10-20.md`.
- 진행 단계: 로드맵(`docs/design/docs/06_MVP_ROADMAP.md`) **1단계 + 2단계(화면 시연·기기 저장) 완료** — 3D·전송은 아직 없음.

## 실행

```bash
npm install
npm test          # vitest, 77 tests
npx tsc --noEmit  # 타입 검사
npm run dev       # 시연 화면 (http://localhost:5173)
```

## 2단계 전반부: 시연 화면 (`src/screens/`)

시작(세션 코드·익명 코드·사례·안내 방식) → 과제 화면(NPC 작업지시서, 12단계 체크리스트, 안전 확인·위험 행동 버튼, 계기 화면, 판독 입력, 기록표, 힌트, NPC 검사) → 결과(실습 결과·기기 저장·온라인 접수 3상태, 요약, 최초/최종 답 표, 연구 기록 payload JSON). 모든 수행은 `runPurpose=demo`, `researchEligible=false`. 피드백은 실제 표시 직후 `feedbackShown` 이벤트로 기록한다.

## 2단계 후반부: 기기 저장 (`src/records/`)

| 파일 | 역할 | 지키는 원칙 |
|---|---|---|
| `repository.ts` | IndexedDB 저장소(초안·확정 기록·현재 포인터) | ‘저장됨’은 transaction complete. recordId 1회 발급·초안 덮어쓰기·확정 1회(ALREADY_FROZEN). 확정 payload+envelope를 한 트랜잭션에 쓰고 초안 삭제. 실패는 `{status:'failed'}`로 반환. 네트워크 없음 |
| `csv.ts` | 요약 CSV | 고정 헤더, UTF-8 BOM, 쉼표·따옴표·개행 이스케이프, 수식 문자(= + - @) 차단, null은 빈 칸 |
| `types.ts` | `DeliveryEnvelope` | delivery.schema 대응. 연구 payload와 분리 |
| 엔진 추가 | `pauseRun / resumeRun / serializeRun / rehydrateRun` | 숨김·새로고침 공백은 학습시간 제외(`timeQuality: resumed`). 복원 시 모터는 정지 상태 |

화면: 시작 시 초안 저장이 끝나야 과제로 진입 · 조작마다 자동저장(상단에 ‘이 기기 저장됨/실패’) · 화면 숨김 시 일시중지 · 새로고침 후 ‘이어서 하기/새 수행’ · 완료·중단 시 확정 저장 · ‘다음 학생’은 포인터만 초기화(확정 기록 보존) · 시작 화면 하단 교사용 요약 CSV(시연 PIN 0000, 보안 통제 아님).

## 1단계 결과물 (`src/domain/`)

| 파일 | 역할 | 지키는 원칙 |
|---|---|---|
| `judge.ts` | 차량 판정 `calculateVehicleVerdict` | 기준값 없으면 8/20/50을 넣지 않고 판정 불가. 음수·0 축중·비유한수·미지정 축은 입력 오류. 절사(1자리) 정책으로 비교, 경계값 포함 |
| `grading.ts` | 응답 채점 `createResponseSheet / submitAnswer / summarizeResponses` | 최초 답은 덮어쓰지 않음. 미입력은 null. 정수 입력 정책. `judgmentCorrect`는 최초 판정 기준. 분모 6 고정 |
| `taskEngine.ts` | 단계 전이·안전 인터록 `createTaskRun / attempt / submitResponse / requestHint` | 선행 안전 조건 → 선행 단계 → 응답 요구 순으로 검사. 안전 위반과 학습 오류 분리, 같은 actionId 1회 집계. 힌트는 요청만. 이벤트 200개 한도 |
| `npcInspection.ts` | 최종 수행 검사 `inspectPerformance` | 차량 판정·최초 정오와 별개. 불량 차량을 정확히 판정하거나 보완 정답이면 통과. 이전 오류 보존 |
| `record.ts` | 기록 payload `buildRecordPayload` | `record.schema.json` 1.1.0 형식(usagePhase 필수). 전송 상태 미포함. `researchEligible`은 승인 4종·research·completed·passed일 때만 |
| `types.ts` | 과제 데이터 형식 | `docs/design/contracts/task.schema.json` 1.1.0 대응. 과제 전체는 pending(동작 매핑 미완료), 규칙은 교사 승인 |
| `feedbackPolicy.ts` | 피드백 노출 정책 | 무안내: 필수 응답 6개 최초 답 저장 뒤 정답 피드백. 안전 피드백은 즉시 |

과제 데이터: `src/data/tasks/task.braking-force.case-lv1.json`, `case-lv2.json` — 교사 확인 0A(2026-10-21) 값을 담은 1.1.0 정식 파일. 학생 화면 제목은 ‘사례 1/2’(정답 비노출). 미해결 기술 항목은 `docs/design/docs/12_0D_준비검토.md` §2-2.

## 아직 없는 것

3D(three.js), Apps Script 전송·접수번호·재전송, 교사 설정 화면, 여러 탭 잠금, 배치 좌표(실측 진행 중). 3단계·0C부터.
