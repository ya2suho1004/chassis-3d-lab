# chassis-3d-lab — 자동차섀시정비 3D 가상 실습장

대구공고 섀시 실습장을 재현한 브라우저용 3D 게임형 가상 실습장. 1차 과제는 제동력 측정·판독 하나다.

- 설계 정본: 인계 폴더(Codex 협업) `design-current/`. 이 저장소의 `docs/design/`은 2026-10-21 시점 사본(사진 제외).
- 한글 요약: `docs/01_설계안_2026-10-20.md`, `docs/02_설계안_v2_2026-10-20.md`.
- 진행 단계: 로드맵(`docs/design/docs/06_MVP_ROADMAP.md`) **1단계 완료 + 2단계 전반부(화면 시연) 완료** — 3D·저장·전송은 아직 없음.

## 실행

```bash
npm install
npm test          # vitest, 57 tests
npx tsc --noEmit  # 타입 검사
npm run dev       # 시연 화면 (http://localhost:5173)
```

## 2단계 전반부: 시연 화면 (`src/screens/`)

시작(세션 코드·익명 코드·사례·안내 방식) → 과제 화면(NPC 작업지시서, 12단계 체크리스트, 안전 확인·위험 행동 버튼, 계기 화면, 판독 입력, 기록표, 힌트, NPC 검사) → 결과(실습 결과·기기 저장·온라인 접수 3상태, 요약, 최초/최종 답 표, 연구 기록 payload JSON). 모든 수행은 `runPurpose=demo`, `researchEligible=false`. 피드백은 실제 표시 직후 `feedbackShown` 이벤트로 기록한다.

## 1단계 결과물 (`src/domain/`)

| 파일 | 역할 | 지키는 원칙 |
|---|---|---|
| `judge.ts` | 차량 판정 `calculateVehicleVerdict` | 기준값 없으면 8/20/50을 넣지 않고 판정 불가. 음수·0 축중·비유한수·미지정 축은 입력 오류. 절사(1자리) 정책으로 비교, 경계값 포함 |
| `grading.ts` | 응답 채점 `createResponseSheet / submitAnswer / summarizeResponses` | 최초 답은 덮어쓰지 않음. 미입력은 null. 정수 입력 정책. `judgmentCorrect`는 최초 판정 기준. 분모 6 고정 |
| `taskEngine.ts` | 단계 전이·안전 인터록 `createTaskRun / attempt / submitResponse / requestHint` | 선행 안전 조건 → 선행 단계 → 응답 요구 순으로 검사. 안전 위반과 학습 오류 분리, 같은 actionId 1회 집계. 힌트는 요청만. 이벤트 200개 한도 |
| `npcInspection.ts` | 최종 수행 검사 `inspectPerformance` | 차량 판정·최초 정오와 별개. 불량 차량을 정확히 판정하거나 보완 정답이면 통과. 이전 오류 보존 |
| `record.ts` | 기록 payload `buildRecordPayload` | `record.schema.json` 1.0.0 형식. 전송 상태 미포함. `researchEligible`은 승인 4종·research·completed·passed일 때만 |
| `types.ts` | 승인 과제 데이터 형식 | `docs/design/contracts/task.schema.v1.1.0-proposal.json` 대응 |

승인 과제 데이터: `src/data/tasks/task.braking-force.case-lv1.json`(양호 240/200/600 kg), `case-lv2.json`(편제동 불량 250/190/600 kg). 교사 확인 0A(2026-10-21).

## 아직 없는 것

3D(three.js), IndexedDB 저장·새로고침 복원, Apps Script 전송·접수번호, 교사 설정, 배치 좌표(실측 진행 중). 2단계 후반부부터.
