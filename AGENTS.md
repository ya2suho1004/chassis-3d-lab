# 이 저장소에서 일하는 에이전트의 규칙

3D 섀시 실습장 웹앱(React + TypeScript + Vite + three, 서버는 Supabase Edge Function). 고등학생이 쓰고, 수행 기록은 연구 자료가 된다. 답과 문서·커밋 메시지는 한국어로 쓴다.

## 하지 않는 것
- `git commit`, `git push`, 브랜치 바꾸기·합치기, `git stash`를 하지 않는다. 커밋과 배포는 지휘 세션(Claude Code)이 확인한 뒤에 한다.
- 재배포, `supabase` 명령(`functions deploy`, `db push`, `secrets` 등)을 실행하지 않는다.
- 실제 서버(Supabase), 공개 주소(`*.vercel.app`), AI 제공자를 부르지 않는다. `scripts/chat-eval`의 `--run`도 쓰지 않는다.
- `.env`, `.env.local`, `.env.development` 등 `.env*` 파일을 읽지 않는다. 비밀값을 출력하지 않는다.
- 새 패키지를 설치하지 않는다(`node_modules`는 이미 있다).
- 개발 서버(`npm run dev`)를 띄우지 않는다. 이 폴더의 개발용 환경값에는 실제 서버 주소가 들어 있다.
- `tsconfig.tsbuildinfo`를 스테이징하지 않는다.

## 지시가 없으면 고치지 않는 곳
- 채점·기록·전송 로직: `src/domain`, `src/delivery`, `src/records`. 기록 payload 형식(`docs/design/contracts`)은 바꾸지 않는다.
- 서버: `supabase/` 아래(함수·이관).
- 배치 자료의 좌표·치수: `src/data/layout/*.json`. 과제 자료의 값: `src/data/tasks/*.json`.
- 재배포 기록: `docs/09_Vercel_배포안내_2026-10-28.md`.

## 연구 규칙 (어기면 안 된다)
- "안내 없음" 조건에서는 모든 최초 응답이 저장되기 전에 정답 관련 피드백(맞음·틀림, 공식, 다음 단계)을 드러내지 않는다(`src/domain/feedbackPolicy.ts`).
- 학생 화면에 사례의 측정값·계산 기준값·정답 판정을 내보내지 않는다. 학생 답과 ✓✗만 보인다.
- 닉네임·도감·AI가 쓴 정리 글은 수행 기록·서버 기록 접수로 보내지 않는다.
- AI 회사로 가는 글에 학번·세션 코드·수행 번호·학생이 넣은 값·사례 값을 넣지 않는다.

## 일하는 방식
- 순수 로직은 `src/app/*.ts`에 두고 화면(`src/screens/*.tsx`)은 얇게 둔다. 시험은 vitest(`tests/`), 구성요소는 기존 시험처럼 `renderToStaticMarkup`으로 그려 검사한다. 시험을 먼저 쓴다.
- 끝나면 `npm test`와 `npm run build`를 돌려 결과(통과·실패 수)를 보고한다.
- 겉모습·문구가 바뀌면 앱 판(`src/app/buildInfo.ts`와 `tests/buildInfo.test.ts`)을 올려야 한다. 올릴지는 지시문을 따른다.
- 학생 화면 문구는 해요체로 짧게 쓴다.
- 지시와 다르게 한 것, 판단이 서지 않아 남긴 것, 돌리지 못한 것은 보고 끝에 따로 적는다.
