-- 講師ログイン（メール + 電話下4桁）用カラム
-- Supabase SQL Editor で実行してください。

ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS instructor_login_secret text;

COMMENT ON COLUMN public.teacher_profiles.phone IS
  '講師の電話番号（数字のみ）。ログイン時に下4桁で照合。';

COMMENT ON COLUMN public.teacher_profiles.instructor_login_secret IS
  '講師ログイン用の内部パスワード（サーバー専用。画面には出さない）。';

NOTIFY pgrst, 'reload schema';
