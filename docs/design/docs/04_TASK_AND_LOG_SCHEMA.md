# 04 과제·판정·연구기록 데이터 계약

작성일: 2026-10-16 · 설계 계약 v0.1 · `schemaVersion=1.0.0`은 검토용 첫 계약이며 구현 전 확정한다.

## 1. 교사가 알아야 할 원칙

과제 설명, 작업 단계, 안전 조건, 장비 배치, 제시 측정값, 판정 기준을 데이터로 분리한다. **수치가 비어 있으면 정답을 만들지 않는다.** 학교에서 사용하는 차량·시험기·정비지침서와 교사 확인을 거쳐야 공식 수업용 설정이 된다.

연구기록은 ① 확정 후 바꾸지 않는 수행 내용 `recordPayload`, ② 저장·전송하면서 바뀌는 상태 `deliveryEnvelope`로 나눈다. 재전송할 때 내용까지 바뀌면 같은 기록인지 확인할 수 없으므로 전송 상태는 수행 내용의 해시에서 제외한다. 해시는 같은 내용인지 비교하기 위한 지문이며, 학생 신원을 증명하는 서명은 아니다.

기계가 읽을 수 있는 검토용 계약은 [contracts](../contracts/record.schema.json), 설정 예시는 [examples](../examples/task.unapproved.json)에 둔다. JSON Schema는 필드·자료형을 검사하며, 실제 정비기준의 적합성이나 IRB 승인을 판단하지 않는다.

## 2. 데이터 파일과 관계

| 종류 | 핵심 필드 | 책임 |
|---|---|---|
| 과제 정의 | `taskId`, `taskDefinitionVersion`, `steps`, `measurement`, `ruleset`, `feedback` | 절차·측정·판정의 뜻 |
| 공간 배치 | `layoutVersion`, `layoutConfirmed`, 기준점·치수·`equipment` | 실제 학교의 장비 위치·방향·접근점 |
| 세션 스냅샷 | `sessionCode`, `sessionSnapshotId`, `classConditionCode`, 과제/기준/배치/운영 정책 버전, `difficultyMode`, `runPurpose` | 교사가 공개한 수업 조건을 고정 |
| 수행 초안 | `recordId`, 현재 단계, 응답, 이벤트, 버전, 누적시간 | 진행 중 자동저장·복원 |
| 확정 수행 | `recordPayload` | 요약과 의미 이벤트의 정본 |
| 전송 상태 | `deliveryEnvelope` | 선저장 확인·재전송·서버 접수 |

과제·기준·측정세트·배치·세션·연구 프로토콜·피드백 정책 버전은 `sessionSnapshotId`로 묶어 **수행 시작 시 고정**한다. 설정이 바뀌어도 이미 시작한 수행을 새 기준으로 재채점하지 않는다. 과거 버전 스냅샷 또는 내용 해시와 해당 불변 파일을 보관해 재현할 수 있어야 한다. 새 분석 규칙으로 재계산한 자료는 파생 분석으로 구분한다.

## 3. 과제와 단계

MVP `taskId`는 기존 ID와 연결되는 `braking-force`이다. 기존 다섯 개의 요약 절차 문자열을 그대로 상호작용 단계로 사용하지 않는다. NCS 절차와 실제 시험기 지침을 검토하여 승인된 안전·작업 단계를 구성한다.

| 단계 필드 | 의미 |
|---|---|
| `stepId` | 표시 문구가 바뀌어도 유지되는 고유 ID |
| `instruction` | 학생에게 보여줄 행동 설명 |
| `equipmentId` | 실제 배치의 장비 참조 |
| `prerequisites` | 먼저 완료해야 할 단계 ID |
| `requiredSafetyConditions` | 장비 작동 전에 참이어야 하는 안전 조건 ID |
| `actionType` | 지원하는 공통 행동, 예: `confirm`, `inspect`, `operate`, `read`, `submit` |
| `completionCondition` | 완료를 결정하는 승인된 규칙 ID |
| `onBlockedFeedbackKey` | 차단 이유·위험·복구 행동을 담은 피드백 참조 |
| `source` | 문서명·인쇄쪽수·PDF페이지·교사 확인 상태 |

안전 인터록은 위험한 작동을 선행 조건이 충족될 때까지 막는 장치다. 화면의 안전수칙 ‘읽음’만으로 모든 인터록이 충족된 것으로 보지 않는다. 실제 장비의 모든 위험을 시뮬레이터가 재현한다고 주장하지 않는다.

지원 연산과 `actionType`은 개발자가 검증한 목록만 허용한다. 데이터에 자바스크립트 식을 넣거나 `eval`로 실행하지 않는다. 기존 연산을 쓰는 새 과제는 데이터 중심으로 추가할 수 있으나, 새로운 장비 동작·측정 방식에는 새 코드와 검증이 필요하다.

`requiredResponseItems`에는 필수 판독·계산·판정의 `itemId`, `kind`, `unit`, `gradingRuleId`, `answerTolerance`, `precisionPolicyRef`를 고정한다. MVP 항목 후보는 left/right/axleWeight 판독 3개, deviation/sum 계산 2개, vehicleCondition 판정 1개이며 교사가 확정한다. 추가·삭제는 과제 버전 변경이다. 채점 연산은 등록 목록(decimalExact/absoluteTolerance/vehicleVerdictMatch 등)을 검증하고, 허용오차 채점에는 승인된 `answerTolerance`를 명시한다. 추정 오차를 자동 대입하지 않는다.

## 4. 미승인 과제 예시

다음은 **형식 예시이며 실행 가능한 공식 수업 설정이 아니다**. `null`과 `pending`을 임의의 수치로 바꾸지 않는다. 전체 예시는 [task.unapproved.json](../examples/task.unapproved.json)에 있다.

```json
{
  "schemaVersion": "1.0.0",
  "taskId": "braking-force",
  "taskDefinitionVersion": "0.1.0-draft",
  "title": "제동력 측정 및 판독",
  "approvalStatus": "pending",
  "measurement": {
    "measurementSetVersion": "unapproved",
    "sourceType": "teacherApprovedCase",
    "unit": null,
    "caseId": null,
    "left": null,
    "right": null,
    "axleWeight": null,
    "axlePosition": null
  },
  "ruleset": {
    "rulesetVersion": "unapproved",
    "approvalStatus": "pending",
    "deviationMaxPercent": null,
    "sumMinFrontPercent": null,
    "sumMinRearPercent": null,
    "decisionPrecision": null,
    "sourceDocument": null,
    "sourcePage": null,
    "approvedAt": null
  }
}
```

`teacherApprovedCase`는 앞으로 교사가 확인할 사례의 종류를 뜻한다. 현재 사례가 이미 승인되었다는 뜻이 아니며 `approvalStatus`로 구분한다. 개발용 임의 사례를 쓰면 `runPurpose=demo`와 `researchEligible=false`를 강제한다.

## 5. 측정·계산·판정 계약

### 5.1 제시값과 학생 응답

측정값은 **교사가 승인한 사례 세트**를 우선 사용한다. `caseId`와 `measurementSetVersion`을 남겨 같은 제시값을 재현한다. 첫 MVP는 실제 차량 거동을 물리적으로 계산해 제동력을 생성하지 않는다. 무작위 사례를 도입한다면 사례 분포·동등성·시드 정책을 연구자가 먼저 정한다.

`measurementInputs`는 판독 응답이고, `calculationAnswers`는 편차·합의 계산 응답이다. 계산 항목에는 `itemId`, `unit`, `computedReferenceValue`, `firstInput`, `firstCorrect`, `finalInput`, `finalCorrect`를 둔다. `unit`은 이 과제에서 승인된 백분율 단위이며, `computedReferenceValue`는 승인된 원본값·수식으로 계산한 비교 기준이다. 최초/최종 계산 답도 반드시 보존한다.

`measurementInputs`의 각 항목에는 `itemId`, `unit`, `presentedValue`, `firstInput`, `firstCorrect`, `finalInput`, `finalCorrect`가 있다. 학생이 제출한 숫자 문자열과 실제 숫자 해석을 구분한다. 미입력은 `null`이며 0이나 오답으로 자동 변환하지 않는다. 모든 키 입력을 기록하지 않고 **제출된 응답**만 보존한다. 문법 오류·범위 오류 피드백은 학습사건으로 기록하되 같은 `actionId`를 두 번 세지 않는다.

### 5.2 자료에서 확인된 계산과 채택 조건

NCS 제동장치 정비 `LM1506030327_23v4`의 인쇄 p.99~100(PDF 111~112)에는 축중 대비 좌·우 제동력의 합과 편차 산식이 기재되어 있다. 기존 교과서도 `left`, `right`, `axleWeight`, `position`으로 이를 계산한다. 해당 자료를 참고한 **등록 연산 후보**는 다음과 같다.

```text
axlePercentDeviation = abs(left - right) / axleWeight * 100
axlePercentSum       = (left + right) / axleWeight * 100
```

이는 해당 자료에 적힌 산식의 설명이며, 현행 검사 법규·모든 차량의 판정식을 확정한 것이 아니다. 적용 축과 분모, 제동력·축중의 단위, 기준값, 측정 조건을 교사가 승인해야 사용한다. NCS에 등장하는 8·20·50 등의 숫자를 숨은 기본값으로 넣지 않는다. 판권면은 2025-12-31 발행으로 확인되며, 표기 코드의 `23v4`를 발행연도라고 해석하지 않는다.

필수 검증은 다음과 같다.

- 제동력 좌·우 값은 유한한 수이고 음수가 아니어야 한다. 축중은 유한한 양수여야 한다.
- `axlePosition`은 `front` 또는 `rear`만 허용한다. 알 수 없는 위치를 뒤축으로 간주하지 않는다.
- 제동력과 축중이 같은 힘 단위로 비교되는지 확인한다. `kg` 질량과 `N`·`kN`·`kgf`를 같은 수처럼 나누지 않는다. 변환이 필요하면 출처·변환 규칙을 교사가 승인한다.
- 단위가 다르거나 기준·수식·적용 차량이 미확정이면 `notEvaluable`이다. 실제 측정세트가 잘못된 경우 시스템 설정 문제이며 학생의 불량 판정으로 세지 않는다.
- 학생의 잘못된 판독 입력과 원본 측정세트 오류를 구분한다. 학생 입력 오류는 수정 안내를 주고 원답을 보존한다.

### 5.3 경계값·반올림

`decisionPrecision`에는 비교에 원값을 쓸지 반올림값을 쓸지, 자릿수·반올림 방식을 명시한다. `mode=rounded`면 정수 자릿수와 반올림 방식이 모두 있어야 하며 null은 거절한다. 교사 확정 전에는 `null`이다. 화면 표시 자릿수와 판정 자릿수를 구분하며, 반올림 표시 때문에 학생에게 보이는 값과 판정이 모순되지 않도록 경계에서는 비교 근거를 충분한 자릿수로 설명한다.

규칙은 비교 연산자 `lte`/`gte`와 기준 포함 여부를 명시한다. 기준 직전·동일·직후, 0 분모, 음수, 누락, 미지원 단위, 잘못된 축, 표시 반올림 경계를 테스트한다. 출처를 모르는 허용오차를 임의로 추가하지 않는다.

판정 엔진의 반환은 `status=evaluable|notEvaluable`, 계산값·각 조건 결과·종합 `verdict=pass|fail|null`, 사유 코드이다. ‘데이터가 없어 실패’와 ‘측정 결과가 기준 밖’은 서로 다른 결과다. `vehicleVerdict`는 측정 대상의 양호/불량(`pass|fail|null`), `judgmentCorrect`는 학생의 최초 정오, `npcInspectionResult`는 최종 수행의 통과 여부다. `calculateVehicleVerdict`, `gradeResponses`, `inspectPerformance`의 책임을 분리한다. 예를 들어 불량 사례를 학생이 처음에는 양호라고 답했다가 보완해 정확히 불량으로 판정했다면 `vehicleVerdict=fail`, `judgmentCorrect=false`, 최종 정오 `true`, `npcInspectionResult=passed`가 함께 성립할 수 있다. NPC는 완료 절차·현재 안전조건·최종 응답을 검사하며 이전 오류를 삭제하지 않는다. 치명적 안전사건으로 수행을 종료할지는 교사가 별도 승인한다.

## 6. 안내·실전·보완과 ID

| 필드 | 허용값·의미 |
|---|---|
| `difficultyMode` | `guided`, `unguided`, `timedAssessment`(후속, MVP 비활성) |
| `attemptRole` | `practice`, `primary`, `remediation` |
| `runPurpose` | `demo`, `research` |
| `recordId` | 수행 시작 때 한 번 발급하는 UUID. 초안·확정·재전송에서 유지 |
| `retryOfRecordId` | 새 학습 재수행이 참조하는 최초 수행 ID 또는 `null` |
| `retryCount` | 최초 0, 새 학습 재수행마다 해당 연속 수행의 순번 증가 |
| `npcInspectionCount` | 같은 수행 안에서 NPC 검사를 받은 횟수 |
| `uploadAttemptCount` | 같은 확정 결과의 전송 시도 수. 학습 점수·오류에 포함하지 않음 |

같은 수행에서 보완하여 다시 NPC 검사를 받으면 ID를 유지한다. 결과 확정 후 다시 학습하면 새 ID를 만들고 재수행 관계를 남긴다. 전송 오류 때문에 새 학습 ID를 만들지 않는다. 어떤 수행을 분석에 쓸지는 연구자 확정 사항이며, 가장 잘한 결과나 마지막 결과를 자동 선택하지 않는다.

`judgmentAnswers`는 항목별 `firstAnswer`/`firstCorrect`와 `finalAnswer`/`finalCorrect`를 보존한다. `judgmentCorrect`는 **필수 판정 항목의 최초 확정 응답이 모두 정답인지**를 나타낸다. 하나라도 미응답이면 `null`, 모두 응답했지만 하나라도 오답이면 `false`, 전부 정답이면 `true`이다. 최종 보완 정오는 별도 필드다. 무안내에서도 안전 경고와 설명적 오류 피드백은 유지하되, 즉시 피드백이 이후 답에 미친 영향을 첫 응답·피드백 이벤트로 구분한다.

## 7. 필수 연구필드 사전

| 필드 | 자료형·정의 |
|---|---|
| `schemaVersion` | 문자열. 기록 계약 버전 |
| `recordId` | UUID 문자열 |
| `anonymousStudentCode` | 배부 코드. 기본 형식 예시는 `A-01`; 실제 regex와 범위는 세션 설정으로 승인 |
| `classConditionCode` | 연구조건 코드. 학급 실명·실험조건의 대응표는 앱 밖에서 관리 |
| `sessionCode` | 교사가 공개한 수업 단위 코드 |
| `taskId` | MVP는 `braking-force` |
| `difficultyMode` | 위 허용값 |
| `startedAt`, `completedAt` | 단말이 남긴 UTC ISO 8601 시각. 업로드 시각과 분리 |
| `durationSeconds` | 활성 학습시간 누적. 업로드 대기·숨김·새로고침 공백 제외 |
| `stepEvents` | 아래 의미 이벤트 배열. 분석 요약에서는 별도 표로 분리 |
| `errorCount`, `errorTypes` | 중복 actionId 제거한 비안전 학습오류 총수와 유형별 수 |
| `safetyViolationCount`, `safetyViolationTypes` | 위험 행동 시도 차단을 포함한 안전사건 수와 유형별 수. 일반 오류에 중복 합산 안 함 |
| `hintCount` | 학생 요청 힌트 수. 자동 안내 노출 제외 |
| `measurementInputs` | 항목별 제시값·단위·최초/최종 판독값과 정오 |
| `judgmentAnswers`, `judgmentCorrect` | 최초/최종 판정과 최초 종합 정오 |
| `npcInspectionResult` | `passed`, `needsCorrection`, `notCompleted` |
| `retryCount` | 학습 재수행 순번. 전송 횟수와 분리 |
| `clientAppVersion` | 실제 배포 버전 |
| `localSaveStatus` | **deliveryEnvelope**의 `unpersisted`, `saved`, `failed` |
| `uploadStatus` | **deliveryEnvelope**의 아래 6개 상태 |
| `uploadedAt` | **deliveryEnvelope**. 정상 ack의 서버 `acceptedAt`을 복사, 미확인 `null` |
| `receiptId` | **deliveryEnvelope**. 서버가 반환한 접수번호, 미확인 `null` |

추가 필수 맥락은 `attemptRole`, `retryOfRecordId`, `runPurpose`, `researchEligible`, `sessionSnapshotId`, `configurationApproval`, `displayMode`, `experiencedDisplayModes`, `completionStatus`, `versions`, `timing`, `npcInspectionCount`, `calculationAnswers`, `vehicleVerdict`이다. `versions`에 `taskDefinitionVersion`, `rulesetVersion`, `measurementSetVersion`, `layoutVersion`, `judgeEngineVersion`, `sessionConfigVersion`, `researchProtocolVersion`, `feedbackPolicyVersion`을 넣는다. `configurationApproval`은 `taskApproved`, `rulesetApproved`, `layoutConfirmed`, `researchUseApproved`를 포함한다. 모두 충족하고 승인된 수행·지원 정책에 맞을 때만 연구 적격 후보가 되며, 이 플래그는 실제 IRB·동의 확인을 대체하지 않는다. `runPurpose=research` 자체가 내용·배치·연구 운영 허용을 모두 요구한다. 연구 수행이 중단되어 `researchEligible=false`인 경우에도 이 승인 조건은 유지한다. 승인 없는 시연은 `runPurpose=demo`만 허용한다. `completionStatus=completed`는 NPC `passed` 및 검사 횟수 1회 이상인 완료만 뜻한다. 명시적 중단은 `aborted/notCompleted`로 확정한다. `completionStatus`는 `completed|aborted`, `displayMode`는 시작 모드(`threeD|diagram`), `experiencedDisplayModes`는 실제 경험한 모드 목록이다. 모드 변경은 아래 이벤트로 구분한다.

`timing`에는 `pauseCount`, `resumeCount`, `timeQuality=continuous|resumed|uncertain`을 기록한다. 페이지가 보이는 구간의 단조시간을 누적하며, 벽시계 변경이나 강제 종료로 신뢰하기 어려우면 `uncertain`이다. 무조건 `completedAt-startedAt`으로 산출하지 않는다. 평가용 제한시간과 공정성 정책은 후속 설계다.

가명 코드 형식 검사로 본인 확인까지 된 것은 아니다. 자료 연결 범위는 최소 세션·연구조건을 포함하며, 같은 코드만 보고 다른 수업의 결과를 합치지 않는다. 학생 이름·이메일·전화번호·학번 원본, IP·기기 지문을 연구 payload에 넣지 않는다.

## 8. 이벤트와 지표

이벤트는 `eventId`, `sequence`, `elapsedMs`, `type`, 선택적 `stepId`, `actionId`, `reasonCode`, `itemId`, `feedbackKey`, `feedbackKind`, `fromDisplayMode`, `toDisplayMode`로 구성한다. 허용 유형은 `taskStarted`, `stepCompleted`, `actionBlocked`, `answerSubmitted`, `hintRequested`, `feedbackShown`, `npcInspected`, `paused`, `resumed`, `displayModeChanged`, `taskFinalized`이다. 답의 실제 내용은 요약의 최초/최종 항목에 두고 필요 이상으로 반복하지 않는다. 좌표 경로·모든 클릭·키 입력·마이크·영상은 기본 수집하지 않는다.

`sequence`는 1부터 증가한다. 사건의 중복 저장은 `eventId`로 제거하고, 오류·안전 등 같은 행동의 중복 집계는 `actionId`로 제거한다. 하나의 행동에서 응답과 피드백 등 여러 정당한 사건이 생길 수 있다. `feedbackShown`은 HTML 피드백이 실제 표시된 직후 `feedbackKind=safety|explanatory|hint|guidance`와 key·대상 항목·경과시간을 기록한다. 학생이 읽거나 이해했다는 증거로 쓰지 않는다. `displayModeChanged`는 시작·도착 모드와 사유를 포함한다. 단계마다 매 프레임 로그를 남기지 않는다. 새로운 물리적 시도만 새 actionId를 가지며 UI 연타 차단과 연구 오류 집계를 혼동하지 않는다.

| 지표 | 집계 규칙 |
|---|---|
| 비안전 오류 | 승인된 오류 유형의 `actionBlocked` 또는 잘못된 제출 사건, 동일 actionId 한 번 |
| 안전 위반 | 안전 사유 코드로 차단된 새로운 행동 시도, 일반 오류와 분리 |
| 힌트 | `hintRequested`만 집계 |
| 최초 정답률 | `firstCorrect=true`인 필수 응답 수 / 필수 응답 수. 미응답 수를 함께 표시 |
| 최종 정답률 | `finalCorrect=true`인 필수 응답 수 / 필수 응답 수. 최초 정답률을 대체하지 않음 |

필수 응답 수는 과제 버전의 판독(`measurementInputs`)·계산(`calculationAnswers`)·판정(`judgmentAnswers`) 항목을 중복 없이 합산하여 고정한다. 채점 불가능한 설정은 0점이 아니라 `null/notEvaluable`이다. 미완료·도식전환·힌트 사용 자료의 분석 포함 여부는 연구자가 정한다. 시간·안전 감점을 포함한 임의의 100점 총점은 만들지 않는다.

배치 계약은 방 크기 외에 `boundary`(외곽 다각형), `doors`, `columns`, `safetyAisles`, 장비 `size`·`accessPoints`·`surveyReference`를 포함한다. 실제 배치 확정은 좌표만 채웠다는 뜻이 아니라 출입구·통로·작동 장비 접근점과 교사 검토까지 충족한 상태다. 미측정은 null/빈 목록, 실측 후보는 비공개 검토 초안으로 보관한다.

요약 CSV와 이벤트 CSV는 분리하고 `recordId`로 연결한다. 서버에서는 크기가 작은 원본 payload를 한 정본 행에 저장하고 요약·이벤트 표를 재생성한다. 초기 제안 상한은 **정규 payload 32 KiB(UTF-8), 전체 POST 48 KiB, 의미 이벤트 200개**다. Google의 보장치가 아니며 실제 셀·계정·부하 시험 후 조정한다. 초과하면 의미 사건을 몰래 자르지 않고 수집·전송 문제를 표시하여 원본을 기기에 보존하고 교사 확인을 요청한다.

## 9. 전송 계약과 정규화

```text
POST /api/submissions
request  = { protocolVersion: "1", payload: recordPayload }
success  = { protocolVersion: "1", ok: true, recordId, receiptId,
             acceptedAt, payloadHash, duplicate }
failure  = { protocolVersion: "1", ok: false, code, retryable, recordId? }
```

정규화는 [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)에 맞춘 JCS JSON의 UTF-8 바이트에 SHA-256을 적용한다. 수신 서버도 검증된 같은 payload로 재계산한다. 중복 키·미지원 필드·비유한 수·잘못된 Unicode를 거절하며, JSON 키 순서·공백만 다른 payload는 같은 해시를 갖는다. 정규화 뒤 문자열을 NFC/NFD로 임의 변경하지 않는다. 숫자 정밀도가 필요한 원답은 문자열로 보존한다. 검증 과정에서 값을 고친 뒤 몰래 수락하지 않으며 정상 입력 계약을 벗어나면 이유와 함께 거절한다.

브라우저·중계·Apps Script의 JCS 구현을 공식 테스트 벡터와 한글·소수·배열 예제로 맞춘다. 이번에는 실제 JCS 코드나 종단간 해시 실행을 검증하지 않았다. 이 규약은 데이터 동일성 비교용이고 클라이언트 점수가 부정행위 없이 만들어졌다는 증명은 아니다.

| `uploadStatus` | 뜻 | 다음 행동 |
|---|---|---|
| `pending` | 저장됨, 아직 접수 확인 전/미도달 | 전송 시도 |
| `uploading` | 현재 시도 중 | 중복 UI 동작 잠금 |
| `confirmationPending` | 서버 접수 여부를 모름 | 같은 ID·내용으로 확인 재전송 |
| `acknowledged` | 같은 ID·hash의 정상 receipt 확인 | 접수번호와 시각 표시 |
| `rejected` | 유효성·허용범위 오류 등 자동 재시도 불가 | 원본 보존·교사 점검 |
| `conflict` | 같은 ID인데 내용이 다름 | 덮어쓰기·새 ID 우회 금지, 조사 |

`acknowledged`가 되어도 payload는 바꾸지 않는다. `localSaveStatus`는 로컬 트랜잭션 결과이며, 전송 성공을 뜻하지 않는다. 완료 기록과 전송 상태를 같은 로컬 트랜잭션으로 최초 저장하고, 네트워크 작업은 그 트랜잭션 밖에서 수행한다.

## 10. CSV 계약

요약 CSV에는 원 필드명과 버전을 보존하고 `recordId`, `schemaVersion`, 세션/조건/학생 코드, 과제/기준/배치 버전, 모드, 수행역할, 시각·시간품질, 최초/최종 지표, 안전·힌트·오류, 완료·접수 상태를 포함한다. 복수 측정·판정 항목은 별도 긴 형식 CSV로 `recordId`+`itemId`를 키로 내보낸다. 이벤트 CSV는 `recordId`+`eventId`+`sequence`를 포함한다.

UTF-8, 고정 헤더, 쉼표·따옴표·개행을 이스케이프한다. 사용자 입력을 스프레드시트 수식으로 실행하지 않도록 내보내기와 시트 기록 경로를 검증한다. 표시에 필요한 텍스트 처리가 원본 payload 해시를 바꾸면 안 된다. 온라인 결과와 CSV를 합칠 때 `recordId`로 중복을 제거하고, 같은 ID 다른 내용은 충돌 목록으로 보낸다. CSV는 미전송 기록을 다른 학생에게 공개하는 전체 목록 기능이 아니다.

## 11. 필수 검증표

- 승인 전 과제 예시는 스키마 형식 검사를 통과하되, 별도 readiness 검사에서 공식 수업 진입이 거절되어야 한다.
- 형식이 맞아도 기준·출처·단위·배치 승인이 없으면 `researchEligible=true`를 만들지 않는다.
- `judgmentCorrect=false`인 첫 응답을 보완 통과가 `true`로 덮어쓰지 않는다.
- 초안 복원·다음 학생 전환·이전 outbox 전송이 다른 코드·버전·응답을 섞지 않는다.
- 같은 ID/같은 payload 재전송은 같은 receipt, 다른 payload는 충돌이다.
- JCS·hash·32 KiB·48 KiB·200개 한도는 실제 구현에서 경계 시험한다. 문서와 JSON 형식 검사만으로 동작을 증명하지 않는다.

## 12. 현장자료 반영 계약 개정 — 2026-10-21 결정

P-1 usagePhase,P-2 kg,P-3 기재값 판정,P-4 openings를1.1.0에 채택했다. 정확한 필드·적용 범위·구버전 보존·검증 책임은 [16 계약 결정](16_CONTRACT_1_1_DECISIONS_AND_COMPATIBILITY.md)이 정본이다.

| 항목 | 현행 표현 |
|---|---|
| 사용 시점 | record.usagePhase=preview/review/other. difficultyMode·attemptRole과 별도 |
| 학교 표기 | task.measurement.unit에kg 허용. inputsIntegerOnly는 측정 입력 정책 |
| 기재값 비교 | ruleset.judgmentValueSource=written,기존 decisionPrecision은 rounded/1/truncate |
| 개방 연결 | layout.openings의 시작·끝 좌표/연결 구역. 승인 시 doors 또는 openings가 하나 이상 |
| 부분 실측 | layout.siteMeasurements 원장. 미확정 벽을equipment/가짜boundary로 만들지 않음 |
| 등록 연산 | vocabularyVersion=1.1.0과 [정의 사전](../contracts/task-vocabulary.v1.1.0.json). 코드 실행 검증은 미실시 |

교사 수치·단계 확인과 정식 과제 운영승인을 구별한다. 두 사례는 [13 검토](13_TASK_DATA_REVIEW_AND_VOCABULARY.md)의 기술 항목이 남아 top pending을 유지하고,ruleset 교사 확인은 날짜로 보존한다. 무안내 답 노출은 제안 feedbackPolicy로 제한하고 안전 경고는 즉시 표시한다. 세부 계약 실행은 아직 구현하지 않았다.
