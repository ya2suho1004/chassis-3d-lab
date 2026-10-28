-- 시연용 세션(설계 07 §4-3, §6): 학생 화면 기본 세션 코드 DEMO-ONLY. 가짜 코드·가짜 데이터 전용.
-- 챗봇 켜짐, 1인 하루 20문항, 세션 하루 300문항. 교사 화면이 생기면 교사가 끄고 켠다.
insert into public.sessions (session_code, class_condition_code, lesson_flow, chatbot_enabled, chat_cap_per_student, chat_daily_cap, active)
values ('DEMO-ONLY', 'DEMO', 'lesson1-2', true, 20, 300, true)
on conflict (session_code) do nothing;
