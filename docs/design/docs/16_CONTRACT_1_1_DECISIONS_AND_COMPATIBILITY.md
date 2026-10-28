# 16. 계약 1.1.0 결정과 호환 정책

> **2026-10-28 변경:** 이 문서의 일부 조항은 [20 면담 결정 변경 기록](20_2026-10-28_면담결정_변경기록.md)으로 대체되었다. 충돌하면 20번 문서를 따른다.

> **2026-10-26 버전 안내:** 이 문서는 1.1.0 도입 결정의 보존 기록이다. 현행 task·vocabulary는 1.2.0, 새 session-snapshot은 1.0.0이며 [17 개정 결정](17_U_ITEMS_CONTRACT_REVISION_2026-10-26.md)을 함께 읽는다. record/layout/submission1.1.0·delivery1.0.0과 §4의 과거 기록 무변경·버전별 수신 원칙은 유지한다.

2026-10-21 · Codex 설계·계약 검토 · 앱 구현·제출 실행·운영 승인 아님

이 문서는 [Claude 요청](../../collaboration/CLAUDE_TO_CODEX_2026-10-21.txt)의 네 작업에 대한 기술 결정을 고정한다. 교사가 확인한 값은 [0A 원문](../../collaboration/teacher-check-0A.json)에 보존한다. 원자료 스냅샷의 과거 미확정 문장보다 이 결정과 새 교사 응답을 우선하되, 실제 장비 동작·연구 승인으로 확대하지 않는다.

## 1. 네 제안의 결정

| 제안 | 결정 | 정식 계약과 의미 |
|---|---|---|
| P-1 사용 시점 | 채택 | record 1.1.0에 필수 `usagePhase=preview|review|other`. 안내/무안내인 `difficultyMode`,연습/주수행/보완인 `attemptRole`과 별도 축이다. 학생 이동 경로나 실제 실습 성공의 증거가 아니다. |
| P-2 kg 표기 | 채택 | task 1.1.0은 `kg`를 허용한다. 교사 고정 사례의 학교 표기를 보존하며 kgf/N으로 자동 환산하지 않는다. ratio 계산은 같은 단위로 승인된 세 수치에만 적용한다. `inputsIntegerOnly=true`는 판독 입력 정책이고 계산 답변까지 정수로 제한하지 않는다. |
| P-3 절사·비교 | 채택 | 기존 `decisionPrecision={mode:rounded,digits:1,rounding:truncate}` 구조 유지. `judgmentValueSource=written`을 ruleset의 필수 필드로 추가해 기재값으로 판정함을 명시한다. 중간 계산은 원값,최종 산출값은 소수 첫째 자리 절사. 다른 설정은 `raw`를 명시해야 한다. |
| P-4 개방 연결부 | 채택 | layout 1.1.0에 `openings` 추가. 승인 배치는 `doors` 또는 `openings` 중 하나 이상을 가져야 한다. 문 없는 섀시 구역에 가짜 문을 만들지 않는다. |

새 필수 필드 때문에 1.0.0에 새 값을 몰래 끼우지 않는다. 1.1.0은 별도 데이터 버전이며 명시적 생성/검토가 필요하다. 이 결정은 계약 표현의 채택이지 사용자 대신 ‘구현 시작’을 승인한 것이 아니다.

## 2. 정밀도·등록 규칙

`judgmentValueSource`는 비교할 수치의 출처,`decisionPrecision`은 기재/비교값을 만드는 정밀도다. `written`이면 먼저 승인된 정밀도로 기재값을 만들고 그 값에 ≤8·≥20 등의 경계 포함 비교를 한다. 단순 이진 부동소수 곱셈 오차로 경계가 뒤집히지 않게 향후 엔진은 십진 또는 정확한 유리수 규칙을 사용한다. 이 검토의 유리수 계산은 참고 검산이며 앱 판정 엔진이 아니다.

사전 [task-vocabulary.v1.1.0.json](../contracts/task-vocabulary.v1.1.0.json)은 완료·채점·정밀도·안전·계산 이름의 뜻과 허용 상태를 정의한다. `vocabularyVersion=1.1.0`을 과제에 고정한다. Schema는 등록 이름을 enum으로 제한하고,참조·선행 그래프·응답 종류 조합은 별도 의미검사로 검증한다. `teacherApprovalRequired`는 pending 차단 예시에만 허용한다. `eval`이나 사용자 수식 문자열 실행은 허용하지 않는다. 사전의 `implementationVerification=notPerformed`를 유지하며 실제 연산 등록/동작 시험 완료라고 부르지 않는다. 향후 세션 스냅샷에 task/ruleset/vocabulary 버전과 해당 정본 hash를 함께 고정한다. 등록된 이름이라도 현재braking-force의항목별taskBindings와다른조합은거절한다. 예비absoluteTolerance를실제로사용할때는과제·사전버전과항목매핑을함께개정해야한다.

교사 규칙 확인은 날짜만 있으므로 `ruleset.approvedOn=2026-10-21`,`approvedAt=null`로 보존했다. 00:00:00 승인 시각은 생성하지 않는다. 1.1.0의 approved ruleset은 실제 승인일 또는 실제 시각을 요구한다. 과제 전체는 표시 고정 동작·안전 하위행동 매핑이 남아 `approvalStatus=pending`이다. 이는 교사가 확인한 값과 순서를 재질문하라는 뜻이 아니다.

두 사례의 제목은 정답 수치·양호/불량을 지운 중립 제목으로 바꿨다. `feedbackPolicy`는 제안 상태이며 무안내의 정답 관련 피드백을 모든 최초 응답 저장 뒤에만 노출하도록 명시한다. 안전 경고는 즉시 유지한다. 학습 화면에 내부 caseId나 전체 정답 포함 task JSON을 그대로 출력하지 않는다. 상세 검토는 [13](13_TASK_DATA_REVIEW_AND_VOCABULARY.md)에 있다.

차량 진입 방향은 사례 수치에 고정하지 않고 장비 세팅을 가진 세션 설정에서 선택한다. 위치/진입 연출을 할 때 명시 선택이 필요하며 기본 북쪽 진입을 승인값으로 만들지 않는다. 순수 계산·판정 검증은 진입 방향 없이 가능하다. 선택은 `sessionSnapshotId`와 세션 버전에 묶는다.

## 3. openings와 부분 실측

`openings[]`는 `openingId`,`start{x,z}`,`end{x,z}`,`connectsTo`,`surveyReference`를 가진다. 단위는 layout 좌표계의 m다. 미승인 구간은 null 끝점을 허용한다. `layoutConfirmed=true`에서는 양끝의 수치·연결 구역 이름·근거가 필요하다. 별도 의미검사는 같은 ID,길이 0,양끝이 실제 외곽의 동일 변에 놓이는지,출입 가능성과 교사 동선 확인을 검사해야 한다. 이번 도구는 ID중복·길이0까지 검사하며 외곽 위상/통행안전은 구현 전 검토 항목으로 남긴다.

벽의 한쪽 거리만으로 유한 벽 선분이나 닫힌 다각형을 만들 수 없다. [1.1 부분 실측 사본](../examples/layout.partial-survey.v1.1.json)은 `boundary=[]`를 유지하고 벽의 가짜 equipment 행을 제거했다. 새 `siteMeasurements[]`에 원문 값·측정 기준점·단위·출처 종류·확인 상태·원문 참조를 기록한다. 거리 값은 음수가 아니고,별도의 `derivedConstraint`는 북쪽 z=-8.20처럼 부호 있는 축 제약이다. 제약은 벽의 끝점이 아니다.

출처 종류 `reportedMeasured/reportedSpecification/assumption`은 사용자 제공 실측 텍스트·전달된 제원·가정을 구분한다. `accepted/referenceUnclear/unresolved`는 값 또는 기준점의 검토 상태다. 이는 현장 원본 사진/기록지를 직접 확인했다는 표시가 아니다. 전체 `sourceStatus=surveyed`만으로 모든 값의 실측·승인을 주장하지 않는다.

롤러 기준점과 장비 외곽 중심의 일치는 확인되지 않아 공식 equipment 중심 x/z를 null로 되돌리고 치수는 측정 원장에 남겼다. 토 측정 북쪽3.50의 대상 기준점과 ABS10.00의 양끝도 미확정으로 분리했다. 원문 숫자는 고치지 않았다. 2.00/3.00/1.30의 실제 겹침이나 10.00의 오기는 단정할 수 없다. [14](14_PARTIAL_SURVEY_REVIEW.md)의 두 확인 질문과 v2 도형 주의사항을 따른다.

## 4. 버전별 보존·수신

- 정식 현행: record/task/layout/submission 1.1.0. delivery는 변경이 없어1.0.0 유지. ack와 `protocolVersion=1`의 필드 모양도 그대로다.
- [schema-index.json](../contracts/schema-index.json)이 버전별 검증기 선택의 기준이다. [legacy 계약](../contracts/legacy/1.0.0/)과 [legacy 예시](../examples/legacy/1.0.0/)에 기존1.0.0 파일을 그대로 보존했다.
- 제출1.1.0은 record1.0.0과1.1.0을 버전별로 검증한다. 지원하지 않는 버전은 거절한다. 이 수신 설계는 서버 구현 완료라는 뜻이 아니다.
- 이미 freeze된1.0.0 기록은 `usagePhase`를 추정 추가하지 않는다. 원래 바이트/의미 payload와 원래 hash/ID로 재전송한다. UI/분석에서 사용 시점은 ‘수집하지 않음’으로 별도 표시한다.
- 현행 examples는1.1.0으로 새로 작성했고,보관한1.0.0 예시는 삭제하지 않았다. 두 교사 과제와 부분 실측의 검토 전 사본은 [review-inputs](review-inputs/2026-10-21/)에 보존했다.
- proposal 파일은 과거 제안 스냅샷이며 정식 검증기에서 로드하지 않는다. 1.1.0을 사용할 때 `task.schema.json`과 고정된 사전을 읽는다.

## 5. 제출 시험과 다음 단계

[15](15_DIRECT_SUBMISSION_TEST_DESIGN.md)는 직접 호출의 입력/출력,ScriptLock·정본1행·JCS 재계산,공개 수신의 한계와 학교 계정 정책을 설계한다. 시험은 전부 NOT_RUN이다. 문서에는 최소7개 시험 묶음과 상세12개 사례를 연결했다. 브라우저에서 실제 ack를 읽고 정본/receipt/hash를 대조하기 전에는 직접 제출 성공이라고 기록하지 않는다. 중계 비밀 규칙은 중계 배포에만 적용한다.

다음 한 단계는 Claude가 이 검토에서 드러난 데이터 연결을 반영한 **0D 미확정 항목 목록과 수신 계약 정합 검토**를 하는 것이다. 앱 구현 착수,계정 설정,외부시험 실행,배포는 사용자의 별도 요청 범위다. 신규 동작 매핑을 확인하지 못하면 차단/미확인 상태를 검증할 설계를 세우며 가짜 성공을 만들지 않는다.
