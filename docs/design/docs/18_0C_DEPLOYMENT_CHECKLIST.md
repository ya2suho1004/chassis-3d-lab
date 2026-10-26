# 18. 0C 학교 시험 배포 준비·D01 기록지

2026-10-26 · **현재 실배포/실제 호출 NOT_RUN.** 이 문서는 준비 점검표이며 배포 승인이 아니다. 별도로 허용된 학교 시험 때 교사가 작성한다.
기준: [15 §8·§9](15_DIRECT_SUBMISSION_TEST_DESIGN.md), 프로젝트 `server/apps-script/README.md`. 미해결 코드 항목은 [회신 C §2](../../collaboration/CODEX_RETURN_2026-10-26_C.txt)에 있다. 실자료·사진·계정 이메일·토큰을 기록하지 않는다.

## 배포 전 확인

- [ ] 학교 정책: Apps Script·배포자 실행·비로그인 익명 웹 앱 허용. 막히면 개인 계정 우회 없이 중계 검토. 학교 PC/태블릿·새 비로그인 프로필·학교망에서 `github.io`/`script.google.com`/`script.googleusercontent.com` 접근 조건 확인.
- [ ] 시험용 비공개 Sheet: 운영/연구 자료와 분리, 배포자 쓰기 가능, 학생 공유 없음. 탭 `canonical`, 1행 순서 `recordId | receiptId | acceptedAt | payloadHash | payloadJson`. 보관·종료 담당 정함.
- [ ] 같은 커밋의 **7개 파일**: `Code.gs`, `Jcs.gs`, `JsonStrict.gs`, `Validate.gs`, `Schemas.gs`, `DemoSnapshots.gs`, `appsscript.json`. 빠진 파일 없음. 원장 과거 ID 보존, 앱=active, 서버=원장 전체+fixture 확인.
- [ ] 서버 속성은 아래에 계획값을 먼저 기록. snapshot 허용 목록은 속성이 아닌 `DemoSnapshots.gs`임을 확인.

| 설정 | 교사 계획값·확인 |
|---|---|
| `SHEET_ID` / `TAB_NAME` | 올바른 시험 Sheet □ / `canonical` □ (ID는 비공개 설정에만 보관) |
| `ACCEPT_UNTIL` | 종료 한국시각 ______ / UTC ______Z. 실제 날짜·대문자 T/Z, 초 또는 소수 1~3자리. 누락·offset·없는 날짜는 신규 거절 |
| `MAX_NEW_ROWS` | ______행 (1~100000 정수). 누적 상한이며 시간만으로 회복하지 않음 |
| `LOCK_WAIT_MS` | ______ms (README 시험 설정 10000). 동시 시험량은 D05에서 별도 결정 |

- [ ] 앱/Script 배포 커밋 ______ / 원장 ruleVersion ______ / 원장 active·retired ______·______ / 앱·서버 항목 수 ______·______ / 목록 해시 기록 위치 ______. 이 검토에서 확인한 기준은 `090de21`; 수정 후에는 실제 배포 커밋으로 다시 대조.
- [ ] 시험 앱의 `VITE_SUBMIT_ENDPOINT`는 해당 시험 배포의 고정 `/exec`. `/dev`·가짜 수신점·일회성 리다이렉트 URL 아님. 수동 빌드의 `.env.production` 또는 Pages workflow의 `vars.VITE_SUBMIT_ENDPOINT` 중 실제 주입 경로와 번들 적용값 확인.
- [ ] 합성 D-01 등 D-xx만 사용(fixture는 D-00), `DEMO/DEMO-ONLY/demo`, 연구사용 미승인. `layoutConfirmed=false`·`researchEligible=false`·과제 pending(U1) 유지. 계정/권한 변경은 이 표로 실행 승인되지 않음.

## D01 — 학교에서 1건만 먼저

허용된 시험 배포 뒤 새 비로그인 프로필의 실제 Pages origin에서 합성 원본을 로컬 저장 완료 후 1회 제출한다. 페이지 JS가 JSON ack와 원본 ID/hash를 검증하고 로컬 접수 저장을 완료했는지, 시험 Sheet에 정본 1행이 생겼는지 대조한다. HTTP200·Network 미리보기·OPTIONS 없음만으로 PASS 처리하지 않는다.

| 증거 항목 | 기록 |
|---|---|
| 시험·결과·시각 | D01 / NOT_RUN·PASS·FAIL ______ / 한국 ______ / UTC ______ |
| 합성 fixture·snapshot | fixture/record 버전 ______ / snapshotId ______ / recordId ______ |
| 앱·Script 버전 | 앱 커밋/배포 ______ / Script 커밋/배포 버전 ______ |
| 실행 환경 | Pages origin ______ / 기기·OS·브라우저 버전 ______ / 학교망 ______ |
| 요청·응답 읽기 | text/plain □, OPTIONS 유무 ______, redirect 최종 호스트 ______, JS type/status/MIME ______, JSON·ack 검증 ______ |
| 정본과 대조 | 전체 행수 전→후 ______ / 해당 ID 1행 □ / receipt ______ / acceptedAt ______Z / 브라우저·서버·정본 JCS 해시 H 일치 □ |
| 화면·로컬 상태 | 선저장 complete □ / ack 확인 뒤 acknowledged 저장 □ / 오류·다음 조치 ______ |

**중단/다음 판정:** 로그인 HTML·CORS/opaque·ack 불일치·행/해시 이상이면 FAIL 또는 확인대기로 원본 보존하고 부하 시험을 늘리지 않는다. 같은 ID/원본으로 확인하며 새 ID로 우회하지 않는다. 정책 차단·필수 학교 기기에서 응답 읽기 실패는 15 §9에 따라 중계를 검토한다. D01 PASS만으로 운영/연구 승인이나 D02~D12 통과가 되지 않는다.
이메일·쿠키·토큰·일회성 응답 URL 전체·사진은 증거에 넣지 않는다. 종료 후 신규 접수는 닫되 이미 접수된 원본의 receipt 회수 정책은 15 §7·17 §4를 따른다.
