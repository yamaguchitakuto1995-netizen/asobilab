-- 学年の自動更新（4月1日）用。最後に進級処理した学年開始月（YYYY-MM、4月固定）
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS grade_promoted_through_ym text;

COMMENT ON COLUMN public.students.grade_promoted_through_ym IS
  '学年自動更新の基準。当該年度の4月（例: 2026-04）まで処理済みなら再昇格しない。';
