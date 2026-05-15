-- 次回テキストをコース名・テキスト名に分割して保持（schema.sql と同期）
alter table public.students add column if not exists next_text_robot_course text;
alter table public.students add column if not exists next_text_robot_text text;
alter table public.students add column if not exists next_text_programming_course text;
alter table public.students add column if not exists next_text_programming_text text;
