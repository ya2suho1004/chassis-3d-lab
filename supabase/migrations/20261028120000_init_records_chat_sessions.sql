-- 설계 07 §2: 표 4개 + RLS. 학생(anon 공개 키)에게는 어떤 정책도 주지 않아 직접 조회·쓰기가 전부 막힌다.
-- 쓰기는 서버 함수(service role, RLS 우회)만 한다. 교사는 로그인 후 teachers에 있을 때만 읽는다.

-- 교사 명단
create table public.teachers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.is_teacher() returns boolean
  language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.teachers t where t.user_id = auth.uid()) $$;
revoke all on function public.is_teacher() from public;
grant execute on function public.is_teacher() to authenticated;

-- 수업 세션(교사가 만들고, 챗봇 켜고 끄기)
create table public.sessions (
  session_code text primary key check (session_code ~ '^[A-Za-z0-9_-]{1,32}$'),
  class_condition_code text not null check (class_condition_code ~ '^[A-Za-z0-9_-]{1,32}$'),
  lesson_flow text not null check (lesson_flow in ('lesson1-2', 'lesson5')),
  chatbot_enabled boolean not null default false,
  chat_cap_per_student integer not null default 20 check (chat_cap_per_student between 0 and 200),
  chat_daily_cap integer not null default 300 check (chat_daily_cap between 0 and 5000),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 수행 기록 정본(Apps Script 정본 시트 5열 + 조회용 열). payload_json은 JCS 정규형 원문 그대로(text) 보관한다.
create table public.records (
  record_id text primary key,
  receipt_id text not null check (char_length(receipt_id) between 8 and 128),
  accepted_at text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  payload_json text not null,
  session_code text not null,
  anonymous_student_code text not null,
  run_purpose text not null,
  schema_version text not null,
  created_at timestamptz not null default now()
);
create index records_session_idx on public.records (session_code, anonymous_student_code);

-- 정본은 고치지 않는다: 수정 금지(삭제는 철회 처리용으로 관리자만)
create or replace function public.forbid_update() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'records are immutable'; end $$;
create trigger records_no_update before update on public.records for each row execute function public.forbid_update();

-- AI 교관 대화 기록(제안 계약 chat-log 1.0.0, 설계 07 §4)
create table public.chat_logs (
  chat_id uuid primary key default gen_random_uuid(),
  record_id text,
  session_code text not null,
  anonymous_student_code text not null,
  difficulty_mode text check (difficulty_mode in ('guided', 'unguided', 'timedAssessment')),
  step_id text,
  turn_index integer not null check (turn_index >= 0),
  question_masked text not null,
  answer text,
  masked_patterns text[] not null default '{}',
  provider text not null,
  model text not null,
  model_version text,
  prompt_version text not null,
  latency_ms integer,
  status text not null check (status in ('answered', 'refused', 'error', 'disabled', 'limited')),
  created_at timestamptz not null default now()
);
create index chat_logs_session_idx on public.chat_logs (session_code, anonymous_student_code, created_at);

-- RLS: 모든 표에 켠다
alter table public.teachers enable row level security;
alter table public.sessions enable row level security;
alter table public.records enable row level security;
alter table public.chat_logs enable row level security;

-- 교사 정책(로그인 + 명단). anon에는 정책 없음 → 전부 거절.
create policy teachers_self_read on public.teachers for select to authenticated using (user_id = auth.uid());
create policy sessions_teacher_read on public.sessions for select to authenticated using (public.is_teacher());
create policy sessions_teacher_insert on public.sessions for insert to authenticated with check (public.is_teacher());
create policy sessions_teacher_update on public.sessions for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy records_teacher_read on public.records for select to authenticated using (public.is_teacher());
create policy chat_logs_teacher_read on public.chat_logs for select to authenticated using (public.is_teacher());

-- 표 권한: anon은 아무 권한 없음(RLS와 이중 차단), authenticated는 읽기 + sessions 쓰기만
revoke all on public.teachers, public.sessions, public.records, public.chat_logs from anon;
revoke all on public.teachers, public.sessions, public.records, public.chat_logs from authenticated;
grant select on public.teachers, public.records, public.chat_logs to authenticated;
grant select, insert, update on public.sessions to authenticated;

-- 교사 등록: 이 마이그레이션 시점에 있는 Auth 사용자(사용자가 만든 교사 계정 1개)를 교사로 올린다.
insert into public.teachers (user_id, email) select id, email from auth.users on conflict do nothing;
