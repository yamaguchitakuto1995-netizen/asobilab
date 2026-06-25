-- 欠席のみの先行登録 / 欠席済みからの振替のみ申請
-- Supabase SQL Editor で実行してください。

-- 欠席済みで、まだ振替予定が紐づいていない scheduled 行を一覧
create or replace function public.list_pending_absences_for_makeup(
  p_student_id uuid,
  p_name       text,
  p_classroom  text,
  p_grade      text,
  p_from_date  date default current_date
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
  join public.students s on s.id = l.student_id
  where l.student_id = p_student_id
    and lower(trim(s.name)) = lower(trim(p_name))
    and s.classroom = p_classroom
    and s.grade::text = p_grade
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

revoke all on function public.list_pending_absences_for_makeup(uuid, text, text, text, date) from public;
grant execute on function public.list_pending_absences_for_makeup(uuid, text, text, text, date) to anon, authenticated;

-- 出席予定・振替予定を欠席予定にする（振替先は後から）
create or replace function public.mark_scheduled_lesson_absent(
  p_student_id   uuid,
  p_name         text,
  p_classroom    text,
  p_grade        text,
  p_lesson_date  date,
  p_period       smallint,
  p_subject      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $mark_absent$
declare
  v_id uuid;
begin
  if p_period < 1 or p_period > 10 then
    raise exception 'コマの指定が不正です。';
  end if;

  if p_subject not in ('プログラミング', 'ロボット') then
    raise exception '教科の指定が不正です。';
  end if;

  update public.lessons l
     set attendance = 'absent',
         updated_at = now()
    from public.students s
   where l.student_id = p_student_id
     and s.id = l.student_id
     and lower(trim(s.name)) = lower(trim(p_name))
     and s.classroom = p_classroom
     and s.grade::text = p_grade
     and l.lesson_date = p_lesson_date
     and l.period = p_period
     and l.subject = p_subject
     and l.status = 'scheduled'
     and l.attendance in ('present', 'makeup')
  returning l.id into v_id;

  if v_id is null then
    raise exception '欠席にできるのは、振替フォームに表示されている「出席予定」または「振替予定」のコマのみです。一覧にない場合は教室までお問い合わせください。';
  end if;

  return v_id;
end;
$mark_absent$;

revoke all on function public.mark_scheduled_lesson_absent(uuid, text, text, text, date, smallint, text) from public;
grant execute on function public.mark_scheduled_lesson_absent(uuid, text, text, text, date, smallint, text) to anon, authenticated;

-- 欠席済みの授業を振替元にできるよう book_makeup_lesson を拡張
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
    and l.attendance in ('present', 'makeup', 'absent');

  if not found then
    raise exception '振替の元に指定できる授業が見つかりません。一覧にない場合は教室までお問い合わせください。';
  end if;

  if v_src_attendance = 'absent' and exists (
    select 1
      from public.lessons m
     where m.student_id = p_student_id
       and m.status = 'scheduled'
       and m.attendance = 'makeup'
       and m.source_lesson_date = v_chain_date
       and m.source_period = v_chain_period
       and m.source_subject = v_chain_subject
  ) then
    raise exception 'この欠席に対する振替はすでに登録されています。';
  end if;

  if v_src_attendance in ('present', 'makeup') then
    update public.lessons
       set attendance = 'absent',
           updated_at = now()
     where student_id  = p_student_id
       and lesson_date = p_source_lesson_date
       and period      = p_source_period
       and subject     = p_source_subject
       and status      = 'scheduled'
       and attendance  in ('present', 'makeup');
  end if;

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

revoke all on function public.book_makeup_lesson(uuid, date, smallint, text, date, smallint, text, text, text) from public;
grant execute on function public.book_makeup_lesson(uuid, date, smallint, text, date, smallint, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
