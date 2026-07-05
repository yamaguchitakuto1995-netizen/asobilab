-- 保護者ポータル: 生徒ID+誕生日で授業予定一覧を取得
-- Supabase SQL Editor で実行してください。

create or replace function public.list_student_schedule_for_portal(
  p_student_id uuid,
  p_portal_id  text,
  p_birthday   date,
  p_from_date  date default current_date,
  p_to_date    date default (current_date + interval '120 days')
)
returns table (
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
language sql
stable
security definer
set search_path = public
as $list_schedule$
  select
    l.id,
    l.lesson_date,
    l.period,
    l.subject,
    l.attendance,
    l.lesson_classroom,
    l.source_lesson_date,
    l.source_period,
    l.source_subject
  from public.lessons l
  where l.student_id = p_student_id
    and public.verify_makeup_session_access(p_portal_id, p_birthday, p_student_id)
    and l.status = 'scheduled'
    and l.lesson_date >= p_from_date
    and l.lesson_date <= p_to_date
    and l.period is not null
    and l.subject is not null
  order by l.lesson_date, l.period;
$list_schedule$;

revoke all on function public.list_student_schedule_for_portal(uuid, text, date, date, date) from public;
grant execute on function public.list_student_schedule_for_portal(uuid, text, date, date, date) to anon, authenticated;

notify pgrst, 'reload schema';
