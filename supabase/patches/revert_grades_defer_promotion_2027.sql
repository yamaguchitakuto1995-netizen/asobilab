-- 2026年4月に誤って昇級した学年を1つ戻し、2027年4月からの自動更新に備える
-- Supabase SQL Editor で実行してください（コードデプロイ前後どちらでも可）

UPDATE public.students
SET grade = CASE grade::text
  WHEN '小1' THEN '年長'::grade_level
  WHEN '小2' THEN '小1'::grade_level
  WHEN '小3' THEN '小2'::grade_level
  WHEN '小4' THEN '小3'::grade_level
  WHEN '小5' THEN '小4'::grade_level
  WHEN '小6' THEN '小5'::grade_level
  WHEN '中1' THEN '小6'::grade_level
  WHEN '中2' THEN '中1'::grade_level
  WHEN '中3' THEN '中2'::grade_level
  WHEN '高1' THEN '中3'::grade_level
  WHEN '高2' THEN '高1'::grade_level
  WHEN '高3' THEN '高2'::grade_level
  WHEN '年中' THEN '年少'::grade_level
  WHEN '年長' THEN '年中'::grade_level
  ELSE grade
END
WHERE grade::text NOT IN ('年少', '浪人', 'その他');

UPDATE public.students
SET grade_promoted_through_ym = '2026-04';

COMMENT ON COLUMN public.students.grade_promoted_through_ym IS
  '学年自動更新済みの学年開始月（YYYY-MM、4月）。2027-04 以降に次回昇級。';

NOTIFY pgrst, 'reload schema';
