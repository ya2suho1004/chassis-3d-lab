# 직접 제출 수신점(Apps Script) — 시험 배포 안내

설계 근거: `docs/design/docs/15_DIRECT_SUBMISSION_TEST_DESIGN.md`(0C). 경로는 **GitHub Pages → 브라우저 `text/plain` POST → Apps Script 웹 앱 → 교사 소유 비공개 시험 Sheet**다. 이 폴더의 코드는 로컬 모의 환경(tests/appsScriptDoPost.test.ts, 개발 서버 `/__fake-submit`)에서만 실행됐고, 실제 Google 배포·호출은 아직 없다.

## 파일

| 파일 | 역할 |
|---|---|
| `Code.gs` | `doPost` 수신: MIME·크기 → 엄격 파싱 → 봉투·스키마·세션 허용 검사 → JCS 해시 → 잠금 안에서 정본 검색·중복/충돌 판정·1행 쓰기·flush·재읽기 → ack. `doGet`은 거절 |
| `Jcs.gs` | RFC 8785 정규화 + SHA-256(브라우저 `src/delivery/jcs.ts`와 같은 결과) |
| `JsonStrict.gs` | 중복 키·다중 문서·잘못된 유니코드를 거절하는 JSON 파서 |
| `Validate.gs` | record 1.1.0 미니 스키마 검증기(ajv와 판정 일치 시험 완료) |
| `Schemas.gs` | record 1.0.0(legacy)·1.1.0 스키마. `docs/design/contracts/`에서 자동 생성(`npm run build:gs-schema`). 직접 수정 금지 |
| `DemoSnapshots.gs` | 허용 세션 스냅샷 37개(앱 36 + 합성 fixture 1): ID별 세션·조건·과제·모드·시점·목적·표시·승인·versions·코드 패턴. `npm run build:gs-snapshots`로 자동 생성. 직접 수정 금지 |
| `appsscript.json` | 매니페스트: V8, 실행 주체 = 배포자, 접근 = 모든 사용자(익명), 범위 spreadsheets |

## 명령줄로 배포하기 (2026-10-27부터 권장: 붙여넣기 없음)

1. (한 번) https://script.google.com/home/usersettings 에서 Google Apps Script API 켜기.
2. 터미널에서 `npx clasp login` → 브라우저에서 구글 계정 허용.
3. 설정 파일: `node scripts/write-apps-script-config.mjs <SHEET_ID> <ACCEPT_UNTIL …Z> <MAX_NEW_ROWS>` → `archive/apps-script/Config.gs`(Git 제외; 스크립트 속성이 비어 있을 때 Code.gs가 읽음).
4. `archive/apps-script/` 안에서 `npx clasp push -f` → `npx clasp deploy -d "설명"` → 배포 ID → `https://script.google.com/macros/s/<배포 ID>/exec`.
5. **소유자가 한 번** 편집기(`npx clasp open`)에서 `setupOnce` 실행 → 권한 허용. 이게 없으면 호출이 403 HTML. `setupOnce`는 `canonical` 탭과 머리글도 만든다.
6. 앱 `.env.production`에 /exec → `npm run build`.

2026-10-27 실제 배포·D01 증거: `docs/04_0C_D01_증거_2026-10-27.md`.

## 교사가 할 배포 절차 (수동, 웹 편집기에 붙여넣기)

1. **시험용 Google Sheet** 새로 만들기(비공개, 운영·연구 자료와 분리). 탭 이름을 `canonical`로 바꾸고 1행에 머리글 5개를 순서대로 입력: `recordId`, `receiptId`, `acceptedAt`, `payloadHash`, `payloadJson`. 주소창의 `/d/…/` 사이 문자열이 Sheet ID.
2. **Apps Script 프로젝트** 새로 만들기(확장 프로그램 → Apps Script, 또는 script.google.com). 프로젝트 설정에서 "appsscript.json 매니페스트 파일 표시"를 켜고, 이 폴더의 파일 **7개**(`Code.gs`, `Jcs.gs`, `JsonStrict.gs`, `Validate.gs`, `Schemas.gs`, `DemoSnapshots.gs`, `appsscript.json`)를 같은 이름으로 붙여넣기. `DemoSnapshots.gs`가 빠지면 모든 제출이 `SESSION_NOT_ALLOWED`가 된다.
3. **스크립트 속성**(프로젝트 설정 → 스크립트 속성)에 입력:
   - `SHEET_ID` = 1의 Sheet ID (필수)
   - `TAB_NAME` = `canonical`
   - `ACCEPT_UNTIL` = 시험 종료 시각 — **필수, UTC `…Z` 형식의 실제 달력 날짜**(예 `2026-11-30T15:00:00Z`; `+09:00`·`2026-02-31`은 무효). 없거나 무효면 신규 접수를 닫는다(기존 접수번호 회수는 됨)
   - `MAX_NEW_ROWS` = 시험 계획의 신규행 상한(양의 정수, 예 `100`) — **필수**. 누적 상한이라 시간이 지나도 회복하지 않으며 넘으면 `RATE_LIMITED`(교사가 설정을 바꿔야 함)
   - 허용 세션·스냅샷은 속성이 아니라 `DemoSnapshots.gs`에 고정돼 있다. 앱 과제·버전이 바뀌면 `npm run build:gs-snapshots`로 다시 만들어 함께 배포한다(record의 versions·승인·모드가 스냅샷과 다르면 `SESSION_NOT_ALLOWED`)
   - `LOCK_WAIT_MS` = `10000`
4. **배포 → 새 배포 → 웹 앱**: 설명 `0C 시험`, 실행 주체 **나(배포자)**, 액세스 권한 **모든 사용자(익명 포함)**. 권한 승인 창에서 Sheet 접근 허용. 생성된 **웹 앱 URL(`…/exec`)** 복사. (`/dev` URL은 비로그인 시험 대상이 아님)
   - "모든 사용자(익명)" 옵션이 보이지 않으면 학교 Workspace 정책이 막은 것 → 개인 계정으로 우회하지 않고 중계 설계로 전환 검토(설계 15 §9).
5. 앱 쪽: `.env.production`에 `VITE_SUBMIT_ENDPOINT=https://script.google.com/macros/s/…/exec` 저장(`.env.production.example` 참고. URL은 비밀이 아님) → `npm run build` → GitHub Pages 배포.
6. 시험 실행과 증거 기록은 `docs/03_0C_전송_시험_계획_2026-10-26.md`의 D01부터.

## 코드를 바꿀 때

- 계약(`record.schema.json`)이 바뀌면 `npm run build:gs-schema`로 `Schemas.gs`를 다시 만들고 `SUPPORTED_RECORD_VERSIONS`를 확인한다.
- 과제·세션 설정이 바뀌면 `npm run build:gs-snapshots`로 `DemoSnapshots.gs`와 앱의 `src/data/session/demo-snapshots.json`을 같이 다시 만든다. 원장 `src/data/session/snapshot-ledger.json`은 append-only라 옛 스냅샷은 `retired`로 남고(기존 접수번호 회수용), 새 세션은 `active`만 쓴다. ID는 **버전 참조**에서 나오므로 과제·피드백 본문을 바꿀 때는 docs/design/docs/17 §1대로 그 버전을 올려야 한다(생성기가 `feedbackPolicy.version` 불일치는 막는다).
- 배포 전에 앱 번들과 `DemoSnapshots.gs`가 같은 커밋에서 나왔는지(원장 항목 수·해시) 확인한다. 시차나 누락은 `SESSION_NOT_ALLOWED`로 나타난다.
- 시험 배포의 코드 범위는 합성 `D-xx`뿐(설계 15 §2). 시험 때는 앱 시작 화면에 D-01 같은 코드를 넣는다. 운영 배포는 별도 목록·패턴으로.
- 어떤 변경이든 `npm test`의 `appsScriptPure`·`appsScriptDoPost`·`appsScriptHardening`·`sessionSnapshot`이 통과해야 한다. 브라우저 해시와 서버 해시가 같은지는 `Jcs.gs` 대조 시험이 지킨다.
- 응답에 raw body·스택·Sheet ID·이메일을 넣지 않는다. 로그(`Logger`)도 쓰지 않는다.
