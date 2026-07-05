-- コース開始月（入会月）。進級タイミングの基準月。
-- Supabase SQL Editor で実行してください。

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS course_start_robot_ym text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS course_start_programming_ym text;

DO $$ BEGIN
  ALTER TABLE public.students ADD CONSTRAINT students_course_start_robot_ym_check
    CHECK (course_start_robot_ym IS NULL OR course_start_robot_ym ~ '^\d{4}-(0[1-9]|1[0-2])$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.students ADD CONSTRAINT students_course_start_programming_ym_check
    CHECK (course_start_programming_ym IS NULL OR course_start_programming_ym ~ '^\d{4}-(0[1-9]|1[0-2])$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
