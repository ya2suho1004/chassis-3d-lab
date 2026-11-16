# chat-eval — AI 교관 챗봇 시험 도구 (개발용)

앱 코드가 아니라 모델 선정·시스템 프롬프트 검토용 도구다. 실제 학생 자료를 넣지 않는다.

## 준비 (사용자)
1. https://aistudio.google.com/apikey 에서 Gemini API 키를 만든다(무료).
2. `chassis-3d-lab/.env.local` 파일을 만들고 한 줄 적는다. 이 파일은 git에 올라가지 않는다.
   ```
   GEMINI_API_KEY=여기에_키
   ```
3. 키를 채팅에 붙여 넣지 않는다.

## 실행
- 쓸 수 있는 모델 목록: `node scripts/chat-eval/run.mjs gemini --list`
- 질문 5개 비교: `node scripts/chat-eval/run.mjs gemini` → `docs/chat-eval/<날짜>_gemini_<모델>.md`
- 동시 요청: `node scripts/chat-eval/load.mjs gemini 5` (무료 등급은 5개부터. 25개는 유료 키에서)
- 모델 바꾸기: `.env.local`에 `GEMINI_MODEL=...` 또는 나중에 `ANTHROPIC_API_KEY`·`ANTHROPIC_MODEL`을 넣고 `run.mjs anthropic`.

## 실제 조건 시험과 판독표 (E1, 2026-11-09)
모델을 비교할 때는 이것을 쓴다. 서버 처리 본체(`handleChat`)를 그대로 거쳐 가림·프롬프트·답 길이 제한 400·앞 대화 최근 3번·끊김/막힘 처리가 실제와 같다. 대화 기록(chat_logs)은 남지 않는다.
- 계획만 보기(아무것도 보내지 않음): `node scripts/chat-eval/run-conversations.mjs gemini`
- 실제 호출: `node scripts/chat-eval/run-conversations.mjs gemini --run` (합성 대화 12개 52번 + 기존 질문 20번). 다중 대화만: `--only=conv`
- 결과: `docs/chat-eval/<날짜>_e1_<모델>_<프롬프트>.md`. 같은 날 다시 돌려도 덮어쓰지 않는다. 사람이 판독·메모 칸을 채운다. 모델을 고르는 개발 자료이며 연구 자료가 아니다.
- 질문을 고치면 `conversations.mjs`, 항목 뜻은 그 파일의 `DIMENSIONS`. 정답 값은 판독표가 과제 자료(`taskContext.generated.json`)에서 가져온다.
- 키(.env.local)는 chassis-3d-lab 폴더에만 있다. 브랜치 작업 폴더로 복사하지 않고, 합친 뒤 그 폴더에서 돌린다.

## AI 정리 평가 (2026-11-16, 설계 docs/superpowers/specs/2026-11-16-debrief-and-free-roam-design.md 2-5)
정리 화면의 "교관의 정리"를 AI가 쓰게 하는 지시문(`debrief-ko-…`)을 서버 반영 전에 실제 모델로 본다. 서버 처리 본체(`handleDebrief`)를 그대로 거쳐 요청 허용 목록 검사·서버가 만든 요약 글·지시문·답 길이 제한·429 재시도·답 검사(JSON·세 묶음·문장 수·길이·양호/불량·숫자·문장 끝)와 모델 서버 일시 오류 다시 부르기가 실제와 같다. 판독표에는 사례마다 모델 호출의 HTTP 상태·오류 글·끝난 이유·다시 부른 횟수가 남는다. 재사용·한도·대화 기록(chat_logs)은 거치지 않는다.
- 계획만 보기(키를 읽지 않고 아무것도 보내지 않음): `node scripts/chat-eval/run-debrief.mjs gemini`
- 실제 호출: `node scripts/chat-eval/run-debrief.mjs gemini --run` (합성 수행 요약 11개, 11번 + 429면 다시)
- 결과: `docs/chat-eval/<날짜>_debrief_<공급자>_<모델>_<지시문 판>.md` — 요약 글(AI가 받은 것)·모델 원문·검사 통과 여부(걸린 까닭)·걸린 시간, 사람 판독 칸. 같은 날 다시 돌려도 덮어쓰지 않는다.
- 합성 사례는 `debrief-cases.mjs`(앱이 보내는 facts 모양), 시험기·판독표는 `debrief-run.mjs`. 키는 위와 같이 `.env.local`(chassis-3d-lab 폴더)에서 읽는다.

## 조건 (2026-10-28 결정, docs/design/docs/20 D7)
- Gemini는 약관상 18세 미만 대상 앱에 쓸 수 없다. 개발·시연(교사·교수·연구자)에만 쓰고 학생 적용 전 유료 모델로 바꾼다.
- 무료 등급 입력은 구글이 학습·사람 검토에 쓸 수 있다. 합성 질문만 넣는다.

## 파일
- `prompt.mjs` 시스템 프롬프트 생성(과제 데이터의 승인 기준 사용, 학생 측정값은 넣지 않음)
- `mask.mjs` 전화번호·이메일·주민번호 형식 가림
- `providers.mjs` 모델 교체 지점(gemini 시험 대상, anthropic 미검증, openai 미구현)
- `questions.mjs` 합성 질문 5개와 기대 동작
- `questions-turning.mjs` 합성 질문 20개, `run-suite.mjs` 그 한 번짜리 시험(답 길이는 서버 값)
- `conversations.mjs` 합성 다중 대화 12개·판독 항목, `conversation-run.mjs` 시험기·판독표, `run-conversations.mjs` 실행 명령
- `build-doc.mjs` 교사 검토 문서 `docs/06_챗봇_시스템프롬프트_초안.md` 생성
- `debrief-cases.mjs` AI 정리 합성 수행 사실 11개, `debrief-run.mjs` 시험기·판독표, `run-debrief.mjs` 실행 명령
- `build-debrief-doc.mjs` AI 정리 지시문 교사 검토 문서 `docs/06b_AI정리_지시문_초안.md` 생성(지시문을 고치면 다시 만든다 — 시험이 최신인지 본다)
