# 15. 0C 직접 제출 수신 계약과 시험 설계

> 설계 본문 2026-10-21 · 시험 범위/회수 정책 보강 2026-10-26 · 실제 Google·학교 기기/망 시험은 `NOT_RUN`. 로컬 계약·합성 모의 검증은 별도 회신에 기록한다. 이번 문서 갱신에서 배포·실제 호출·계정 변경·학생자료 수집/전송을 하지 않았다.

**먼저 시험할 경로는 GitHub Pages → 브라우저의 `text/plain` POST → Apps Script Web App → 교사 소유 비공개 시험 Sheet다.** 실제 브라우저가 서버의 접수 응답까지 읽을 수 있어야 통과다. 실패하면 사용자 결정에 따라 같은 출처 중계로 전환한다. 문서 작성은 구현 시작이나 배포를 승인한 것이 아니다.

## 1. 결정·제안·미확인 구분

| 구분 | 내용 |
|---|---|
| 사용자 결정 | 2026-10-20 직접 호출을 먼저 시험하고 실패 시 같은 출처 중계로 전환 |
| 유지 계약 | [05 §7·§9·§15](05_RESEARCH_DATA_PIPELINE.md)의 ack, JCS 해시, 동일 ID 멱등성, 정본 1행, 선저장 및 응답 유실 복구 |
| 이번 설계 제안 | 시험 전용 배포와 Sheet 격리, 아래 `doPost` 검증 순서·오류 분류·시험 증거 |
| 아직 미확인 | 학교 계정 익명 배포 허용, 학교망·기기별 CORS/리다이렉트 응답 읽기, 한 셀 용량, 동시 제출·쿼터, 실제 운영 허용 |

직접 호출은 [submission.schema.json](../contracts/submission.schema.json)의 request/success/failure 모양과 [delivery.schema.json](../contracts/delivery.schema.json)의 상태를 유지한다. `protocolVersion="1"`과 `payload.schemaVersion`은 서로 다른 버전이다. 허용 record 버전별 검증기를 명시하고, 지원하지 않는 버전은 거절한다. 보존한 1.0.0 원본을 1.1.0으로 고쳐 재전송하지 않는다. 새 버전 시험자료는 해당 버전 계약으로 별도 확정한다.

05 §8의 서버 간 비밀 요구는 **중계 경로**에 적용한다. 직접 시험 배포에는 서버 간 비밀이 없으며 아래 제한으로만 접수한다. 기존 중계 배포의 인증 검사를 제거해 직접 경로로 재사용하지 않는다. 05의 예전 ‘비밀 없는 직접 호출은 저장하지 않는다’는 문장은 직접 시험의 현재 결정과 구분해 읽어야 한다.

## 2. 시험자료와 저장 대상의 경계

- 출발 자료는 [submission.demo-request.json](../examples/submission.demo-request.json)의 합성 기록이다. `anonymousStudentCode="D-00"`, `classConditionCode="DEMO"`, `sessionCode="DEMO-ONLY"`, `runPurpose="demo"`, `researchEligible=false`를 사용한다. 실제 학생·학급과 연결된 코드나 대응표를 만들지 않는다.
- 2026-10-26 시험 범위 보강: 기존 fixture 스냅샷은 `^D-00$`, 앱의 시험용 active 스냅샷은 `^D-[0-9]{2}$`(D-00~D-99)를 허용한다. 어느 코드도 실제 학생·학급과 연결하지 않으며 위 DEMO/DEMO-ONLY/demo/연구사용 미승인 문맥은 유지한다. 운영 목록으로 전환할 때는 별도 코드 패턴·허용 스냅샷 세트·적용 버전/배포 커밋·전환 결정과 시점을 기록하고, 시험 목록을 자동 승격하지 않는다.
- 합성 세션 스냅샷 ID와 버전 조합을 서버가 허용 목록으로 보관한다. 미승인 시연용 설정과 `configurationApproval.researchUseApproved=false`를 유지한다. 제출 성공으로 연구 적격성을 올리지 않는다.
- 이름·학번·이메일·전화번호·학생/학교 사진·차량번호·가명 대응표·실제 수행 답안은 입력·전송하지 않는다. 시험 화면과 증거에는 합성 UUID와 합성 payload만 사용한다.
- 시험 전용 Apps Script 프로젝트/배포와 비공개 시험 Sheet를 제안한다. 대상 Sheet ID·정본 탭은 서버 설정으로 고정하고 요청에서 받지 않는다. 운영 Sheet, 보호된 원자료, 연구용 자료를 시험 대상으로 쓰지 않는다.
- 직접 POST는 제출과 같은 원본의 receipt 회수만 수행한다. 학생용 정본 목록/검색/수정/삭제·교사 설정 변경 API를 만들지 않는다. GET로 payload나 receipt를 조회하지 않는다.

## 3. 브라우저 → `doPost` 입력

아래는 구현할 때 지킬 옵션이며 실행 코드는 아니다.

| 항목 | 직접 시험 계약 |
|---|---|
| 목적지 | 시험 배포의 고정 HTTPS `/exec` URL. 사용자 입력으로 URL/Sheet를 바꾸지 않음. `/dev`는 비로그인 시험 대상이 아님 |
| 메서드·본문 | POST. 단일 JSON 문서 `{"protocolVersion":"1","payload":{…}}`를 문자열로 전송. payload를 JSON 문자열로 이중 인코딩하지 않음 |
| Content-Type | `text/plain;charset=UTF-8`. 본문 내용은 JSON이며 응답 MIME은 JSON |
| 브라우저 옵션 | `mode=cors`, `credentials=omit`, `redirect=follow`. 스트리밍 본문을 쓰지 않음 |
| 헤더·URL | Authorization·X-API-Key 등 사용자 정의 인증 헤더 없음. 비밀·payload·코드를 query string에 넣지 않음 |
| 본문 제외 | `deliveryEnvelope`, client hash, receipt, 서버 비밀, OAuth 토큰, 대상 Sheet ID. 추가 필드를 조용히 버리지 않고 계약 오류로 처리 |

Apps Script는 `e.postData.contents`에서 본문을 읽고 `e.postData.type`으로 허용 MIME의 type/subtype을 확인한다. `charset=UTF-8` 매개변수가 붙은 정상 MIME을 거절하지 않도록 비교 규칙을 명시한다. 웹앱 이벤트 문서는 본문과 길이를 설명하지만 일반 요청 헤더 접근은 명시하지 않는다. `e.headers.Authorization`·Origin·IP 주소를 얻을 수 있다고 전제하지 않는다. [Google Web Apps, 열람 2026-10-21](https://developers.google.com/apps-script/guides/web#request_parameters)

요청 전체는 UTF-8 **48 KiB 이하**, JCS payload는 **32 KiB 이하**, 의미 이벤트는 **200개 이하**라는 05의 초기 제안을 적용한다. 이는 서비스 보장 한도가 아니다. 이벤트의 길이 숫자만 신뢰하지 않고 실제 본문 문자열을 UTF-8로 계산한다. 초과 원본을 자르거나 안전/오류 사건을 지워 성공 처리하지 않는다.

검증은 다음 순서로 설계한다.

1. 이벤트/본문 존재, MIME, 본문 크기를 확인한다. 빈 본문·다중 JSON 문서·잘못된 JSON을 거절한다.
2. 중복 객체 키를 인식할 수 있는 파싱 절차를 사용한다. 일반 `JSON.parse` 이후의 객체만 검사해서는 이미 덮인 중복 키를 찾을 수 없으므로 이 요건을 생략하지 않는다.
3. protocol/request/record의 해당 버전 스키마, 추가 필드 금지, UUID·날짜 형식 및 04의 필드 간 의미 조건을 검증한다. 승인 상태를 클라이언트 주장만으로 인정하지 않는다.
4. §2의 시험 코드 범위(기존 fixture D-00, 앱 스냅샷 D-xx)/DEMO/DEMO-ONLY, 불변 세션 스냅샷과 모드·버전·시연 플래그 조합을 대조한다. 알 수 없는 세션·버전은 보정하지 않는다.
5. 아래 JCS 원본과 hash를 만든 뒤 ScriptLock 구간으로 들어간다. 접수 허용 상태·신규행 상한은 잠금 안에서 다시 확인한다.

## 4. 서버 JCS·정본·receipt 처리

JCS는 같은 JSON 내용을 일정한 문자열로 만드는 규칙이다. 검증한 **payload만** RFC 8785 JCS → UTF-8 → SHA-256 순서로 처리하고 소문자 16진수 64자리 `payloadHash`를 서버가 재계산한다. request envelope·receipt·접수 시각·전송 상태는 해시에 포함하지 않는다. 키 순서/공백 차이는 같은 내용이지만 배열 순서·문자열·최초 답은 바꾸지 않는다. Unicode NFC/NFD 변환·trim·대소문자 교정·숫자 재절사를 수신 단계에서 하지 않는다. 비유한 수·잘못된 Unicode·중복 키는 거절한다. [RFC 8785 §3, 열람 2026-10-21](https://www.rfc-editor.org/rfc/rfc8785.html#section-3)

**정본은 `recordId | receiptId | acceptedAt | payloadHash | payloadJson`의 5열, 접수당 1행**이다. `payloadJson`은 전체 canonical JSON이다. receipt는 서버가 발급하는 불투명한 고유 접수번호이며 행 번호/학생 코드가 아니다. `acceptedAt`은 최초 서버 접수의 UTC 시각이다. payload의 시각이나 클라이언트가 정한 receipt를 채택하지 않는다.

| 순서 | 잠금 안의 처리와 성공 조건 |
|---|---|
| 1 | `LockService.getScriptLock()` 뒤 `tryLock` 또는 `waitLock`으로 실제 취득. 제한 시간 실패면 `LOCK_BUSY`, 쓰기 없음 |
| 2 | 고정된 시험 Sheet·정본 탭과 열 구조를 확인하고 recordId를 정본에서 검색. 캐시·분석 시트를 판정 근거로 쓰지 않음 |
| 3 | 1행 발견 시 저장된 payloadJson을 검증/해시 재계산하여 행 자체의 일관성을 확인. incoming canonical 내용과 hash가 모두 같으면 기존 receipt·acceptedAt·hash로 `duplicate=true` |
| 4 | 유효한 기존 행과 incoming 내용/hash가 다르면 `RECORD_ID_CONFLICT`. 기존 행 수정·새 행 추가·새 ID 자동 발급 없음 |
| 5 | 같은 ID 여러 행, 비어 있는 receipt/hash, 저장 hash와 원본 불일치 등은 정본 이상. 정상 ack를 만들지 않고 교사 점검으로 보냄 |
| 6 | 신규면 접수 창·허용 스냅샷·신규행 상한을 재확인하고 receipt/UTC 시각을 생성. 5개 값을 같은 1×5 범위에 **한 번의 행 쓰기**로 함께 저장 |
| 7 | `SpreadsheetApp.flush()` 후 같은 행을 다시 읽어 ID·receipt·시각·canonical 원본·재계산 hash가 맞는지 확인. 일치한 경우에만 `duplicate=false` ack 구성 |
| 8 | `finally`에서 잠금 해제. 분석 전개·CSV·외부 요청·오래 걸리는 후처리는 잠금 구간 밖에서 별도 수행 |

`getScriptLock`의 범위는 같은 스크립트다. 웹앱의 document lock은 null일 수 있으므로 대체하지 않는다. 같은 Sheet를 다른 프로젝트나 수동 편집으로 쓰면 이 잠금이 보호하지 못한다. [Google LockService, 열람 2026-10-21](https://developers.google.com/apps-script/reference/lock/lock-service)

위 검색·비교·한 행 기록·재읽기를 하나의 잠금 임계구간에 묶는 것이 이 설계의 원자적 처리 경계다. Sheets의 고유 제약이나 데이터베이스 트랜잭션, 절대적 exactly-once 보장을 주장하지 않는다. 중간 실패로 정본 이상이 생기면 새 행으로 덮지 않고 수동 복구 대상으로 남긴다. Google은 잠금 해제 전 flush를 권고하며 flush는 보류한 Sheet 변경을 적용한다. [Google Lock, 열람 2026-10-21](https://developers.google.com/apps-script/reference/lock/lock#releaselock), [SpreadsheetApp.flush, 열람 2026-10-21](https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#flush())

Sheet에는 5열의 텍스트가 의도한 값 그대로 저장되는지도 확인한다. 특히 `acceptedAt`의 자동 날짜 변환과 payloadJson의 Unicode/escape가 해시를 바꾸지 않아야 한다. `setValues`는 `=`로 시작하는 값을 수식으로 해석하므로 파생 표 전개 시 별도 텍스트 출력 규칙이 필요하다. 전체 JSON 셀을 쪼개거나 일부 필드만 저장해 이 계약을 대체하지 않는다. [Google Range.setValues, 열람 2026-10-21](https://developers.google.com/apps-script/reference/spreadsheet/range#setvaluesvalues)

## 5. 출력 ack와 오류·클라이언트 상태

정상 ack의 필수 필드는 기존 그대로다. 아래 표의 값 설명은 실제 접수 결과가 아니다.

| 필드 | 계약 |
|---|---|
| `protocolVersion`, `ok` | 문자열 `"1"`, boolean `true` |
| `recordId` | 요청 frozen payload와 동일 UUID |
| `receiptId`, `acceptedAt` | 최초 저장행의 접수번호·UTC 시각. 재전송 때 교체하지 않음 |
| `payloadHash` | 서버가 검증한 canonical payload의 SHA-256 |
| `duplicate` | 신규 false / 기존 정본 회수 true |

2026-10-26 수신점의 서버 생성 시각 프로필: `acceptedAt`은 실제 달력 날짜의 대문자 `T`·UTC `Z` 형식이며 초 이하 없음 또는 소수 1~3자리를 허용한다. 신규 서버 출력은 `toISOString()`의 밀리초 3자리다. 이는 success Schema의 일반 `format:date-time`보다 좁은 서버 생성/저장행 검사 범위다. Schema가 허용하는 offset·더 긴 소수·윤초까지 같은 범위로 구현됐다고 표현하지 않는다. 기존 행의 시각을 이 형식으로 고쳐 회수하거나 최초 접수시각을 교체하지 않는다.

오류도 `{"protocolVersion":"1","ok":false,"code":"…","retryable":false}` 모양을 유지한다. 검증된 UUID가 있을 때만 선택 필드 `recordId`를 넣는다. raw body·스택·Sheet ID/URL·계정 이메일을 덧붙이지 않는다. TextOutput의 공개 메서드는 MIME/내용 등을 제공하지만 임의 응답 헤더나 HTTP 상태를 설정하는 메서드는 문서화하지 않는다. 따라서 직접 경로가 `409/413/429` 또는 임의 `Access-Control-Allow-Origin`·`Cache-Control`을 설정할 수 있다고 설계하지 않는다. 응답은 `ContentService`의 JSON MIME을 사용하는 설계다. [Google TextOutput, 열람 2026-10-21](https://developers.google.com/apps-script/reference/content/text-output)

| JSON code | retryable | 앱의 처리 |
|---|---|---|
| `INVALID_PAYLOAD`, `UNSUPPORTED_SCHEMA` | false | rejected. 원본 보존, 자동 반복 금지 |
| `PAYLOAD_TOO_LARGE` | false | rejected. 잘림 없이 로컬 원본 회수 안내 |
| `RECORD_ID_CONFLICT` | false | conflict. 덮어쓰기/새 ID 우회 금지 |
| `SESSION_NOT_ALLOWED` | false | rejected. 합성 세션·시험 접수 창/설정 확인 |
| `LOCK_BUSY`, `RATE_LIMITED` | true | 쓰기 전 거절이 확인되면 pending. 지연 후 같은 ID/원본 재시도 |
| `CANONICAL_STORE_INVALID` | false | confirmationPending으로 정본 이상 교사 점검. 원본 보존, 자동 재시도 중단 |
| `UPSTREAM_UNAVAILABLE` | true | 저장 중 오류/flush·재읽기 실패 등 접수 불명은 confirmationPending. 같은 원본으로 확인 |

`SESSION_NOT_ALLOWED`·`CANONICAL_STORE_INVALID`는 이번 수신 설계의 추가 코드 제안이다. 코드 목록은 구현 전에 검증기/화면과 함께 고정하며 오류 응답의 스키마 필드는 늘리지 않는다. Google 플랫폼이 doPost 전후에 반환하는 로그인 HTML·권한/쿼터 오류는 위 JSON으로 통일된다고 보장할 수 없다.

클라이언트는 HTTP 200이나 `fetch` resolve만으로 성공 처리하지 않는다. 읽을 수 있는 JSON, success 스키마, protocol, frozen recordId, 로컬에서 독립 계산한 payloadHash, 유효한 receipt/접수 시각이 모두 맞아야 한다. 이미 저장한 receipt/acceptedAt이 있다면 재시도 응답도 같은지 확인한다. 확인 뒤 IndexedDB에 `uploadStatus=acknowledged`, `receiptId`, `payloadHash`, `uploadedAt=acceptedAt`을 저장하고 그 쓰기 완료 후 ‘서버 접수 확인됨’을 표시한다.

JSON 오류 응답을 읽었을 때는 `ok:false/code/retryable`로 판단한다. HTML 200·잘못된 ack·hash/ID 불일치·CORS/리다이렉트 실패·timeout·탭 종료는 `acknowledged`가 아니며 `confirmationPending`으로 남긴다. 네트워크 오류만으로 저장 없음이나 취소 완료를 추정하지 않는다. 자동 재시도는 백오프·횟수 상한을 두고, 동일 frozen ID/원본을 유지한다.

## 6. 실제 CORS·리다이렉트 응답 읽기 확인

`text/plain` POST는 사전 요청(preflight)을 피할 수 있는 조건 중 하나다. **사전 요청이 없다는 사실과 JavaScript가 응답을 읽을 수 있다는 사실은 다르다.** Google이 실제로 반환하는 CORS 헤더를 확인해야 한다. [MDN CORS, 열람 2026-10-21](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#simple_requests)

ContentService는 `script.googleusercontent.com`의 일회성 URL로 리다이렉트한다. 브라우저는 이를 따르되 그 일회성 URL을 다음 제출 주소로 저장하지 않는다. JSONP는 민감 자료/쓰기 접수의 대안으로 채택하지 않는다. [Google Content Service, 열람 2026-10-21](https://developers.google.com/apps-script/guides/content#redirects)

향후 허용된 시험에서 다음을 기록한다. 현재는 전부 미확인이다.

1. 로컬 file/localhost가 아닌 실제 GitHub Pages HTTPS origin에서 시작했는가. 시험 origin·배포 버전·브라우저 버전·학교망/기기를 기록한다.
2. 소유자 Google 로그인에 기대지 않는 새 브라우저 프로필에서 `credentials=omit` 요청이 가능한가. 시험 때문에 교사 계정을 로그아웃하거나 계정 정책을 바꾸지 않는다.
3. Network에서 POST의 실제 Content-Type·사용자 정의 헤더 유무·OPTIONS 발생 여부를 확인한다. preflight 발생 시 원인을 기록하며 CORS 우회 확장을 사용하지 않는다.
4. `/exec` → Google 리다이렉트 → 최종 응답의 호스트·상태·MIME·CORS 관련 헤더를 개발자 도구로 확인한다. 일회성 응답 URL 전체·로그인 쿠키/토큰은 증거에 복사하지 않는다.
5. **페이지의 JavaScript에서** 최종 response의 type/status/content-type과 JSON 본문을 읽고 ack를 검증할 수 있는가. Network 미리보기에서 본문이 보이는 것만으로 통과시키지 않는다.
6. `type=opaque`/`opaqueredirect`, status 0, 읽지 못한 본문은 성공이 아니다. `mode=no-cors`·`redirect=manual`·iframe load로 완료 표시를 대신하지 않는다. [MDN Fetch, 열람 2026-10-21](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#checking_the_response_type)
7. 정상 응답뿐 아니라 동일 payload 중복 ack와 검증 실패 `ok:false`도 실제로 읽히는가. Google 로그인/권한 HTML이 끼면 실패로 남긴다.

상태코드/중간 헤더 중 JavaScript에서 노출되지 않는 정보는 개발자 도구 진단으로 구분한다. Apps Script 코드에서 임의 CORS 헤더를 추가하면 해결된다는 가정이나, 공식 redirect 예제를 읽었으니 이 origin에서도 된다는 결론은 쓰지 않는다.

## 7. 공개 직접 호출의 남용 방지 범위

수신 측은 허용 합성 세션·스냅샷·시연 플래그, 본문 크기/필드/이벤트 개수, 접수 종료 시각, 시험당 신규행 상한을 검증한다. 신규행 상한과 접수 창의 실제 값은 시험 책임자가 시험 계획에 적고 서버에 설정한다. 여기서 임의 숫자를 확정하지 않는다. 같은 ID/같은 내용의 receipt 회수는 신규행으로 세지 않으며 종료 뒤 회수 허용 정책도 별도로 정한다.

2026-10-26 시험 정책: 접수 창 종료·신규행 상한 도달·snapshot `retired` 이후에도 이미 유효하게 접수된 같은 ID/같은 canonical 원본은 최초 receipt/acceptedAt/hash로 회수한다. 같은 ID/다른 내용은 충돌이며, `retired`의 미접수 원본/새 ID는 신규 접수하지 않는다. 미접수 outbox는 원래 snapshot·ID·원문으로 보존하고 교사 확인 대상으로 남긴다. 상세 원장 정책은 [17 §4](17_U_ITEMS_CONTRACT_REVISION_2026-10-26.md#4-p-7-방향을-보관하는-불변-세션-스냅샷)를 따른다.

접수 창·신규행 수 검사는 같은 ScriptLock 안에서 정본/서버 설정을 기준으로 한다. 잠금은 동시 쓰기 충돌을 줄이는 장치이며 요청자의 신원 확인이나 네트워크 속도 제한 장치가 아니다. 새 ID를 계속 만드는 공격, 공개 세션 코드 복제, 이미 알려진 payload의 재생, 실행/쿼터 소진을 막는다고 주장하지 않는다. 정본 접근 전에 거절해도 이미 Apps Script 실행은 시작했을 수 있다.

**운영 한계 문구:** “이 직접 제출 경로는 로그인 없는 공개 수신점입니다. 세션 코드·가명 코드·UUID·해시는 학생의 신원을 인증하지 않습니다. 유효한 모양의 위조 요청과 서비스 한도 소진을 완전히 막을 수 없습니다. receipt는 특정 내용의 접수 확인이며 실제 학생 수행·정답·연구 참여 적격성의 증명이 아닙니다.”

세션 코드와 Apps Script `/exec` URL은 클라이언트가 알아야 하므로 비밀로 취급하지 않는다. GitHub 저장소·브라우저 번들·`VITE_` 변수·로컬 저장소·URL에 공유 secret/API key/OAuth 토큰을 넣지 않는다. CORS는 브라우저의 응답 읽기 제한이지 공개 수신점의 인증이 아니며, 응답 읽기가 막혀도 쓰기 요청이 도달할 수 있다. Origin/Referer 검사나 공통 PIN만으로 허가된 학생만 접수한다고 설명하지 않는다.

운영 기록은 상태·처리 시간·오류 분류 등 최소 항목으로 설계한다. `e` 전체·본문·가명코드·계정 식별자를 Logger/console에 출력하지 않는다. Google/GitHub/학교 네트워크의 별도 운영 로그까지 없다고 보장하지 않는다. 공개 API는 대량 원본 조회를 제공하지 않는다.

## 8. 최소 수용 시험 — 모두 실행 전 계획

최소 실행 단위는 다음 **7개 필수 시험 묶음**이다. 아래 D01~D12는 중복 없이 증거를 정리하기 위한 상세 사례이며 전부 NOT_RUN이다.

| 필수 묶음 | 상세 사례 | 최소 확인 |
|---|---|---|
| G1 정상 접수와 응답 읽기 | D01·D08·D10 | 실제 학교 기기에서JSON ack를 읽고JCS/hash·최초정본을 대조 |
| G2 같은ID 재전송 | D02 | 같은receipt·시각·hash,추가정본행 없음 |
| G3 내용충돌 | D03 | 거절·원본행불변·새ID자동우회 없음 |
| G4 저장뒤 응답유실 | D04 | 확인대기 후같은원본 재시도,최초receipt 회수 |
| G5 동시요청 | D05 | 같은ID는1행,잠금실패와접수성공 구분 |
| G6 입력·한도·권한 거절 | D06·D09·D11 | 잘못된입력·크기·접수창·권한실패에서정본오염 없음 |
| G7 잘못된응답·공용기기 분리 | D07·D12 | 잘못된ack를완료로표시하지않고비밀·과거학생자료노출 없음 |


모든 시험은 §2의 합성 코드(D-00 fixture 또는 D-xx 앱 스냅샷)와 시험 Sheet에서만 한다. 각 시험마다 합성 recordId를 구분하되, **중복/충돌/응답 유실의 재시도는 처음 ID를 유지**한다. `H`는 향후 양쪽에서 독립 계산해 기록할 해시이며 이 문서에는 계산/실측 결과가 없다.

| ID | 시험 절차 | 통과 증거 / 실패 기준 |
|---|---|---|
| D01 정상 접수·실제 응답 읽기 | 합성 request를 로컬 선저장 완료 후 실제 GitHub Pages에서 1회 제출 | JS가 검증한 ack receipt와 시험 정본의 ID/receipt/UTC/hash/payload가 일치. 정본 1행. 로컬 저장 완료 전 요청 0건 |
| D02 같은 ID·같은 내용 | D01 원본 재전송. JSON 키 순서/공백만 바꾼 요청도 포함 | 최초 receipt·acceptedAt·H 유지, duplicate=true, 정본 여전히 1행. 재시도 수는 payload 밖에서만 증가 |
| D03 같은 ID·다른 내용 | D01의 ID를 유지하고 스키마상 유효한 clientAppVersion 값을 바꿔 전송 | JSON RECORD_ID_CONFLICT를 읽음. conflict 표시, 기존 5열 불변, 추가 행/새 ID 없음 |
| D04 저장 후 응답 유실 | 시험 장치로 저장 후 ack 전달만 끊은 경우를 재현하고 같은 원본 재전송 | 첫 화면은 confirmationPending. 최초 행의 receipt·acceptedAt·H 회수, 중복행 없음. abort 자체를 서버 미저장의 증거로 쓰지 않음 |
| D05 연타·두 탭·동시 제출 | 같은 원본을 두 탭/연타로 보냄. 별도 합성 ID들의 수업 예상 동시량도 단계적으로 시험 | 같은 ID 1행, 신규 ID별 1행. LOCK_BUSY/쿼터 오류 구별, 잠금 대기·처리 시간·오류 수 기록. 동시량은 교사가 정한 시험값 |
| D06 잘못된 입력 | 추가 필드, 잘못된 protocol/schema/UUID, 없는 세션, 연구 플래그, 중복 키, 잘못된 Unicode 등을 각각 전송 | 해당 오류와 retryable 판정. 정본 증가 0. 값을 고쳐 수락하거나 raw 입력을 로그에 남기지 않음 |
| D07 잘못된 ack·HTML 200 | 시험 응답 대체 장치로 HTML 200, 필수 필드 누락, 다른 ID/hash, 바뀐 receipt를 각각 반환 | 어느 것도 acknowledged가 되지 않음. frozen 원본/ID 유지. 시험 장치는 운영 배포에 포함하지 않음 |
| D08 JCS/hash 대조 | RFC 벡터와 한글 조합/분해 문자열·escape·배열·숫자·null을 브라우저/서버에서 대조. 실제 제출은 스키마에 맞는 완전 합성 payload만 사용 | 같은 내용 H 일치, 키순서/공백 동일성, NFC/NFD는 무단 합치지 않음. 정본 읽기 재계산 H 일치. 단순 JSON.stringify를 JCS로 오인하지 않음 |
| D09 크기·행 경계 | 전체 요청 48 KiB, canonical 32 KiB, 이벤트 200의 이하/경계/초과 합성 표본을 구분 | 수락 표본은 UTF-8 길이·원본·H 쓰기/읽기 일치. 초과는 잘림 없이 거절. 장문 전체 요청과 canonical 크기는 각각 시험 |
| D10 학교 계정·망·브라우저 | 학교 PC/태블릿과 학교망, 비소유자·비로그인 새 프로필에서 D01/D02/오류 응답 시험 | 로그인 없이 ack까지 읽힘. 권한 HTML/차단/CORS 실패 시 미통과. Safari와 실제 배포 대상 브라우저를 각각 기록 |
| D11 한도·접수 종료·권한 오류 | 신규행 상한/접수 창 밖, lock 취득 실패, 시험 Sheet 권한 오류를 제한된 시험 장치로 유도 | 잘못된 완료 표시 없음. 새 접수와 기존 receipt 회수 정책 구별. 원본 보존·교사 복구 가능. 실제 쿼터를 고갈시키는 부하 금지 |
| D12 비밀/자료 노출·공용기기 | 공개 빌드/URL/일반 오류 로그/네트워크 요청을 검토하고 다음 학생 화면 흐름 시험 | 비밀·실자료 없음. 이전 코드/답/receipt 미노출, 미접수 outbox 유지. 공개 경로에서 정본 열람/설정 쓰기 불가 |

기록 양식은 `시험 ID / NOT_RUN·PASS·FAIL / 시험시각 / 합성 fixture 버전 / 앱·Script 배포 버전 / origin / 기기·OS·브라우저 / 망 / JS 응답읽기·ack검증 결과 / 정본 ID별 행수 / receipt·acceptedAt·H 대조 / 오류·다음 조치`다. 테스트 계정 이메일·토큰·일회성 Google 응답 URL은 적지 않는다.

Apps Script 쿼터는 계정/사용자 등 조건에 따라 달라지고 변경될 수 있으며 초과 시 예외와 실행 중단이 발생한다. URL Fetch의 outbound 한도를 incoming doPost 한도로 옮겨 쓰지 않는다. 문서의 동시 실행 수치만으로 한 반 제출 가능이나 무료 무제한 운영을 보장하지 않는다. [Google Quotas, 열람 2026-10-21](https://developers.google.com/apps-script/guides/services/quotas)

## 9. 학교 계정 정책 확인과 전환 판정

실제 시험을 별도 요청받으면 먼저 학교 담당자와 아래를 확인한다. 이 확인표가 계정 변경을 허용하는 것은 아니다.

- 학교 Google Workspace에서 Apps Script 사용과 외부/비로그인 Web App 배포를 허용하는가. `ANYONE`은 로그인 사용자, `ANYONE_ANONYMOUS`는 비로그인 사용자까지 포함하며 실행 권한 `USER_DEPLOYING`과 별개다. 옵션이 막히면 개인 계정으로 우회하지 않는다. [Google Web App manifest, 열람 2026-10-21](https://developers.google.com/apps-script/manifest/web-app-api-executable)
- 교사/배포자 권한으로 비공개 시험 Sheet를 쓸 수 있는가. 실제 허용 OAuth 범위·Sheet 공유/편집자·공유 드라이브/소유권·담당자 변경 시 인계 책임을 확인한다. 학생에게 Sheet 쓰기 권한이나 교사 OAuth 토큰을 전달하지 않는다.
- 학생 Google 로그인·이메일 수집 없이 가능해야 한다. `Session.getActiveUser().getEmail()`은 조건에 따라 비어 있을 수 있고 배포자 실행의 effective user는 교사일 수 있으므로 학생 인증/중복 키로 쓰지 않는다. 이 시험에서는 이메일 조회도 요구하지 않는다. [Google Session, 열람 2026-10-21](https://developers.google.com/apps-script/reference/base/session)
- 학교망이 GitHub Pages·`script.google.com`·`script.googleusercontent.com`을 허용하는가. 관리 브라우저·쿠키·확장·태블릿 정책을 확인한다. 교사 로그인 브라우저만 통과한 결과는 비로그인 통과가 아니다.
- 시험/운영 프로젝트·Sheet·배포 URL을 구분하고, 시험 종료 시 수신 중지/자료 보관·삭제 책임을 정하는가. 수집 이후 연구 운영은 동의·기관 심의·보관/철회/파기 확인이 별도로 필요하다.

**직접 시험 통과 조건:** D01~D12 중 적용 시험의 실제 증거가 있고, 필수 학교 기기/망에서 정상·중복·오류 JSON을 JS로 읽으며, 최초 ack·동일 정본 1행·재전송 receipt가 일치한다. 시험 통과는 연구 적용·운영 배포 승인과 구분한다.

다음 중 하나면 직접 경로를 채택했다고 기록하지 않고 같은 출처 중계 설계로 전환한다.

1. 공식 옵션으로 맞춘 `text/plain`/cors/follow/omit에서도 필수 기기/망이 ack를 읽지 못하거나 로그인/HTML에 의존한다.
2. 임의 CORS 헤더, `no-cors`, iframe load 또는 비밀의 브라우저 저장이 있어야 성공이라고 할 수 있다.
3. 계정 정책이 공개 익명 수신을 허용하지 않거나 기관이 허용하는 남용 방지·권한 수준을 직접 경로가 충족하지 못한다.
4. 시험의 행 일관성·동시 처리·오류 회수·크기 경계가 수업 조건을 충족하지 못한다. 원인이 Sheet/잠금/쿼터면 중계 추가만으로 해결됐다고 보지 않고 함께 재설계한다.

전환 시 브라우저는 정적 앱과 **같은 origin의** `/api/submissions`만 호출하고 중계가 고정 Apps Script로 전송한다. GitHub Pages는 정적 사이트 호스팅이므로 호스팅/API origin 구성을 정한다. [GitHub Pages 공식 설명, 열람 2026-10-21](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) 서버 간 비밀은 중계와 Apps Script 서버 설정에만 두며 익명 직접 경로로 우회하지 못하게 수신 계약을 바꾼다. 기존 ack/JCS/recordId/정본 규칙은 유지한다. 전환 과정의 미확인 접수도 같은 ID/원본으로 회수하고, 직접/중계에 동시에 자동 제출하여 이중 접수를 만들지 않는다.

## 10. 다음 한 단계와 검토 근거

**다음 한 단계:** 사용자가 0C 구현·시험 단계를 별도 요청하면, 개발자는 위 수신 계약과 합성 fixture/응답 대체 장치를 먼저 구현 범위로 제시하고 학교 계정 정책을 확인한 뒤, 허용된 시험용 배포에서 D01의 ‘실제 페이지 JS가 ack를 읽는가’를 가장 먼저 검증한다. D01이 실패하면 접수 부하 시험을 늘리지 않고 리다이렉트/CORS 증거를 정리해 중계 전환을 검토한다.

현행 로컬 근거는 [05 저장·제출 설계](05_RESEARCH_DATA_PIPELINE.md), [04 데이터 명세](04_TASK_AND_LOG_SCHEMA.md), [submission 계약](../contracts/submission.schema.json), [delivery 계약](../contracts/delivery.schema.json), [Claude 작업4 요청](../../collaboration/CLAUDE_TO_CODEX_2026-10-21.txt)이다. 위 Google·MDN·RFC·GitHub 원문은 2026-10-21 웹으로 실제 열람했다. 공식 기능 설명을 실제 학교 통신 성공의 증거로 사용하지 않았다. 이 문서만 추가했으며 스키마·공통 기존 문서·원자료는 이 작업에서 수정하지 않았다.
