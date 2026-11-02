# 교사용 AI 대화 점검 + 교사 화면 수업 순서 정리 (2026-11-03, 사용자 승인)

## 목적
- IRB 원고 4-2의 약속("교사는 대화를 점검하고 챗봇을 끌 수 있도록 설계한다")을 수업 중에 바로 지킬 수 있게 한다. 지금은 CSV로만 볼 수 있다.
- 교사 화면을 실제 수업 순서(수업 전 → 수업 중 → 수업 후)로 나눈다.

## 대화 점검(수업 중)
- 교사 로그인 뒤 세션마다 「대화 보기」를 누르면 그 세션의 AI 교관 대화를 시간순으로 보인다.
  - 표시 항목: 시각, 익명 코드, 단계, 학생 질문(서버에서 이미 가린 글), AI 답
  - 표시를 단다: 가림(전화·이메일·주민번호·학년반), 답 거절, 오류
- 거르기: 익명 코드 하나 고르기, "주의 표시만 보기"
- 자동 새로고침(10초, 켜고 끌 수 있음)은 마지막으로 받은 시각 이후 것만 불러와 붙인다(`created_at=gt.시각`).
- 같은 화면에 「AI 끄기/켜기」를 둔다(기존 `updateSession`의 chatbot_enabled).
- 서버 함수·DB는 바꾸지 않는다. 교사 RLS로 읽는 기존 REST(`chat_logs`)를 쓴다.
- 화면에 개인정보를 더 만들지 않는다. 서버에 저장된 가림 뒤 질문만 보이고, 기기에 따로 저장하지 않는다.

## 교사 화면 탭
| 탭 | 내용 |
|---|---|
| 수업 전 | 수업 설정(이 기기), 연습 규정값, 시작 영상 |
| 수업 중 | 서버 로그인, 세션별 AI 켜기/끄기·질문 수, 대화 보기 |
| 수업 후 | 이 기기 기록(요약 CSV·전송·결과), 서버 대화 기록·수행 기록 CSV, 새 세션 만들기 |
- 로그인 상태는 탭을 옮겨도 유지한다(교사 화면 안 메모리, 닫으면 풀림 — 기존 원칙 그대로).

## 구조
- `src/teacher/serverAdmin.ts`: `listChatLogsSince(cfg, auth, code, sinceIso)`를 더한다.
- `src/teacher/chatReview.ts`(순수)
  - `chatFlags`
  - `mergeChatLogs`(chat_id 중복 제거·시간순)
  - `filterChatLogs`, `studentCodesOf`, `latestCreatedAt`
  - `FLAG_LABEL`, `MASK_LABEL`
- `src/screens/ServerAdmin.tsx`
  - `useServerAdmin()` 훅(로그인·세션·작업)을 둔다.
  - `ServerLogin`·`ServerLive`·`ServerAfter`로 나눈다.
- `src/screens/ChatReview.tsx`: 목록·거르기·자동 새로고침·AI 끄기.
- `TeacherPanel`: 탭 3개로 나눈다.

## 시험
- 순수 함수:
  - 표시(가림·거절·오류)
  - 병합(중복·순서)
  - 거르기(코드·주의만)
  - 마지막 시각
- REST: `listChatLogsSince`가 세션 코드와 시각을 주소에 안전하게 넣고, 교사 토큰을 붙인다.
- 실제 로그인 확인은 교사 계정이 필요하다. 사용자가 직접 로그인해 확인한다(비밀번호는 Claude Code가 넣지 않음).
- 화면: 가짜 서버(시험용 fetch)로 대화 보기·거르기·AI 끄기 흐름을 캡처한다.
