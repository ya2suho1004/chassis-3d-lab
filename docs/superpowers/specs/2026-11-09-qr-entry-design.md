# QR 입장 카드와 교사 입구 분리 설계 (2026. 11. 9., MOON 승인)

> 브랜치 `cozy-stage1`에서 11-10 시연 뒤 구현한다. main·공개판은 합치기 전까지 그대로다.
> IRB는 아직 신청 전이므로 서류 문구는 이 방식에 맞춰 Hermes가 함께 쓴다.

## 1. 목표
- 학생은 코드를 입력하지 않고 개인 카드의 QR로 바로 게임 화면에 들어간다.
- 수업 설정은 교사만 바꾼다. 학급별 설정 한 곳이 그 학급의 모든 태블릿에 적용된다.
- 카드는 학생당 한 장을 계속 쓴다.

**하지 않는 것:** 앱에 이름 입력(설명문의 "이름을 요구하지 않는다"를 유지), 카드 인증(카드는 본인 확인이 아니다), 오프라인 입장, 앱 안의 특정 코드 삭제 기능.

## 2. 주소(입구)

| 주소 | 화면 | 사용자 |
|---|---|---|
| `#c=A-01` | 카드 입장 → 게임 화면 | 참여 학생 |
| `#n=A` | 카드 입장 → 기록 없는 게임 화면 | 불참 학생 |
| 표시 없음 | 입장 화면: 코드 입력칸과 "기록 없이 하기"만(QR이 안 될 때의 대체 경로). "기록 없이 하기"는 학급을 고른 뒤 `#n=` 카드와 같은 경로로 간다 | QR을 못 쓰는 경우 |
| `#teacher` | 교사 화면 | 교사 |
| `#demo` | 지금의 과제 고르기 화면, 시연 세션 전용 | 교수님 둘러보기·시연 |

- 코드는 주소의 `#` 뒤에 둔다. 이 부분은 서버 요청에 포함되지 않아 접속 로그에 남지 않는다.
- 읽은 뒤 `history.replaceState`로 주소창에서 지운다. 코드 형식은 기존 `validateStudentCode`로 검사하고, 형식이 틀리면 입장 화면으로 보낸다.
- 인트로는 입장 화면과 `#demo`에서만 기존 설정대로 보인다. 카드 입장과 `#teacher`에는 없다.
- 새로고침하면 카드 정보가 사라진다. 저장된 수행이 있으면 복구 화면이, 없으면 입장 화면이 나온다(카드를 다시 찍으면 됨).

## 3. 학생 흐름

1. 코드의 첫 글자로 그 학급의 오늘 수업을 서버에서 읽는다(최대 5초).
2. 오늘 수업 판정(§5)을 통과하면 세션을 만든다. 인트로와 코드 입력은 없다.
3. 그 코드의 캐릭터가 이 기기에 없으면 자동 닉네임과 기본 캐릭터로 시작한다(☰ 메뉴에서 꾸미기). 캐릭터 만들기 화면은 카드 입장에서 건너뛴다.
4. 게임 화면에서 교관에게 과제를 받는다. 이후 수행·기록·AI 교관은 지금과 같다.

| 상황 | 동작 |
|---|---|
| 오늘 과제가 1개 | 바로 게임 화면 |
| 오늘 과제가 2개 | 게임 전에 "오늘 할 과제"를 한 번 고른다. 순서는 학생이 정한다(서류에 순서 규칙이 없음, MOON 확인) |
| 과제 하나를 끝냄, 남은 과제 있음 | 결과 화면에 **다음 과제** 버튼. 같은 코드로 새 수행 번호를 만든다. 무엇이 남았는지는 이 기기의 같은 코드·세션 확정 기록으로 판단한다. 불참 카드는 기록이 없으므로 이번 입장에서 끝낸 과제로 판단한다 |
| 과제를 모두 끝냄 또는 다음 학생 | 입장 화면(카드 안내)으로 돌아간다 |
| 같은 코드·세션의 끝내지 않은 수행 있음 | 복구 화면을 한 번 보여 준다(이어서 하기 / 새 수행 시작, 초안은 유지) |
| 앞 학생의 현재 수행 포인터가 남아 있음 | 카드 코드와 다르면 포인터를 지우고 진행한다. 그 학생의 초안은 지우지 않는다 |
| 불참 카드(`#n=A`) | 같은 오늘 수업을 비기록 모드(메모리 저장소, AI 교관 없음)로 진행한다 |
| 판정 실패·서버 실패·시간 초과 | 시작하지 않는다. "선생님께 알려 주세요"와 **다시 시도** 버튼을 보인다. 임의의 세션·조건으로 시작하지 않는다. 지난 설정을 재사용하지 않는다 |

## 4. 교사 화면(`#teacher`)

PIN을 없앤다. 학생 화면의 교사 링크도 없앤다. 주소를 숨기는 것은 보호가 아니며(설계 03 §7), 보호는 서버 로그인이다.

| 로그인 없이 | 교사 서버 로그인 뒤 |
|---|---|
| 이 기기 기록 건수, 상태별 건수, 대기 기록 전송·강제 재전송 | 오늘 수업 지정, 입장 카드 출력, CSV·ZIP 내려받기, 기록별 목록, 서버 대조, AI 점검·끄기, 새 세션, 기기 설정(시작 영상, 연습 규정값) |

- 전송은 원본을 보여 주지 않고, 태블릿마다 비밀번호를 입력하면 공용 기기에 비밀번호가 저장될 위험이 있어 로그인 없이 둔다. 전송 결과에는 지금처럼 기록 번호 앞부분과 상태만 보인다. 전송은 여전히 교사 조작으로만 일어난다.
- 기기별 설정(`teacherPreset`)은 쓰지 않는다. 오늘 수업이 대신한다. 저장값이 남아 있어도 읽지 않는다.
- 개발 환경(서버 주소 없음)에서는 로그인할 수 없으므로 `import.meta.env.DEV`일 때만 로그인 뒤 화면을 연다. 운영 빌드에는 이 경로가 없어야 한다.

### 오늘 수업 지정
학급 글자별로 세션, 과제 1~2개, 차시, 도움 방식, 차량 진입 방향을 고른다. 세션이 차시·도움 방식을 고정하면 그 값으로 잠근다(기존 `applySessionRules`). 저장 전에 과제마다 `createDemoSession`이 만들 수 있는 조합인지 검사하고, 안 되면 저장하지 않는다. 승인 전 연구 세션(`pending`)은 고를 수 없다.

### 입장 카드
학급 글자와 번호 범위를 넣으면 A4 인쇄 화면을 연다.
- 카드에는 QR과 코드만 적는다. **이름은 적지 않는다.** 이름과 코드가 함께 적힌 카드는 대응표가 되기 때문이다.
- 불참용 카드는 모양이 같고 번호대만 다르다(기본 A-90부터). 학생 눈에 구별되지 않게 한다. 90번대 코드는 참여 학생에게 배정하지 않는다.
- 카드의 주소는 지금 열린 주소를 기준으로 만든다.

## 5. 오늘 수업 판정(순수 함수)
입력: 서버 줄, 과제 목록, 세션 목록. 출력: 시작할 수 있는 과제 목록 또는 실패 사유.
실패 사유: 줄 없음, 모르는 세션, `pending` 세션, 모르는 과제, 과제 0개 또는 3개 이상, 스냅샷 없는 조합. 어떤 실패도 기본값으로 대체하지 않는다.

## 6. 서버
마이그레이션 하나를 추가한다. 함수는 바꾸지 않는다. 적용(`supabase db push`)은 MOON 허락 뒤에 한다.

```sql
create table public.class_today (
  class_letter text primary key check (class_letter ~ '^[A-Z]$'),
  session_code text not null references public.sessions(session_code),
  case_ids text[] not null check (array_length(case_ids, 1) between 1 and 2),
  usage_phase text not null check (usage_phase in ('preview', 'review', 'other')),
  difficulty_mode text not null check (difficulty_mode in ('guided', 'unguided')),
  vehicle_entry_direction text check (vehicle_entry_direction in ('north', 'south')),
  updated_at timestamptz not null default now()
);
alter table public.class_today enable row level security;
create policy class_today_public_read on public.class_today for select to anon, authenticated using (true);
create policy class_today_teacher_insert on public.class_today for insert to authenticated with check (public.is_teacher());
create policy class_today_teacher_update on public.class_today for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
revoke all on public.class_today from anon, authenticated;
grant select on public.class_today to anon, authenticated;
grant insert, update on public.class_today to authenticated;
```

- 학생 정보가 없는 표다. 공개 읽기로 드러나는 것은 세션 코드와 과제 번호뿐이며 이미 앱 코드에 들어 있는 값이다.
- 다른 네 표의 권한은 바꾸지 않는다.
- 학생 앱은 공개 키로 REST를 읽는다. 공개 키는 지금도 쓰고 있는 값이고 비밀 키는 쓰지 않는다. `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY`는 Vercel 환경변수에 있고(`docs/09`) `.env.production`에는 없다. 학생 경로가 새로 이 값에 의존하므로 재배포 뒤 실제 입장으로 확인한다. 값이 없으면 §3의 실패 화면이 나온다.
- `sessions.session_code`에 없는 세션은 외래 키로 막힌다. 앱 목록과 서버 세션이 맞는지 적용 전에 확인한다.

## 7. 코드 구성

| 파일 | 역할 |
|---|---|
| `src/app/entry.ts` (새) | 주소 해석, 입구 판단, 코드에서 학급 글자 얻기, 주소 지우기 |
| `src/app/classToday.ts` (새) | 오늘 수업 읽기·저장, §5 판정, 남은 과제 계산 |
| `src/teacher/qr.ts` (새) | QR 생성(새 패키지 없음). 영문·숫자·기호로 된 짧은 주소 전용 |
| `src/screens/EntryScreen.tsx` (새) | 입장 화면, 오늘 할 과제 고르기, 실패 화면 |
| `src/screens/TodayClass.tsx`, `EntryCards.tsx` (새) | 오늘 수업 지정, 카드 인쇄 |
| `src/App.tsx` | 입구별 화면 연결, 다음 과제 |
| `src/screens/StartScreen.tsx` | `#demo` 전용으로 축소(교사 링크 제거, 시연 세션 고정) |
| `src/screens/TeacherPanel.tsx` | 독립 화면으로 전환, PIN 제거, §4 구분 |
| `src/screens/ResultScreen.tsx` | 다음 과제 버튼 |

## 8. 시험
- **자동 시험:** 주소 해석(잘못된 코드·없는 값), §5 판정의 실패 사유 전부와 기본값 미사용, 남은 과제 계산, 앞 학생 포인터와 초안 보호, 서버 실패 시 시작 차단, 운영 경로에 PIN 없음, 학생 화면에 교사 링크 없음, 마이그레이션의 권한 문구, QR 생성 결과의 표준 시험값.
- **브라우저:** 네 입구와 실패 화면, 태블릿 폭 겹침, 카드 인쇄 화면. 인쇄용 QR 이미지를 OpenCV로 판독해 주소가 그대로 나오는지 확인한다.
- **실제 환경(MOON, 허락 뒤):** 마이그레이션 적용, 합성 코드(D-xx)와 리허설 세션으로 입장·기록·전송·대조, 학교 태블릿 카메라로 QR 입장, 카메라 앱이 새 탭을 여는지.

## 9. 남는 한계
- 다른 학생 카드를 찍으면 그 학생으로 들어간다(지금 코드 입력과 같음). 카드 분실·교환은 교사가 관리한다.
- 입장에 인터넷이 필요하다. 수행 중 끊겨도 기록은 지금처럼 기기에 남는다.
- 카메라 앱이 찍을 때마다 새 탭을 열면 탭이 쌓일 수 있다.
- 공개 주소 전체에 접근 제한은 없다. 주소를 아는 사람은 카드 없이 코드 입력으로 들어올 수 있다(지금과 같음).
- 철회 절차(`docs/research/withdrawal/`)의 "전송 버튼 누르지 않기"는 교사 입구를 아는 사람에게만 지켜진다.

## 10. 합칠 때 함께 고칠 문서
- `docs/demo/*.html`: 교수님 둘러보기는 `#demo`, 교사 화면은 `#teacher`, PIN 문구 삭제.
- 철회 절차서: 교사 화면 진입 경로, "시작 화면 아래 0건 표시" 확인 위치.

## 11. Hermes에게 넘길 것
- 연구계획서 21줄: 불참 학생은 "시작 화면 기록 없이 하기"가 아니라 같은 모양의 불참 카드를 쓴다.
- 수집항목표 11줄: "학생이 입력하는 코드"를 카드 방식으로. 수집 항목은 그대로다.
- 카드 배부·회수 담당자, 카드 보관(코드만 적혀 있어도 대응표와 분리), 불참 카드 배부를 독립 담당자가 맡을지.
