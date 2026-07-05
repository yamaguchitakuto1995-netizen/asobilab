-- プログラミングログイン情報・進級予定
-- Supabase SQL Editor で実行してください。

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS scratch_login_id text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS scratch_login_pass text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS minecraft_login text;

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS promotion_scheduled_ym text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS promotion_type text NOT NULL DEFAULT 'normal';

DO $$ BEGIN
  ALTER TABLE public.students ADD CONSTRAINT students_promotion_scheduled_ym_check
    CHECK (promotion_scheduled_ym IS NULL OR promotion_scheduled_ym ~ '^\d{4}-(0[1-9]|1[0-2])$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.students ADD CONSTRAINT students_promotion_type_check
    CHECK (promotion_type IN ('normal', 'skip_grade'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
