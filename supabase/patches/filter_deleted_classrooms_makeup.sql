-- 削除済み教室の振替枠を出さない（classroom_period_times の孤立行対策）
-- Supabase SQL Editor で実行してください。

create or replace function public.get_makeup_availability(target_date date)
returns table (
  classroom    text,
  period       smallint,
  subject      text,
  max_students smallint,
  occupied     int,
  available    int
)
language sql
stable
security definer
set search_path = public
as $get_makeup$
  with period_slots as (
    select cpt.classroom, cpt.period, cpt.subject as slot_subject
      from public.classroom_period_times cpt
      join public.classrooms cl on cl.name = cpt.classroom
     where cpt.lesson_date = target_date
  ),
  expanded as (
    select
      ps.classroom,
      ps.period,
      s.subject
    from period_slots ps
    cross join lateral (
      select unnest(
        case
          when ps.slot_subject is not null then array[ps.slot_subject::text]
          else array['プログラミング', 'ロボット']::text[]
        end
      ) as subject
    ) s
  ),
  capacity as (
    select
      e.classroom,
      e.period,
      e.subject,
      coalesce(lc.max_students, cl.default_max_students, 4)::smallint as max_students
    from expanded e
    join public.classrooms cl on cl.name = e.classroom
    left join public.lesson_capacities lc
      on lc.classroom = e.classroom
     and lc.day_of_week = extract(dow from target_date)::smallint
     and lc.period = e.period
     and lc.subject = e.subject
    where e.subject in ('プログラミング', 'ロボット')
  ),
  occupied as (
    select
      coalesce(l.lesson_classroom, s.classroom) as classroom,
      l.period,
      l.subject,
      count(*)::int as occ
    from public.lessons l
    join public.students s on s.id = l.student_id
    where l.lesson_date = target_date
      and l.status     = 'scheduled'
      and l.attendance in ('present', 'makeup')
      and l.period is not null
      and l.subject is not null
    group by 1, l.period, l.subject
  )
  select
    c.classroom,
    c.period,
    c.subject,
    c.max_students,
    coalesce(o.occ, 0)                                                as occupied,
    greatest(0, c.max_students::int - coalesce(o.occ, 0))             as available
  from capacity c
  left join occupied o
    on o.classroom = c.classroom
   and o.period    = c.period
   and o.subject   = c.subject
  order by c.classroom, c.period, c.subject
$get_makeup$;

revoke all on function public.get_makeup_availability(date) from public;
grant execute on function public.get_makeup_availability(date) to anon, authenticated;

-- 教室マスタ削除後に残ったコマ時刻・振替枠設定を掃除（任意・1回実行）
delete from public.classroom_period_times cpt
 where not exists (
   select 1 from public.classrooms cl where cl.name = cpt.classroom
 );

delete from public.lesson_capacities lc
 where not exists (
   select 1 from public.classrooms cl where cl.name = lc.classroom
 );

notify pgrst, 'reload schema';
