# Codex 프롬프트 — Supabase 프로젝트 만들기 (2026-10-28)

사용법: 아래 블록을 Codex에 그대로 붙여 넣는다. 범위는 **프로젝트 생성·로컬 연결·비밀값 등록**까지다. 표·접근 제한·서버 함수는 설계안 승인 후 Claude Code가 만든다.

---

```
너는 맥북(사용자 jamingchu)에서 Supabase 프로젝트를 만드는 일을 맡는다. 사용자는 Supabase에 이미 가입했다. 사용자는 개발자가 아니므로 사용자에게 무언가를 시킬 때는 클릭 순서를 한 줄씩 적어라.

## 먼저 읽기 (읽기만)
- /Users/jamingchu/claude code/chassis-3d-lab/docs/07_변경설계안_2026-10-28.md — 1·2·10절(구조, 표, 계정 안내)
- /Users/jamingchu/claude code/chassis-3d-lab/docs/design/docs/20_2026-10-28_면담결정_변경기록.md — D1·D2
- /Users/jamingchu/claude code/chassis-3d-lab/.gitignore

## 고정값
- 프로젝트 이름: chassis-3d-lab
- 지역: ap-northeast-2 (Northeast Asia, Seoul). 만든 뒤에는 바꿀 수 없으니 반드시 확인한다.
- 요금제: Free. 유료 전환·결제 정보 입력은 하지 않는다.
- 작업 폴더: /Users/jamingchu/claude code/chassis-3d-lab

## 할 일 (순서대로)
1. Supabase CLI 설치: `brew install supabase/tap/supabase` 후 `supabase --version` 기록.
2. 로그인: `supabase login`. 브라우저 승인 창이 뜨면 사용자에게 "승인 버튼을 눌러 주세요"라고 알리고 기다린다. 접근 토큰을 직접 만들거나 채팅에 받지 않는다.
3. `supabase orgs list`로 조직 ID를 확인한다. 조직이 여러 개면 사용자에게 고르게 한다.
4. 데이터베이스 비밀번호:
   - 저장소 밖에 만든다: `mkdir -p ~/.config/chassis-3d-lab && openssl rand -base64 24 | tr -d '/+=' > ~/.config/chassis-3d-lab/supabase-db-password.txt && chmod 600 ~/.config/chassis-3d-lab/supabase-db-password.txt`
   - 비밀번호를 화면·채팅·로그·커밋에 출력하지 않는다. 명령에는 `"$(cat ~/.config/chassis-3d-lab/supabase-db-password.txt)"`로만 넘긴다.
   - 끝나면 사용자에게 "이 파일 내용을 비밀번호 관리 앱에 옮겨 두세요"라고 알린다.
5. 프로젝트 생성: `supabase projects create chassis-3d-lab --org-id <조직ID> --region ap-northeast-2 --db-password "$(cat ~/.config/chassis-3d-lab/supabase-db-password.txt)"`. 같은 이름의 프로젝트가 이미 있으면 새로 만들지 말고 사용자에게 보고한다.
6. 상태 확인: `supabase projects list`로 지역이 Seoul(ap-northeast-2)이고 상태가 정상(ACTIVE_HEALTHY)인지 확인한다. 준비 중이면 몇 분 기다렸다가 다시 본다.
7. 로컬 연결(작업 폴더에서): `supabase init`(기존 파일 덮어쓰기 금지) → `supabase link --project-ref <프로젝트 ref>`. 비밀번호를 물으면 4번 파일로 넘긴다.
8. `.gitignore`에 `supabase/.temp/`, `supabase/.branches/`가 없으면 추가한다.
9. 공개 값 기록: 키 목록을 화면에 그대로 출력하면 service_role(비밀) 키도 같이 보이므로, **anon(공개) 키만 골라 바로 파일에 쓴다.** 작업 폴더의 `.env.local`(git 제외 파일)에 덧붙이고, 기존 `GEMINI_API_KEY` 줄은 건드리지 않는다.
   ```
   REF=<프로젝트 ref>
   ANON=$(supabase projects api-keys --project-ref "$REF" -o json | jq -r '.[] | select(.name=="anon") | .api_key')
   [ -n "$ANON" ] && printf 'VITE_SUPABASE_URL=https://%s.supabase.co\nVITE_SUPABASE_ANON_KEY=%s\n' "$REF" "$ANON" >> .env.local && unset ANON && echo "공개 값 2줄 추가됨"
   ```
   `-o json` 출력 형식이 다르거나 anon 키 이름이 다르면(예: publishable) 키 값을 출력하지 말고 `jq -r '.[].name'`로 이름만 확인해 고친다. **service_role(secret) 키는 어떤 파일에도 쓰지 말고 출력하지도 않는다.**
10. 서버 비밀값 등록: `.env.local`의 GEMINI_API_KEY 값을 화면에 출력하지 않고 Supabase 비밀값으로 넣는다. 예: `supabase secrets set --project-ref <ref> GEMINI_API_KEY="$(sed -n 's/^GEMINI_API_KEY=//p' .env.local)" CHAT_PROVIDER=gemini CHAT_MODEL=gemini-3.5-flash-lite`. 확인은 `supabase secrets list --project-ref <ref>`(이름만 보임)로 한다.
11. 기록 문서: `docs/08_Supabase_설정기록_2026-10-28.md`를 만든다. 넣을 것: 프로젝트 이름, ref, 지역, 상태, 생성 시각, CLI 버전, 연결 여부, 등록한 비밀값 **이름**, 사용자가 남은 할 일. 넣지 말 것: 비밀번호, anon 키를 포함한 모든 키 값.
12. 커밋: 바뀐 파일(`supabase/config.toml`, `.gitignore`, 기록 문서)만 커밋한다. 커밋 전에 `git diff --cached`에 키·비밀번호가 없는지 확인한다. push는 사용자 확인 후에만.

## 사용자에게 남길 일 (직접 하게 안내)
- 교사 계정: Supabase 관리 화면 → 프로젝트 chassis-3d-lab → Authentication → Users → Add user → Create new user → 교사 이메일과 비밀번호 입력 → "Auto Confirm User" 체크 → Create. 비밀번호는 사용자가 정하고 Codex에 알려 주지 않는다.
- 데이터베이스 비밀번호 파일 내용을 비밀번호 관리 앱으로 옮기기.

## 하지 말 것
- 표·RLS·Edge Function·인증 설정 변경·저장소(Storage) 생성. 이것은 설계안 승인 후 Claude Code가 한다.
- 유료 요금제·결제·조직 설정 변경.
- 비밀 키·비밀번호를 채팅·화면·로그·커밋에 남기는 것. 학생 자료를 넣는 것.
- thesis 폴더 수정.

## 보고 형식
변경한 것 → 확인한 증거(명령 출력 요약, 키 값 제외) → 미확정/실패 → 다음 한 단계. 실행하지 않은 것을 됐다고 쓰지 않는다.
```
