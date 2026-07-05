-- 継続備考・退会予定・備考あり登録フラグ
-- Supabase SQL Editor で実行してください。

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS persistent_memo text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS withdrawal_until_ym text;

DO $$ BEGIN
  ALTER TABLE public.students ADD CONSTRAINT students_withdrawal_until_ym_check
    CHECK (withdrawal_until_ym IS NULL OR withdrawal_until_ym ~ '^\d{4}-(0[1-9]|1[0-2])$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS registered_via_detail boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
