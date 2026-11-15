-- 수업용 세션(설계 docs/superpowers/specs/2026-11-15-class-records-design.md §3-1·§3-2): 실제 수업에서 학생이 학번 네 자리로 들어오는 세션.
-- 기록은 연구 기록이 아니다(runPurpose=demo, researchEligible=false). 수행 기록 접수는 submit 함수의 허용 목록(DemoSnapshots.gs → receiverCore)이 정하고, 이 표는 AI 교관 설정에 쓴다.
-- 챗봇은 꺼진 채로 만들고 교사 화면에서 켠다. 질문 한도는 리허설 세션과 같은 값으로 두고, 수업 규모에 맞게 교사 화면에서 바꾼다.
-- 적용은 MOON 허락 뒤(설계 §6 1단계). 이미 있으면 건드리지 않는다.
insert into public.sessions (session_code, class_condition_code, lesson_flow, chatbot_enabled, chat_cap_per_student, chat_daily_cap, active)
values
  ('CLS-L12', 'CLS', 'lesson1-2', false, 20, 300, true),
  ('CLS-L5', 'CLS', 'lesson5', false, 20, 300, true)
on conflict (session_code) do nothing;
