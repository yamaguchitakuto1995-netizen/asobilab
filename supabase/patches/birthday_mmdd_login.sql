-- 保護者ログインの誕生日を月日4桁（MMDD）に変更
-- 既存の date 型誕生日は自動で MMDD に変換されます。
-- Supabase SQL Editor で実行してください。

-- 1) カラム型変換（YYYY-MM-DD → MMDD）
ALTER TABLE public.students
  ALTER COLUMN birthday TYPE text
  USING CASE
    WHEN birthday IS NULL THEN NULL
    ELSE TO_CHAR(birthday::date, 'MMDD')
  END;

DO $$ BEGIN
  ALTER TABLE public.students ADD CONSTRAINT students_birthday_mmdd_check
    CHECK (
      birthday IS NULL
      OR birthday ~ '^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.students.birthday IS '保護者ログイン用の本人確認（月日4桁 MMDD。例: 3月27日→0327）';

-- 2) RPC: date → text（旧シグネチャを削除してから再作成）

DROP FUNCTION IF EXISTS public.verify_makeup_session_access(text, date, uuid);
DROP FUNCTION IF EXISTS public.find_student_for_makeup(text, date);
DROP FUNCTION IF EXISTS public.list_siblings_for_makeup(uuid, text, date);
DROP FUNCTION IF EXISTS public.list_scheduled_lessons_for_makeup(uuid, text, date, date);
DROP FUNCTION IF EXISTS public.list_student_schedule_for_portal(uuid, text, date, date, date);
DROP FUNCTION IF EXISTS public.mark_scheduled_lesson_absent(uuid, text, date, date, smallint, text);

CREATE OR REPLACE FUNCTION public.verify_makeup_session_access(
  p_portal_id  text,
  p_birthday   text,
  p_student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH primary_student AS (
    SELECT id, sibling_group_id
      FROM public.students
     WHERE trim(portal_id) = trim(p_portal_id)
       AND birthday = trim(p_birthday)
       AND portal_id IS NOT NULL
       AND birthday IS NOT NULL
     LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1 FROM primary_student p WHERE p.id = p_student_id
  )
  OR EXISTS (
    SELECT 1
      FROM primary_student p
      JOIN public.students s
        ON s.sibling_group_id = p.sibling_group_id
       AND s.id = p_student_id
     WHERE p.sibling_group_id IS NOT NULL
       AND s.id <> p.id
  );
$$;

CREATE OR REPLACE FUNCTION public.find_student_for_makeup(
  p_portal_id text,
  p_birthday  text
)
RETURNS TABLE (
  id         uuid,
  name       text,
  classroom  text,
  grade      text,
  subjects   text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $find_student$
  SELECT
    s.id,
    s.name,
    s.classroom,
    s.grade::text,
    s.subjects
  FROM public.students s
  WHERE trim(s.portal_id) = trim(p_portal_id)
    AND s.birthday = trim(p_birthday)
    AND s.portal_id IS NOT NULL
    AND s.birthday IS NOT NULL
  LIMIT 5
$find_student$;

CREATE OR REPLACE FUNCTION public.list_siblings_for_makeup(
  p_student_id uuid,
  p_portal_id  text,
  p_birthday   text
)
RETURNS TABLE (
  id         uuid,
  name       text,
  classroom  text,
  grade      text,
  subjects   text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $list_siblings$
  SELECT
    s2.id,
    s2.name,
    s2.classroom,
    s2.grade::text,
    s2.subjects
  FROM public.students s1
  JOIN public.students s2
    ON s2.sibling_group_id = s1.sibling_group_id
   AND s2.id <> s1.id
  WHERE s1.id = p_student_id
    AND trim(s1.portal_id) = trim(p_portal_id)
    AND s1.birthday = trim(p_birthday)
    AND s1.sibling_group_id IS NOT NULL
    AND s2.classroom IS NOT NULL
    AND s2.grade IS NOT NULL
  ORDER BY s2.name;
$list_siblings$;

CREATE OR REPLACE FUNCTION public.list_scheduled_lessons_for_makeup(
  p_student_id uuid,
  p_portal_id  text,
  p_birthday   text,
  p_from_date  date DEFAULT current_date
)
RETURNS TABLE (
  id               uuid,
  lesson_date      date,
  period           smallint,
  subject          text,
  attendance       attendance_status,
  lesson_classroom text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $list_sched$
  SELECT
    l.id,
    l.lesson_date,
    l.period,
    l.subject,
    l.attendance,
    l.lesson_classroom
  FROM public.lessons l
  WHERE l.student_id = p_student_id
    AND public.verify_makeup_session_access(p_portal_id, p_birthday, p_student_id)
    AND l.status = 'scheduled'
    AND l.lesson_date >= p_from_date
    AND l.period IS NOT NULL
    AND l.subject IS NOT NULL
    AND l.attendance IN ('present', 'makeup')
  ORDER BY l.lesson_date, l.period;
$list_sched$;

CREATE OR REPLACE FUNCTION public.list_student_schedule_for_portal(
  p_student_id uuid,
  p_portal_id  text,
  p_birthday   text,
  p_from_date  date DEFAULT current_date,
  p_to_date    date DEFAULT (current_date + interval '120 days')
)
RETURNS TABLE (
  id                 uuid,
  lesson_date        date,
  period             smallint,
  subject            text,
  attendance         attendance_status,
  lesson_classroom   text,
  source_lesson_date date,
  source_period      smallint,
  source_subject     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $list_schedule$
  SELECT
    l.id,
    l.lesson_date,
    l.period,
    l.subject,
    l.attendance,
    l.lesson_classroom,
    l.source_lesson_date,
    l.source_period,
    l.source_subject
  FROM public.lessons l
  WHERE l.student_id = p_student_id
    AND public.verify_makeup_session_access(p_portal_id, p_birthday, p_student_id)
    AND l.status = 'scheduled'
    AND l.lesson_date >= p_from_date
    AND l.lesson_date <= p_to_date
    AND l.period IS NOT NULL
    AND l.subject IS NOT NULL
  ORDER BY l.lesson_date, l.period;
$list_schedule$;

CREATE OR REPLACE FUNCTION public.mark_scheduled_lesson_absent(
  p_student_id   uuid,
  p_portal_id    text,
  p_birthday     text,
  p_lesson_date  date,
  p_period       smallint,
  p_subject      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $mark_absent$
DECLARE
  v_id    uuid;
  v_venue text;
BEGIN
  IF NOT public.verify_makeup_session_access(p_portal_id, p_birthday, p_student_id) THEN
    RAISE EXCEPTION '生徒情報を確認できませんでした。教室までお問い合わせください。';
  END IF;

  IF p_period < 1 OR p_period > 10 THEN
    RAISE EXCEPTION 'コマの指定が不正です。';
  END IF;

  IF p_subject NOT IN ('プログラミング', 'ロボット') THEN
    RAISE EXCEPTION '教科の指定が不正です。';
  END IF;

  SELECT coalesce(l.lesson_classroom, s.classroom)
    INTO v_venue
    FROM public.lessons l
    JOIN public.students s ON s.id = l.student_id
   WHERE l.student_id = p_student_id
     AND l.lesson_date = p_lesson_date
     AND l.period = p_period
     AND l.subject = p_subject
     AND l.status = 'scheduled'
     AND l.attendance IN ('present', 'makeup')
   LIMIT 1;

  IF v_venue IS NULL THEN
    SELECT s.classroom INTO v_venue
      FROM public.students s
     WHERE s.id = p_student_id;
  END IF;

  IF v_venue IS NOT NULL THEN
    PERFORM public.assert_absence_registration_open(
      p_lesson_date, p_period, p_subject, v_venue
    );
  END IF;

  UPDATE public.lessons l
     SET attendance = 'absent',
         updated_at = now()
   WHERE l.student_id = p_student_id
     AND l.lesson_date = p_lesson_date
     AND l.period = p_period
     AND l.subject = p_subject
     AND l.status = 'scheduled'
     AND l.attendance IN ('present', 'makeup')
  RETURNING l.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION '欠席にできるのは、振替フォームに表示されている「出席予定」または「振替予定」のコマのみです。一覧にない場合は教室までお問い合わせください。';
  END IF;

  RETURN v_id;
END;
$mark_absent$;

REVOKE ALL ON FUNCTION public.verify_makeup_session_access(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_makeup_session_access(text, text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.find_student_for_makeup(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.find_student_for_makeup(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.list_siblings_for_makeup(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.list_siblings_for_makeup(uuid, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.list_scheduled_lessons_for_makeup(uuid, text, text, date) FROM public;
GRANT EXECUTE ON FUNCTION public.list_scheduled_lessons_for_makeup(uuid, text, text, date) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.list_student_schedule_for_portal(uuid, text, text, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.list_student_schedule_for_portal(uuid, text, text, date, date) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.mark_scheduled_lesson_absent(uuid, text, text, date, smallint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_scheduled_lesson_absent(uuid, text, text, date, smallint, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
