# archive — 더 이상 운영 경로로 쓰지 않는 코드

## apps-script/ (2026-10-28 보관)
- 2026-10-28 지도교수 면담 결정으로 수신 서버가 Google Apps Script/Sheet에서 Supabase(Edge Function + Postgres)로 바뀌었다. 근거: `docs/05_영향분석_2026-10-28.md`, `docs/design/docs/20_2026-10-28_면담결정_변경기록.md`.
- 지우지 않고 보관하는 이유: Codex 검토 A~I(2026-10-26~27)를 통과한 수신 규칙(엄격 파싱, 버전별 스키마, 중복 ID, 해시 대조, ack)의 **기준 구현**이다. 새 Supabase 서버는 이 규칙과 시험을 옮겨 같은 결과를 내야 한다.
- 지금도 쓰는 곳: 개발용 가짜 수신점(`server/dev/fakeSubmitServer.ts`)과 시험 11개(`tests/appsScript*`, `tests/reply*`, `tests/sessionSnapshot.test.ts`)가 이 코드를 Node에서 평가한다. Supabase 서버와 그 시험이 생기면 대체한다.
- 배포하지 않는다. `clasp` 설정·`Config.gs`는 git 제외.
