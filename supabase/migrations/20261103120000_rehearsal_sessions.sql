-- 리허설 세션(설계 docs/superpowers/specs/2026-11-03-class-sessions-design.md): 연구 세션과 같은 흐름을 가상 코드(D-xx)로 미리 돌려 보는 세션.
-- 연구 기록이 아니다(runPurpose=demo). 챗봇은 꺼진 채로 만들고 교사 화면에서 켠다. 연구 세션(EXP-L12·EXP-L5·USAB)은 IRB 승인 뒤 따로 만든다.
insert into public.sessions (session_code, class_condition_code, lesson_flow, chatbot_enabled, chat_cap_per_student, chat_daily_cap, active)
values
  ('REH-L12', 'REH', 'lesson1-2', false, 20, 300, true),
  ('REH-L5', 'REH', 'lesson5', false, 20, 300, true),
  ('REH-USAB', 'REH-USAB', 'lesson1-2', false, 20, 300, true)
on conflict (session_code) do nothing;
