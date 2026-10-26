# 직접 제출 수신점(Apps Script) — 시험 배포 안내

설계 근거: `docs/design/docs/15_DIRECT_SUBMISSION_TEST_DESIGN.md`(0C). 경로는 **GitHub Pages → 브라우저 `text/plain` POST → Apps Script 웹 앱 → 교사 소유 비공개 시험 Sheet**다. 이 폴더의 코드는 로컬 모의 환경(tests/appsScriptDoPost.test.ts, 개발 서버 `/__fake-submit`)에서만 실행됐고, 실제 Google 배포·호출은 아직 없다.

## 파일

| 파일 | 역할 |
|---|---|
| `Code.gs` | `doPost` 수신: MIME·크기 → 엄격 파싱 → 봉투·스키마·세션 허용 검사 → JCS 해시 → 잠금 안에서 정본 검색·중복/충돌 판정·1행 쓰기·flush·재읽기 → ack. `doGet`은 거절 |
| `Jcs.gs` | RFC 8785 정규화 + SHA-256(브라우저 `src/delivery/jcs.ts`와 같은 결과) |
| `JsonStrict.gs` | 중복 키·다중 문서·잘못된 유니코드를 거절하는 JSON 파서 |
| `Validate.gs` | record 1.1.0 미니 스키마 검증기(ajv와 판정 일치 시험 완료) |
| `Schemas.gs` | `docs/design/contracts/record.schema.json`에서 자동 생성(`npm run build:gs-schema`). 직접 수정 금지 |
| `appsscript.json` | 매니페스트: V8, 실행 주체 = 배포자, 접근 = 모든 사용자(익명), 범위 spreadsheets |

## 교사가 할 배포 절차 (학교 계정 정책 확인 뒤)

1. **시험용 Google Sheet** 새로 만들기(비공개, 운영·연구 자료와 분리). 탭 이름을 `canonical`로 바꾸고 1행에 머리글 5개를 순서대로 입력: `recordId`, `receiptId`, `acceptedAt`, `payloadHash`, `payloadJson`. 주소창의 `/d/…/` 사이 문자열이 Sheet ID.
2. **Apps Script 프로젝트** 새로 만들기(확장 프로그램 → Apps Script, 또는 script.google.com). 프로젝트 설정에서 "appsscript.json 매니페스트 파일 표시"를 켜고, 이 폴더의 파일 6개 내용을 같은 이름으로 붙여넣기.
3. **스크립트 속성**(프로젝트 설정 → 스크립트 속성)에 입력:
   - `SHEET_ID` = 1의 Sheet ID (필수)
   - `TAB_NAME` = `canonical`
   - `ALLOWED_SESSION_CODES` = `DEMO-ONLY`
   - `ALLOWED_SNAPSHOT_IDS` = `00000000-0000-4000-8000-000000000001` (앱의 demo 스냅샷) — 합성 fixture 시험을 함께 하려면 `,00000000-0000-4000-8000-000000000004` 추가
   - `ALLOWED_CLASS_CONDITIONS` = `DEMO`
   - `ACCEPT_UNTIL` = 시험 종료 시각(ISO, 예 `2026-11-30T15:00:00Z`)
   - `MAX_NEW_ROWS` = 시험 계획의 신규행 상한(예 `100`)
   - `LOCK_WAIT_MS` = `10000`
4. **배포 → 새 배포 → 웹 앱**: 설명 `0C 시험`, 실행 주체 **나(배포자)**, 액세스 권한 **모든 사용자(익명 포함)**. 권한 승인 창에서 Sheet 접근 허용. 생성된 **웹 앱 URL(`…/exec`)** 복사. (`/dev` URL은 비로그인 시험 대상이 아님)
   - "모든 사용자(익명)" 옵션이 보이지 않으면 학교 Workspace 정책이 막은 것 → 개인 계정으로 우회하지 않고 중계 설계로 전환 검토(설계 15 §9).
5. 앱 쪽: `.env.production`에 `VITE_SUBMIT_ENDPOINT=https://script.google.com/macros/s/…/exec` 저장(`.env.production.example` 참고. URL은 비밀이 아님) → `npm run build` → GitHub Pages 배포.
6. 시험 실행과 증거 기록은 `docs/03_0C_전송_시험_계획_2026-10-26.md`의 D01부터.

## 코드를 바꿀 때

- 계약(`record.schema.json`)이 바뀌면 `npm run build:gs-schema`로 `Schemas.gs`를 다시 만들고 `SUPPORTED_RECORD_VERSIONS`를 확인한다.
- 어떤 변경이든 `npm test`의 `appsScriptPure`·`appsScriptDoPost`가 통과해야 한다. 브라우저 해시와 서버 해시가 같은지는 `Jcs.gs` 대조 시험이 지킨다.
- 응답에 raw body·스택·Sheet ID·이메일을 넣지 않는다. 로그(`Logger`)도 쓰지 않는다.
