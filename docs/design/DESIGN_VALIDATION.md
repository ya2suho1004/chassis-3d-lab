# 설계·계약 1.1.0 검증 결과

확인일:2026-10-21 · 로컬 계약 검증이며 앱·접수 API·운영 안전의 실행 검증이 아니다.

## 실행 결과

- Draft2020-12 현행5개와보존1.0.0계약5개를구조검사했다(동일delivery ID를합치면9개ID).
- 최신 실행 **69개 통과 / 실패0개**. 상세항목과실행명령은 [results.json](validation/results.json),[검증기](validation/validate_contracts.py)에있다.
- 최초1.0.0에서새수용사례8개가거절되는것을확인한후개정했다([변경전](validation/results.red.json)). 독립감사에서발견한규칙승인·종류매핑10개구멍도실패를재현한후보완했다([감사재현](validation/results.audit-red.json)).
- 원본인계MANIFEST80개파일SHA-256일치. assets사진44장·스케치1장,evidence/review/design-v0.1포함.
- legacy계약5개·예시5개는design-v0.1과바이트동일. 검토전과제2개/부분실측JSON사본은작업전기록과SHA-256일치.
- NCS원문98~100쪽·14번사진과과제12단계의대조및미해결항목은 [13](docs/13_TASK_DATA_REVIEW_AND_VOCABULARY.md),부분실측해석은 [14](docs/14_PARTIAL_SURVEY_REVIEW.md)에있다.

## 거절·호환 검사 범위

1. usagePhase누락/안내모드와혼동한값거절,preview/review수용.
2. 시연기록의연구적격상승·미승인연구수행·payload전송상태혼입거절.
3. 사건ID·피드백/화면전환필드누락·201개사건·미통과완료거절.
4. receipt/hash/서버시각없는접수완료및클라이언트비밀필드거절.
5. kg수용·정수제시값의소수/음수/축중0·미등록단위거절.
6. 규칙단독approved에서도승인일/시각·수치·정밀도누락거절.
7. 미등록완료/채점/정밀도·잘못된응답종류·항목매핑·절사raw비교조합거절.
8. 선행단계누락·순환·중복step/response ID·없는피드백참조거절.
9. 문없는승인배치의유효openings수용,접근로없음/미측정끝점/미측정실내높이거절. 별도단계에서중복opening ID·길이0거절.
10. 기존1.0.0과1.1.0기록의별도검증/제출수용,구기록내용수정없음.
11. Lv1 6.6/73.3 pass,Lv2 10.0/73.3 fail의독립유리수검산과기재값판정/경계포함사례확인.
12. 현행예시5개·교사검토과제2개·부분측정1.1사본의형식검사.

## 실행 방법과 한계

현재작업폴더의기존검증용jsonschema의존성을재사용했다. 설치하지않았다. 이Mac의작업폴더에서 `PYTHONPATH=work/validation-deps python3 outputs/claude-code-handoff-2026-10-20/design-current/validation/validate_contracts.py`로실행했다. 다른기기에서는이미jsonschema/referencing이있는Python환경과버전별registry가필요하다.

JSON Schema만으로원문진위,실물동작,단위보정,전체외곽위상,개방부실제통행안전,연구승인을증명하지않는다. 등록사전은notPerformed이며앱연산바인딩도구현하지않았다. 열린구간이실제외곽변에놓이는지등은후속의미검사범위다. 승인합성fixture의숫자는검증용가짜값이며학교실측으로사용하지않는다.

IndexedDB·판정앱·AppsScript호출·CORS·시험Sheet·계정/망·배포검증은실시하지않았다. 0C최소7묶음/상세12시험은 [15](docs/15_DIRECT_SUBMISSION_TEST_DESIGN.md)의NOT_RUN계획이다. 실제연구적격·layoutConfirmed는올리지않는다.
