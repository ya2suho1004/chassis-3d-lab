# Codex 프롬프트 — Vercel 프로젝트를 GitHub에 연결하기 (2026-11-03, Claude Code 작성)

아래 구분선 밑을 그대로 Codex에게 붙여 넣는다. **집 Wi-Fi나 휴대폰 핫스팟에 연결한 상태에서** 시킨다(학교망은 vercel.com을 막는다).

---

너는 맥북에서 `/Users/jamingchu/claude code/chassis-3d-lab` 프로젝트의 배포 설정을 한 번 바꾸는 일을 맡는다. 사용자(교사 MOON)는 개발자가 아니니, 사용자가 직접 눌러야 하는 것은 한 번에 하나씩 쉬운 말로 안내해.

## 목표
Vercel 프로젝트 `chassis-3d-lab`(팀 `leejm2959-1099s-projects`)를 GitHub 저장소 `ya2suho1004/chassis-3d-lab`에 연결하고, **운영(Production) 배포 브랜치를 `production`으로 바꾼다.** 학교망에서도 `git push`로 배포하기 위한 것이다.

## 이미 되어 있는 것(바꾸지 마)
- `vercel.json`에 `"git": { "deploymentEnabled": { "main": false } }`가 있다. main에 push해도 배포되지 않게 한 것이다.
- GitHub에 `production` 브랜치가 있다(커밋 1ae3d60, 지금 공개 주소와 같은 코드).
- Vercel 프로젝트 환경 변수 `VITE_SUBMIT_ENDPOINT`·`VITE_CHAT_ENDPOINT`·`VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY`가 Production·Preview에 이미 있다.
- 자세한 배경: `docs/09_Vercel_배포안내_2026-10-28.md` 27·30·32절.

## 꼭 지킬 것
- **배포하지 마.**
  - `vercel deploy`, `vercel --prod`를 쓰지 않는다.
  - `production` 브랜치에 push하지 않는다.
  - "Redeploy" 버튼을 누르지 않는다.
  - 배포는 사용자가 Claude Code에 "재배포해"라고 할 때만 한다.
- 환경 변수, 도메인, 빌드 설정, Supabase, 그 밖의 프로젝트 설정은 바꾸지 마.
- 배포 기록(Deployments)을 지우지 마.
- 비밀번호·토큰·키를 네가 입력하거나 화면·파일에 출력하지 마. 로그인은 사용자가 직접 한다.
- GitHub 권한은 이 저장소 하나만 준다(**Only select repositories** → `ya2suho1004/chassis-3d-lab`). "All repositories"를 고르지 마.
- 막히면 우회하지 말고 멈춰서 무엇이 막혔는지 사용자에게 알린다.

## 순서
1. **네트워크 확인:** `curl -s -o /dev/null -w "%{http_code}" https://vercel.com/`이 200인지 확인한다.
   - 000이면 학교망이다. 사용자에게 집 Wi-Fi나 핫스팟으로 바꾸라고 하고 멈춘다.
2. **프로젝트 확인:** 프로젝트 폴더에서 `vercel whoami`, `vercel project inspect chassis-3d-lab`으로 로그인 계정과 프로젝트를 확인한다.
   - 로그인이 안 되어 있으면 사용자에게 `vercel login`을 직접 하게 한다.
3. **GitHub 연결:** 프로젝트 폴더에서 `vercel git connect`를 실행한다(원격 저장소는 `git remote -v`의 origin).
   - Vercel GitHub 앱 권한이 없어 실패하면, 오류에 나온 링크(또는 Vercel 화면 **Settings → Git → Connect Git Repository → GitHub**)를 사용자에게 열어 준다.
   - GitHub 화면에서 사용자가 **Only select repositories → `ya2suho1004/chassis-3d-lab` → Install(또는 Save)**를 누르게 한다.
   - 그다음 `vercel git connect`를 다시 실행한다.
4. **운영 브랜치 바꾸기:** Production 브랜치를 `main` → `production`으로 바꾼다.
   - 대시보드: **Settings → Environments → Production → Branch Tracking**에서 `production`을 입력하고 Save.
   - CLI(`vercel api` 등)로 할 수 있으면 그래도 된다. 다만 Vercel 공식 문서로 그 방법을 확인한 뒤에만 쓴다.
   - 대시보드 화면 조작이 필요하면 사용자에게 위치를 한 단계씩 알려 준다.
5. **확인(배포 없이):**
   - `vercel project inspect chassis-3d-lab`(또는 대시보드)에서 연결 저장소가 `ya2suho1004/chassis-3d-lab`이고 Production 브랜치가 `production`인지 확인한다.
   - `vercel ls`로 이 작업 중 새 배포가 생기지 않았는지 확인한다. 생겼다면 지우지 말고 그 URL·상태를 기록한다.
   - 공개 주소 `https://chassis-3d-lab.vercel.app/`의 번들 이름(`index-…js`)이 작업 전과 같은지 확인한다(작업 전 값 index-DuICLv9F.js).
6. **기록:** `docs/09_Vercel_배포안내_2026-10-28.md` 맨 아래에 `## 33. GitHub 연결 (Codex, 날짜)` 표를 더한다.
   - 적을 것: 연결 저장소, Production 브랜치, GitHub 앱 권한 범위(선택한 저장소만), 새 배포가 생겼는지, 공개 주소 번들, 막힌 점.
   - 비밀값은 적지 않는다.
   - 그 파일만 커밋하고 `main`에 push한다. main은 배포되지 않는다.

## 끝나면 사용자에게
한두 문장으로 알린다: "연결 끝. 이제 Claude Code에 '재배포해'라고 하면 학교에서도 배포됩니다." 막혔으면 어디서 막혔는지 알린다.
