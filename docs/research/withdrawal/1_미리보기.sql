-- 참여 철회 1단계: 지울 대상 확인(읽기만 함, 지우지 않음)
-- Supabase 대시보드 SQL Editor에서 연구자 계정으로 실행한다. 아래 두 값만 바꾼다. 내용(원본·질문·답)은 꺼내지 않는다.
-- 삭제 뒤에 같은 값으로 다시 실행하면 records·chat_logs 줄이 없어야 한다.
with target(session_code, code) as (values ('여기에_세션코드', '여기에_익명코드'))
select 'records' as kind, r.record_id as id, r.accepted_at as at, null::text as note
  from public.records r join target t on r.session_code = t.session_code and r.anonymous_student_code = t.code
union all
select 'chat_logs', c.chat_id::text, c.created_at::text, c.status
  from public.chat_logs c join target t on c.session_code = t.session_code and c.anonymous_student_code = t.code
union all
-- 같은 코드가 다른 세션에도 있으면 알려 준다. 대응표로 같은 학생인지 확인하기 전에는 지우지 않는다.
select 'other_session_records', r.session_code, null, count(*)::text
  from public.records r join target t on r.anonymous_student_code = t.code and r.session_code <> t.session_code
  group by r.session_code
union all
select 'other_session_chat_logs', c.session_code, null, count(*)::text
  from public.chat_logs c join target t on c.anonymous_student_code = t.code and c.session_code <> t.session_code
  group by c.session_code
order by kind, at;
