-- 振替先の過去日時をブロック
-- （同月内前振替でも、すでに終わった日・コマには登録不可）
-- Supabase SQL Editor で実行してください。

create or replace function public.assert_makeup_target_bookable(
  p_lesson_date date,
  p_period      smallint,
  p_subject     text,
  p_venue       text
)
returns void
language plpgsql
stable
set search_path = public
as $assert_target$
declare
  v_now_jst    timestamp;
  v_today_jst  date;
  v_start_time time;
begin
  v_now_jst := now() at time zone 'Asia/Tokyo';
  v_today_jst := v_now_jst::date;

  if p_lesson_date < v_today_jst then
    raise exception '振替先の授業はすでに終了しているため、登録できません。';
  end if;

  if p_lesson_date > v_today_jst then
    return;
  end if;

  select cpt.start_time
    into v_start_time
    from public.classroom_period_times cpt
   where cpt.classroom = p_venue
     and cpt.lesson_date = p_lesson_date
     and cpt.period = p_period
     and (cpt.subject = p_subject or cpt.subject is null)
   order by
     case
       when cpt.subject = p_subject then 0
       when cpt.subject is null then 1
       else 2
     end
   limit 1;

  if v_start_time is null then
    return;
  end if;

  if v_now_jst >= (p_lesson_date + v_start_time) then
    raise exception '振替先の開始時刻（%）を過ぎたため、登録できません。', to_char(v_start_time, 'HH24:MI');
  end if;
end;
$assert_target$;

revoke all on function public.assert_makeup_target_bookable(date, smallint, text, text) from public;
grant execute on function public.assert_makeup_target_bookable(date, smallint, text, text) to anon, authenticated;

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
  v_source_venue     text;
  v_today_jst        date;
  v_max_target       date;
begin
  v_today_jst := (now() at time zone 'Asia/Tokyo')::date;

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

  if date_trunc('month', p_lesson_date) < date_trunc('month', p_source_lesson_date) then
    raise exception '振替先は欠席月より前の月には設定できません。同月内であれば前の日付への振替が可能です。';
  end if;

  if p_source_lesson_date = p_lesson_date
     and p_source_period = p_period
     and p_source_subject is not distinct from p_subject then
    raise exception '欠席コマと振替コマが同じです。';
  end if;

  if p_lesson_date < v_today_jst then
    raise exception '振替先は今日以降の日付を選んでください。';
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

  perform public.assert_makeup_target_bookable(
    p_lesson_date,
    p_period,
    p_subject,
    v_venue
  );

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
    coalesce(l.source_subject, l.subject),
    coalesce(l.lesson_classroom, v_student.classroom)
  into
    v_src_attendance,
    v_chain_date,
    v_chain_period,
    v_chain_subject,
    v_source_venue
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

  perform public.assert_makeup_registration_open(v_chain_date);

  v_max_target := (
    date_trunc('month', v_chain_date) + interval '3 months' - interval '1 day'
  )::date;

  if p_lesson_date > v_max_target then
    raise exception '振替先は欠席月の翌々月末（%）まで選べます。', to_char(v_max_target, 'MM/DD');
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
    perform public.assert_absence_registration_open(
      p_source_lesson_date,
      p_source_period,
      p_source_subject,
      v_source_venue
    );

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
