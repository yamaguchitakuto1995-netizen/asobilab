-- 1コマの定員 = レギュラー出席 + 振替の合計上限
-- classrooms.default_max_students = 新規振替枠の初期定員

alter table public.classrooms
  add column if not exists default_max_students smallint not null default 4;

do $$ begin
  alter table public.classrooms add constraint classrooms_default_max_students_check
    check (default_max_students >= 0 and default_max_students <= 99);
exception when duplicate_object then null; end $$;

-- (a) 空き状況: 出席予定(present) + 振替予定(makeup) を定員にカウント
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
  with capacity as (
    select c.classroom, c.period, c.subject, c.max_students
    from public.lesson_capacities c
    where c.day_of_week = extract(dow from target_date)::smallint
      and public.weekday_occurrence_in_month(target_date) = any(c.week_ordinals)
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

-- book_makeup_lesson: 定員チェックも present + makeup でカウント
create or replace function public.book_makeup_lesson(
  p_student_id         uuid,
  p_lesson_date        date,
  p_period             smallint,
  p_subject            text,
  p_source_lesson_date date,
  p_source_period      smallint,
  p_source_subject     text,
  p_text_memo          text default null,
  p_lesson_classroom   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $book$
declare
  v_student          public.students%rowtype;
  v_max              smallint;
  v_current          bigint;
  v_venue            text;
  v_src_attendance   attendance_status;
  v_chain_date       date;
  v_chain_period     smallint;
  v_chain_subject    text;
  v_new_id           uuid;
begin
  if p_period < 1 or p_period > 10 then
    raise exception 'コマの指定が不正です。';
  end if;

  if p_subject not in ('プログラミング', 'ロボット') then
    raise exception '教科の指定が不正です。';
  end if;

  if p_source_period < 1 or p_source_period > 10 then
    raise exception '欠席コマの指定が不正です。';
  end if;

  if p_source_subject not in ('プログラミング', 'ロボット') then
    raise exception '欠席の教科の指定が不正です。';
  end if;

  if p_source_lesson_date > p_lesson_date then
    raise exception '振替先は欠席する授業日以降の日付を選んでください。';
  end if;

  if p_source_lesson_date = p_lesson_date
     and p_source_period = p_period
     and p_source_subject is not distinct from p_subject then
    raise exception '欠席コマと振替コマが同じです。';
  end if;

  if p_lesson_date < current_date
     or p_lesson_date > current_date + interval '120 days' then
    raise exception '振替先の日付は今日から 120 日以内で選んでください。';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if v_student is null then
    raise exception '生徒が見つかりません。';
  end if;
  if v_student.classroom is null then
    raise exception '所属教室が未設定の生徒のため申請できません。教室にお問い合わせください。';
  end if;

  v_venue := coalesce(nullif(trim(p_lesson_classroom), ''), v_student.classroom);
  if v_venue is null then
    raise exception '実施会場を特定できません。';
  end if;

  select c.max_students
    into v_max
    from public.lesson_capacities c
   where c.classroom   = v_venue
     and c.day_of_week = extract(dow from p_lesson_date)::smallint
     and c.period      = p_period
     and c.subject     = p_subject
     and public.weekday_occurrence_in_month(p_lesson_date) = any(c.week_ordinals);

  if v_max is null then
    raise exception 'この日時のコマ枠は設定されていません。';
  end if;

  if exists (
    select 1
      from public.lessons
     where student_id  = p_student_id
       and lesson_date = p_lesson_date
       and period      = p_period
       and subject     = p_subject
       and status      = 'scheduled'
  ) then
    raise exception 'すでに同じコマで申請済みです。';
  end if;

  select count(*)::bigint
    into v_current
    from (
      select l.id
        from public.lessons l
        join public.students s on s.id = l.student_id
       where l.lesson_date = p_lesson_date
         and l.period      = p_period
         and l.subject     = p_subject
         and coalesce(l.lesson_classroom, s.classroom) = v_venue
         and l.status      = 'scheduled'
         and l.attendance  in ('present', 'makeup')
       for update of l
    ) as locked;

  if v_current >= v_max then
    raise exception 'この枠は満員です。別の日時をお選びください。';
  end if;

  select
    l.attendance,
    coalesce(l.source_lesson_date, l.lesson_date),
    coalesce(l.source_period, l.period),
    coalesce(l.source_subject, l.subject)
  into
    v_src_attendance,
    v_chain_date,
    v_chain_period,
    v_chain_subject
  from public.lessons l
  where l.student_id  = p_student_id
    and l.lesson_date = p_source_lesson_date
    and l.period      = p_source_period
    and l.subject     = p_source_subject
    and l.status      = 'scheduled'
    and l.attendance  in ('present', 'makeup');

  if not found then
    raise exception '欠席にできるのは、振替フォームに表示されている「出席予定」または「振替予定」のコマのみです。一覧にない場合は教室までお問い合わせください。';
  end if;

  update public.lessons
     set attendance = 'absent',
         updated_at = now()
   where student_id  = p_student_id
     and lesson_date = p_source_lesson_date
     and period      = p_source_period
     and subject     = p_source_subject
     and status      = 'scheduled'
     and attendance  in ('present', 'makeup');

  insert into public.lessons (
    student_id, teacher_id, lesson_date, period,
    attendance, subject, status, text_memo,
    source_lesson_date, source_period, source_subject,
    lesson_classroom
  ) values (
    p_student_id, v_student.created_by, p_lesson_date, p_period,
    'makeup', p_subject, 'scheduled', p_text_memo,
    v_chain_date, v_chain_period, v_chain_subject,
    v_venue
  )
  returning id into v_new_id;

  return v_new_id;
end;
$book$;
