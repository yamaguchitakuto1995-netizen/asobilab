-- 休会ステータス: attendance_status に on_leave、students に休会期間
-- Supabase SQL Editor で実行してください。

DO $$ BEGIN
  ALTER TYPE public.attendance_status ADD VALUE 'on_leave';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS leave_from_ym text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS leave_until_ym text;

DO $$ BEGIN
  ALTER TABLE public.students ADD CONSTRAINT students_leave_from_ym_check
    CHECK (leave_from_ym IS NULL OR leave_from_ym ~ '^\d{4}-(0[1-9]|1[0-2])$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.students ADD CONSTRAINT students_leave_until_ym_check
    CHECK (leave_until_ym IS NULL OR leave_until_ym ~ '^\d{4}-(0[1-9]|1[0-2])$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.students ADD CONSTRAINT students_leave_period_order_check
    CHECK (
      leave_from_ym IS NULL
      OR leave_until_ym IS NULL
      OR leave_from_ym <= leave_until_ym
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
