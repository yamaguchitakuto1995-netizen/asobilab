-- 保護者フォームに過去分の欠席（振替可能）を表示するための RPC 更新
-- Supabase SQL Editor で実行してください。

drop function if exists public.list_pending_absences_for_makeup(uuid, text, text, text, date);
drop function if exists public.list_pending_absences_for_makeup(uuid, text, date, date);
drop function if exists public.list_pending_absences_for_makeup(uuid, text, text, date);

create or replace function public.list_pending_absences_for_makeup(
  p_student_id uuid,
  p_portal_id  text,
  p_birthday   text,
  p_from_date  date default (current_date - interval '730 days')
)
returns table (
  id               uuid,
  lesson_date      date,
  period           smallint,
  subject          text,
  attendance       attendance_status,
  lesson_classroom text
)
language sql
stable
security definer
set search_path = public
as $list_pending$
  select
    l.id,
    l.lesson_date,
    l.period,
    l.subject,
    l.attendance,
    l.lesson_classroom
  from public.lessons l
  where l.student_id = p_student_id
    and public.verify_makeup_session_access(p_portal_id, p_birthday, p_student_id)
    and l.status = 'scheduled'
    and l.lesson_date >= p_from_date
    and l.period is not null
    and l.subject is not null
    and l.attendance = 'absent'
    and not exists (
      select 1
        from public.lessons m
       where m.student_id = l.student_id
         and m.status = 'scheduled'
         and m.attendance = 'makeup'
         and m.source_lesson_date = coalesce(l.source_lesson_date, l.lesson_date)
         and m.source_period = coalesce(l.source_period, l.period)
         and m.source_subject = coalesce(l.source_subject, l.subject)
    )
  order by l.lesson_date, l.period;
$list_pending$;

revoke all on function public.list_pending_absences_for_makeup(uuid, text, text, date) from public;
grant execute on function public.list_pending_absences_for_makeup(uuid, text, text, date) to anon, authenticated;

notify pgrst, 'reload schema';
