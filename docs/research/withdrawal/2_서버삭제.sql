-- 참여 철회 2단계: 서버 수행·대화 기록 삭제(되돌릴 수 없음)
-- 기기 처리를 끝낸 뒤 실행한다. 절차서 3단계. Supabase 대시보드 SQL Editor에서 연구자 계정으로 실행한다.
-- 네 값을 미리보기 결과대로 채운다. 값을 채우지 않거나 건수가 다르면 예외가 나고 아무것도 지워지지 않는다.
do $$
declare
  v_session constant text := '여기에_세션코드';
  v_code constant text := '여기에_익명코드';
  v_expected_records constant integer := -1;
  v_expected_chats constant integer := -1;
  v_records integer;
  v_chats integer;
begin
  delete from public.chat_logs where session_code = v_session and anonymous_student_code = v_code;
  get diagnostics v_chats = row_count;
  delete from public.records where session_code = v_session and anonymous_student_code = v_code;
  get diagnostics v_records = row_count;
  if v_records <> v_expected_records or v_chats <> v_expected_chats then
    raise exception '건수가 미리보기와 다릅니다. records % (예상 %), chat_logs % (예상 %). 아무것도 지우지 않았습니다.', v_records, v_expected_records, v_chats, v_expected_chats;
  end if;
end $$;
