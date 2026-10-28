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

## 조건 (2026-10-28 결정, docs/design/docs/20 D7)
- Gemini는 약관상 18세 미만 대상 앱에 쓸 수 없다. 개발·시연(교사·교수·연구자)에만 쓰고 학생 적용 전 유료 모델로 바꾼다.
- 무료 등급 입력은 구글이 학습·사람 검토에 쓸 수 있다. 합성 질문만 넣는다.

## 파일
- `prompt.mjs` 시스템 프롬프트 생성(과제 데이터의 승인 기준 사용, 학생 측정값은 넣지 않음)
- `mask.mjs` 전화번호·이메일·주민번호 형식 가림
- `providers.mjs` 모델 교체 지점(gemini 시험 대상, anthropic 미검증, openai 미구현)
- `questions.mjs` 합성 질문 5개와 기대 동작
