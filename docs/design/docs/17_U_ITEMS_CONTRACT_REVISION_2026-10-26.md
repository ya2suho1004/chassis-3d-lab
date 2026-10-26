# 17. U 항목 계약·사전 개정 결정 — 2026-10-26

근거는 `../../collaboration/CLAUDE_TO_CODEX_2026-10-26_U-ITEMS.txt` §4, `teacher-check-0E.json` 및 프로젝트 HEAD `1457bac82bdcd669338b98d19f6a858e6386a8b8`다. 0E의 checkedAt은 날짜이므로 승인 시각·승인자 이름을 만들지 않는다. U1은 ‘장비 수리 후 확인’이라는 인수 지침과 `fixingAction=unknown/readInstruction=keep`을 함께 보존한다. 0A 수치·단계·안전 6조건을 다시 묻지 않는다.

## 1. 버전과 보존

| 대상 | 현행 | 이유 |
|---|---|---|
| task.schema, vocabulary | 1.2.0 | 새 사전 등록·고정 vocabularyVersion의 의미 변경을 기존1.1.0과 구별 |
| 과제 정의 | `1.2.0-review-case-1-2026-10-26`, `...case-2...` | U2·U3·U7·U8의 개별 교사 승인 반영, 전체 pending |
| session-snapshot | 새 독립 계약 1.0.0 | 이전에는 정식 세션 Schema가 없었음. catalog1.2.0과 wire 버전은 별개 |
| sessionConfigVersion | `1.2.0-design-2026-10-26` | 방향 필드가 있는 새 설정의 예시 버전 |
| feedbackPolicy.version | `1.1.0-design-approved-2026-10-26` | 0E·프로젝트 사본과 정확히 일치 |
| record / layout / submission | 각 1.1.0 유지 | 새 record 필드·전송/receipt 형태 변경 없음 |
| delivery / protocolVersion | 1.0.0 / 문자열 `1` 유지 | 전송 상태 분리·접수 규칙 유지 |

기존 contracts의 5개 Schema·사전·schema-index와 examples 6개(부분 실측 포함)를 각각 `contracts/legacy/1.1.0/`, `examples/legacy/1.1.0/`에 바이트 그대로 보존했다. 개정 전 교사 과제2개는 `docs/legacy/1.1.0/`, 기존 Python 검증기·결과는 `validation/legacy/1.1.0/`에 보존했다. `task-vocabulary.v1.1.0.json`과 과거 proposal도 변경하지 않는다. recordIngestionVersions는 1.0.0/1.1.0 그대로이며 과거 outbox를 개정·재해시하지 않는다.

새 과제 생성에서는 schemaVersion/vocabularyVersion/taskDefinitionVersion을 함께 고정한다. 앞으로 과제 내용·안전 연결·피드백 문구가 달라지면 taskDefinitionVersion을 새로 발급한다. 피드백 내용·노출 시점·승인 상태가 달라지면 feedbackPolicy.version과 새 수행의 versions.feedbackPolicyVersion도 갱신한다. 별도 `feedbackVersion` 필드를 추가하지 않는다. rulesetVersion·measurementSetVersion은 수치·산식·정밀도가 같아 이번에 바꾸지 않는다.

## 2. P-5: off 하위 행동과 집계

12개 parent stepId와 순서는 그대로다. 사전의 `offSubActions`에 다음을 등록한다.

| 행동 | event stepId | 현재 조건 |
|---|---|---|
| motorOff | `off:motorOff` | 기존 s-ppe; s-exit/s-lift를 선행 요구하여 정지 행동을 막지 않음 |
| liftUp | `off:liftUp` | motorOff 완료·현재 정지(s-exit), 상승 직전 새 주변 확인(s-lift), s-ppe |
| exitVehicle | `off:exitVehicle` | motorOff/liftUp 완료·현재 정지/상승 완료 확인(s-exit), s-ppe |
| off 전체 | `off` | exitVehicle 완료 직후 vehicleExited를 한 번 기록 |

타입은 모두 `stepCompleted`다. `off:` 접두사는 하위 행동 분류에 사용하되 등록된 세 접미사만 의미검증에서 허용한다. parent 완료 수는 task.steps에 있는 고유 stepId만 센다. 따라서 세 하위 행동과 parent off의 이벤트 4개를 12단계에서 4단계로 더하지 않는다. 하위 행동 분석은 `(recordId, parentStepId, action)`별 한 번만 세며 중복 eventId/sequence는 별도로 거절한다. parent off가 없는 기록에서 전체 완료를 추정하지 않는다. 과거 `off`만 있는 기록에 하위 행동을 소급 생성하지 않는다.

record1.1.0의 stepId 문자열(maxLength64)로 표현 가능하다. 이름·선행관계·집계는 사전/의미검증 책임이며, record Schema의 임의 stepId 문자열 허용만으로 의미 적합성을 주장하지 않는다. 정지 명령을 실제 롤러 정지 관측으로 간주하지 않는다. 이번 검토는 프로젝트의 실제 장비 제어·운영 안전 검증이 아니다.

## 3. P-6·P-8: 정식 과제와 승인 피드백

`tire`·`equip`에 `s-engine`을 연결하고 `onBlockedFeedbackKey=blocked_safety_engine`을 사용한다. 안전조건 수는 기존6개 그대로이며 새 일곱 번째 조건이 아니다. 0E U2/U3 승인은 해당 연결과 off 하위 행동에 한정한다.

프로젝트 `src/data/tasks/task.braking-force.case-lv1/lv2.json`의 feedback 10종을 글자 그대로 옮겼다. `wrong_reading.what`은 “입력한 값이 해당 표시값과 다릅니다.”이며 화면 제목의 항목명을 본문 자리표시로 다시 넣지 않는다. `wrong_calc.why`는 편차·합 두 산식을 보존한다. `feedbackPolicy.status=approved`, version은 위 표와 같다. 안전 피드백은 즉시, 무안내 정답 피드백은 여섯 최초 응답을 먼저 일괄 고정한 뒤 제시한다.

이 approved는 0E의 교사 피드백 승인 범위다. 연구 운영 승인·IRB·동의·연구 적격성을 승인하지 않는다. task.approvalStatus=pending, layoutConfirmed=false, researchEligible=false를 유지한다. U8 조치 기재는 비채점 설명으로 확정됐으므로 새 응답·자유 입력 저장·채점·기록 필드를 추가하지 않는다. calc의 기존 instruction도 계약 확장으로 해석하지 않는다.

정식 두 과제와 현재 프로젝트 사본의 차이는 `/schemaVersion`, `/taskDefinitionVersion`, `/vocabularyVersion` 세 곳뿐이다. steps/feedback/feedbackPolicy/teacherReviewReference를 포함한 나머지 JSON 값은 같다. 기존 프로젝트 원본은 legacy task1.1.0으로 검증하고, 교체용 정식 파일은 current1.2.0으로 검증한다. 버전별 선택을 생략해 기존 사본을1.2.0에 넣으면 schemaVersion/vocabularyVersion 상수 불일치로 거절되는 것이 정상이다.

## 4. P-7: 방향을 보관하는 불변 세션 스냅샷

정본은 `contracts/session.snapshot.schema.json`이다. 기존 record의 session/code/condition/task/mode/usagePhase/runPurpose/displayMode/approval/versions 제약을 참조하고, `sessionConfiguration.vehicleEntryDirection=north|south|null`을 필수로 둔다. north/south는 차량이 들어오는 출발 측이며 layout의 방위 기준이다. 차량의 전방·전진/후진·측정 축 rear와 자동 동일시하지 않는다.

생성기의 기본값은 null이다. Schema의 default는 설명이므로 Ajv의 useDefaults/coerceTypes/removeAdditional은 끈다. 생성 단계에서 null을 명시하고, 필드 누락·빈 문자열·다른 방위는 거절한다. null은 ‘미선택’이며 북쪽을 선택했다고 기록하거나 방향 의존 이동을 승인하지 않는다. 가정 미리보기는 명시적 가정 표시로 제한하며 실제 선택/수행 기록으로 바꾸지 않는다.

교사가 세션마다 선택해 불변 스냅샷과 해당 버전 파일을 보관한다. 수행 시작 시 선택된 `sessionSnapshotId`, versions 및 문맥을 로컬 수행에 고정한다. 이후 방향·과제·피드백 정책을 바꾸면 새 snapshotId와 새 설정 버전을 발급해 이후 수행에만 적용한다. 기존 진행 중 수행·확정 기록·재전송 원본은 그대로 둔다. snapshotId는 가명코드나 recordId로 대체하지 않는다.

record에 방향을 복제하지 않는다. 서버는 record.sessionSnapshotId로 보관한 스냅샷을 찾아 sessionCode/classConditionCode/taskId/difficultyMode/usagePhase/runPurpose/displayMode/configurationApproval/versions의 시작 문맥을 대조한다. snapshot의 불변성·ID 유일성·버전파일 존재·승인 진위는 Schema만으로 증명할 수 없으므로 보관/의미검증 책임이다. 지연 재전송도 최초 snapshot으로 검증하고 현재 설정으로 고쳐 수락하지 않는다.

새 `examples/session.demo-snapshot.json`의 UUID 끝 `0005`는 기존 record 예시의 끝 `0004`와 다른 합성 새 스냅샷이다. 예시에서 rulesetApproved=true는 0A 승인 기준, taskApproved=false는 U1 보류를 나타낸다. 기존 record/submission 예시는 기존 snapshotId/버전/false 플래그 그대로 보존했다. 이 합성 예시는 수업 공개·전송 결과가 아니다.

프로젝트의 현재 `src/app/session.ts`는 방향이 달라도 고정 snapshotId를 쓰고 sessionConfigVersion=unapproved이며 taskApproved=true를 고정한다. 계약 파일 교체만으로 새 세션 보관·ID 발급·승인 대조가 구현되는 것은 아니다. 프로젝트 수정은 이번 범위에 없으므로 후속 수정 대상으로 회신에 명시한다.

## 5. P-9: read 고정 동작을 넣을 자리

| 항목 | 현재 보존 | 장비 수리 후 채울 자리 |
|---|---|---|
| read instruction | 기존 문장 그대로 | 최대값 고정에 해당하는 실물 조작 이름·관측 결과를 이 절에 근거와 함께 먼저 기록 |
| completionCondition | `readingsSubmitted` 그대로 | 고정/정지 관측이 판독 제출보다 먼저 필요한지 결정할 후속 매핑 자리 |
| 조작·센서·버튼 ID | 새 이름을 만들지 않음 | 장비 지침/실제 동작 근거를 받은 뒤 task/vocabulary 버전 개정으로 등록 |
| 과제 전체 상태 | pending | 확인만으로 자동 승인하지 않고 적용 버전·검증 범위를 기록 |

현장 근거 없이 METER 버튼·BRAKE 등가·정지/고정 성공 이벤트를 만들지 않는다. 이미 확인된 0A 값·12단계·안전6조건을 다시 질문하지 않는다.

## 6. 검증과 읽기 검토의 경계

Ajv draft2020-12+formats로 원본 스키마를 그대로 검증하며 기본값 추가·형변환·추가 필드 제거를 하지 않는다. 별도 의미검증은 사전 참조·선행 그래프·응답 정밀도/산식·0A 보존·피드백10종 일치·off 집계·session 참조를 검사한다. strict:true의 strictTypes lint와 JSON Schema 적합성은 구별한다. 기존1.1.0 조건부 스키마의 타입 생략으로 strict lint가 실패해도 이를 숨기기 위해 스키마를 변형하지 않는다.

0C 수신점·2차 원장의 지적과 교체 목록은 [회신](../../collaboration/CODEX_RETURN_2026-10-26_U-ITEMS.txt)에 남긴다. Schema 통과는 원장 출처의 정당성·실물 동작·실제 Sheets 날짜 저장·CORS·학교망·연구 승인을 증명하지 않는다. Google/프로젝트 실행·배포·Git push·실제 제출은 수행하지 않았다.
