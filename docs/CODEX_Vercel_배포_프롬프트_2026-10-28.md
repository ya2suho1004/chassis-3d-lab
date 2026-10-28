# Codex 프롬프트 — Vercel 배포 (2026-10-28)

사용법: 아래 블록을 Codex에 그대로 붙여 넣는다. **집 Wi-Fi나 휴대폰 LTE 핫스폿에서** 실행한다(학교 Wi-Fi는 vercel.com 로그인 화면을 막는다). 범위는 **Vercel 프로젝트 생성·환경변수·운영 배포·서버 허용 주소 추가·확인**까지다.

---

```
너는 맥북(사용자 jamingchu)에서 이미 만들어진 웹 앱을 Vercel에 배포하는 일을 맡는다. 사용자는 Vercel에 이미 가입했다. 사용자는 개발자가 아니므로 사용자에게 무언가를 시킬 때는 클릭 순서를 한 줄씩 적어라. 코드(src, supabase/functions)는 고치지 않는다.

## 먼저 읽기 (읽기만)
- /Users/jamingchu/claude code/chassis-3d-lab/docs/09_Vercel_배포안내_2026-10-28.md (전체 절차와 값)
- /Users/jamingchu/claude code/chassis-3d-lab/vercel.json
- /Users/jamingchu/claude code/chassis-3d-lab/docs/08_Supabase_설정기록_2026-10-28.md (프로젝트 ref)
- /Users/jamingchu/claude code/chassis-3d-lab/.gitignore

## 고정값
- 작업 폴더: /Users/jamingchu/claude code/chassis-3d-lab
- Vercel 프로젝트 이름: chassis-3d-lab, 개인 계정(Hobby, 무료). 유료 전환·결제·팀 생성은 하지 않는다.
- Supabase 프로젝트 ref: awzualempzrroyouwwoi (서울)
- 환경변수 4개(모두 공개 값). Production과 Preview에 같은 값으로 넣는다.
  - VITE_SUBMIT_ENDPOINT = https://awzualempzrroyouwwoi.supabase.co/functions/v1/submit
  - VITE_CHAT_ENDPOINT = https://awzualempzrroyouwwoi.supabase.co/functions/v1/chat
  - VITE_SUPABASE_URL = .env.local의 같은 이름 값
  - VITE_SUPABASE_ANON_KEY = .env.local의 같은 이름 값

## 할 일 (순서대로)
0. 네트워크 확인: `dig +short vercel.com`. 결과가 211.235.228.85이거나 비어 있으면 학교 차단망이다. 멈추고 사용자에게 "휴대폰 핫스폿이나 집 Wi-Fi로 바꿔 주세요"라고 알린 뒤 기다린다.
1. 작업 트리 확인: `git status -sb`가 깨끗하고 origin/main과 같은지 본다. 다르면 멈추고 보고한다.
2. 빌드 확인: `npm ci && npm test && npm run build`. 하나라도 실패하면 배포하지 말고 출력 요약을 보고한다.
3. Vercel CLI: `npm i -g vercel` 후 `vercel --version` 기록.
4. 로그인: `vercel login`. 브라우저 승인 창이 뜨면 사용자에게 "승인 버튼을 눌러 주세요"라고 알리고 기다린다. 토큰을 직접 만들거나 채팅으로 받지 않는다.
5. 프로젝트 연결: 작업 폴더에서 `vercel link --project chassis-3d-lab`. 새 프로젝트를 만들지 묻으면 개인 계정에 만든다. 이미 같은 이름이 있으면 새로 만들지 말고 사용자에게 보고한다. 끝나면 `.vercel/`이 `.gitignore`에 있는지 확인하고 없으면 추가한다.
6. 환경변수: 값을 화면·채팅·로그에 출력하지 않고 표준입력으로 넘긴다. 이미 있는 이름이면 덮어쓰지 말고 보고한다.
   ```
   for ENV in production preview; do
     printf %s "https://awzualempzrroyouwwoi.supabase.co/functions/v1/submit" | vercel env add VITE_SUBMIT_ENDPOINT $ENV
     printf %s "https://awzualempzrroyouwwoi.supabase.co/functions/v1/chat"   | vercel env add VITE_CHAT_ENDPOINT $ENV
     sed -n 's/^VITE_SUPABASE_URL=//p'      .env.local | tr -d '\n' | vercel env add VITE_SUPABASE_URL $ENV
     sed -n 's/^VITE_SUPABASE_ANON_KEY=//p' .env.local | tr -d '\n' | vercel env add VITE_SUPABASE_ANON_KEY $ENV
   done
   vercel env ls
   ```
   `vercel env add`가 preview에서 브랜치 이름을 물으면 비워 두고(모든 브랜치) 진행한다. CLI 판에 따라 인자 형식이 다르면 `vercel env add --help`를 보고 맞춘다.
   **절대 넣지 말 것:** GEMINI_API_KEY, service_role 키, DB 비밀번호, 그 밖에 .env.local의 다른 줄. VITE_로 시작하는 값은 학생 화면에 그대로 실린다.
7. GitHub 연결(선택): `vercel git connect https://github.com/ya2suho1004/chassis-3d-lab`. GitHub 앱 권한 승인 창이 뜨면 사용자에게 승인 순서를 안내한다. 실패하면 건너뛰고 보고한다(8단계 CLI 배포만으로도 충분하다).
8. 운영 배포: `vercel deploy --prod`. 끝나면 고정 주소(Production Domain, `https://<이름>.vercel.app`)를 `vercel project inspect chassis-3d-lab` 또는 배포 출력에서 확인한다. 배포마다 바뀌는 긴 주소가 아니라 고정 주소를 쓴다.
9. 서버 허용 주소 추가(비밀값 아님):
   `npx supabase secrets set --project-ref awzualempzrroyouwwoi ALLOWED_ORIGINS=http://localhost:5174,http://127.0.0.1:5174,https://<고정주소>`
   다른 비밀값(GEMINI_API_KEY 등)은 건드리지 않는다. `npx supabase secrets list --project-ref awzualempzrroyouwwoi`로 이름만 확인한다.
10. 확인 (기록이 남지 않는 방법만 쓴다):
   - `curl -sI https://<고정주소>` → 200이고 `x-robots-tag: noindex`가 있는지. 401이나 로그인 화면이면 배포 보호가 켜진 것이니 설정을 바꾸지 말고 보고한다.
   - `curl -s https://<고정주소>/assets/hdri/autoshop_01_1k.hdr -o /dev/null -w '%{http_code} %{size_download}\n'` → 200, 약 1.6MB
   - 허용 주소 확인(잘못된 요청이라 DB에 아무것도 남지 않는다):
     `curl -s -i -X POST -H 'Origin: https://<고정주소>' -H 'Content-Type: text/plain' --data 'not json' https://awzualempzrroyouwwoi.supabase.co/functions/v1/submit | grep -i -E 'access-control-allow-origin|INVALID_PAYLOAD'`
     `curl -s -i -X POST -H 'Origin: https://<고정주소>' -H 'Content-Type: text/plain' --data '{"protocol":"bad"}' https://awzualempzrroyouwwoi.supabase.co/functions/v1/chat | grep -i -E 'access-control-allow-origin|INVALID_REQUEST'`
     두 경우 모두 allow-origin 값이 고정 주소와 같아야 한다.
   - 배포된 자바스크립트에 비밀이 없는지: 첫 화면 HTML에서 `assets/index-*.js` 주소를 찾아 내려받고 `grep -c -E 'service_role|GEMINI|AIza'` 결과가 0인지 본다(키 값은 출력하지 않는다).
11. 기록: `docs/09_Vercel_배포안내_2026-10-28.md` 끝에 "## 7. 배포 결과 (Codex, 날짜)" 표를 덧붙인다. 넣을 것: 고정 주소, Vercel 프로젝트 이름, CLI 버전, GitHub 연결 여부, 환경변수 **이름** 4개와 적용 범위, ALLOWED_ORIGINS 값, 10단계 결과, 실패·건너뛴 것. 넣지 말 것: anon 키를 포함한 모든 키 값.
12. 커밋: 바뀐 파일(`docs/09_…`, 필요하면 `.gitignore`)만 커밋한다. 커밋 전에 `git diff --cached`에 키 값이 없는지 확인한다. push는 사용자 확인 후에만.

## 사용자에게 남길 일 (직접 하게 안내)
- Supabase 관리 화면 → 프로젝트 chassis-3d-lab → Authentication 설정 → "Allow new users to sign up" 끄기 → 저장.
- 고정 주소를 Claude Code 세션에 알려 주기(학교 Wi-Fi·태블릿 확인, 프레임 측정은 Claude Code가 한다).

## 하지 말 것
- src·supabase/functions·마이그레이션·vercel.json 수정, Edge Function 재배포, DB 변경.
- 화면에서 실제 기록 제출이나 챗봇 질문(원격 DB에 기록이 남는다). 교사 로그인.
- 배포 보호·도메인·팀·요금제 설정 변경, 사용자 도메인 연결.
- 키·토큰·비밀번호를 채팅·화면·로그·커밋에 남기는 것.
- thesis 폴더 수정.

## 보고 형식
변경한 것 → 확인한 증거(명령 출력 요약, 키 값 제외) → 미확정/실패 → 다음 한 단계. 실행하지 않은 것을 됐다고 쓰지 않는다.
```
