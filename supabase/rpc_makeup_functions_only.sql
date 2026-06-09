-- ============================================================
-- 振替申請用 RPC だけを再適用する用 (Supabase SQL Editor へそのまま貼付可)
--
-- 【必須の前提】
--   下の「前提: 列の追加」ブロックがこのファイル内に含まれています。
--   古い DB でも、まずこのファイルを全文 Run すれば列 → RPC の順で適用されます。
--
-- 使いどき:
--   - 全文 schema.sql の途中でエラーになり、RPC だけを分けて適用したいとき
--
-- 注意: このブロックは「1 回まとめて」Run してください。
--
-- ▼ エラー 「Could not find the function public.book_makeup_lesson(...) in the schema cache」
--   1) このファイル先頭〜末尾を SQL Editor で再実行
--   2) それでも直らない場合は数分待つか、Supabase Dashboard で PostgREST のスキーマ再読み込みを試す
--
-- ▼ エラー 「column c.week_ordinals does not exist」
--   → このファイル冒頭の lesson_capacities への ALTER が未実行です。全文を最初から Run してください。
-- ============================================================

-- ------------------------------------------------------------
-- 前提: テーブル列（既存 DB 向け・何度実行しても安全）
-- ------------------------------------------------------------
alter table public.lesson_capacities
  add column if not exists week_ordinals smallint[] not null default array[1,2,3,4,5]::smallint[];

do $c$ begin
  alter table public.lesson_capacities add constraint lesson_capacities_week_ordinals_check
    check (
      cardinality(week_ordinals) >= 1
      and week_ordinals <@ array[1,2,3,4,5]::smallint[]
    );
exception when duplicate_object then null; end $c$;

alter table public.lessons add column if not exists source_lesson_date date;
alter table public.lessons add column if not exists source_period   smallint;
alter table public.lessons add column if not exists source_subject  text;
alter table public.lessons add column if not exists lesson_classroom text;

do $c$ begin
  alter table public.lessons add constraint lessons_lesson_classroom_check
    check (lesson_classroom is null or lesson_classroom in (
      '長浜八幡中山教室',
      '長浜駅前通り教室',
      '米原駅前教室',
      '米原長岡教室',
      '西宮鳴尾町教室',
      '出屋敷教室',
      '長浜神照教室',
      '学校法人芦屋学園芦屋大学附属幼稚園教室'
    ));
exception when duplicate_object then null; end $c$;

do $c$ begin
  alter table public.lessons add constraint lessons_source_triple_check
    check (
      (source_lesson_date is null and source_period is null and source_subject is null)
      or (
        source_lesson_date is not null
        and source_period between 1 and 10
        and source_subject in ('プログラミング', 'ロボット')
      )
    );
exception when duplicate_object then null; end $c$;

-- （以下 RPC）

create or replace function public.weekday_occurrence_in_month(d date)
returns smallint
language sql
immutable
strict
set search_path = public
as $occ$
  select count(*)::smallint
  from generate_series(
    date_trunc('month', d)::date,
    d,
    '1 day'::interval
  ) as g(day)
  where extract(dow from g.day::date) = extract(dow from d);
$occ$;

-- (a) 指定日の各枠の空き状況を返す
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
      and l.attendance = 'makeup'
      and l.period is not null
      and l.subject is not null
    group by 1, l.period, l.subject
  )
  select
    c.classroom,
    c.period,
    c.subject,
    c.max_students,
    coalesce(o.occ, 0)                                    as occupied,
    greatest(0, c.max_students::int - coalesce(o.occ, 0)) as available
  from capacity c
  left join occupied o
    on o.classroom = c.classroom
   and o.period    = c.period
   and o.subject   = c.subject
  order by c.classroom, c.period, c.subject
$get_makeup$;

revoke all on function public.get_makeup_availability(date) from public;
grant execute on function public.get_makeup_availability(date) to anon, authenticated;

create or replace function public.find_student_for_makeup(
  p_name      text,
  p_classroom text,
  p_grade     text
)
returns table (
  id         uuid,
  name       text,
  classroom  text,
  grade      text,
  subjects   text[]
)
language sql
stable
security definer
set search_path = public
as $find_student$
  select
    s.id,
    s.name,
    s.classroom,
    s.grade::text,
    s.subjects
  from public.students s
  where lower(trim(s.name)) = lower(trim(p_name))
    and s.classroom         = p_classroom
    and s.grade::text       = p_grade
  limit 5
$find_student$;

revoke all on function public.find_student_for_makeup(text, text, text) from public;
grant execute on function public.find_student_for_makeup(text, text, text) to anon, authenticated;

create or replace function public.list_scheduled_lessons_for_makeup(
  p_student_id uuid,
  p_name       text,
  p_classroom  text,
  p_grade      text,
  p_from_date  date default current_date
)
returns table (
  id           uuid,
  lesson_date  date,
  period       smallint,
  subject      text,
  attendance   attendance_status
)
language sql
stable
security definer
set search_path = public
as $list_sched$
  select l.id, l.lesson_date, l.period, l.subject, l.attendance
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
    and l.attendance = 'present'
  order by l.lesson_date, l.period;
$list_sched$;

revoke all on function public.list_scheduled_lessons_for_makeup(uuid, text, text, text, date) from public;
grant execute on function public.list_scheduled_lessons_for_makeup(uuid, text, text, text, date) to anon, authenticated;

drop function if exists public.book_makeup_lesson(uuid, date, smallint, text, text);
drop function if exists public.book_makeup_lesson(uuid, date, smallint, text, date, smallint, text, text);
drop function if exists public.book_makeup_lesson(uuid, date, smallint, text, date, smallint, text, text, text);

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
as $book_makeup$
declare
  v_student    record;
  v_venue      text;
  v_max        smallint;
  v_current    bigint;
  v_lesson_id  uuid;
  v_src_exists boolean;
begin
  if p_source_lesson_date is null or p_source_period is null or p_source_subject is null then
    raise exception '欠席する授業（日付・コマ・教科）を指定してください。';
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
         and l.attendance  = 'makeup'
       for update of l
    ) as locked;

  if v_current >= v_max then
    raise exception 'この枠は満員です。別の日時をお選びください。';
  end if;

  select exists (
    select 1 from public.lessons
     where student_id  = p_student_id
       and lesson_date = p_source_lesson_date
       and period      = p_source_period
       and subject     = p_source_subject
       and status      = 'scheduled'
       and attendance  = 'present'
  ) into v_src_exists;

  if not v_src_exists then
    raise exception '欠席にできるのは、振替フォームに表示されている「出席予定」のコマのみです。一覧にない場合は教室までお問い合わせください。';
  end if;

  update public.lessons
     set attendance = 'absent',
         updated_at = now()
   where student_id  = p_student_id
     and lesson_date = p_source_lesson_date
     and period      = p_source_period
     and subject     = p_source_subject
     and status      = 'scheduled'
     and attendance  = 'present';

  insert into public.lessons (
    student_id, teacher_id, lesson_date, period,
    attendance, subject, status, text_memo,
    source_lesson_date, source_period, source_subject,
    lesson_classroom
  ) values (
    p_student_id, v_student.created_by, p_lesson_date, p_period,
    'makeup', p_subject, 'scheduled', p_text_memo,
    p_source_lesson_date, p_source_period, p_source_subject,
    v_venue
  )
  returning id into v_lesson_id;

  return v_lesson_id;
end;
$book_makeup$;

revoke all on function public.book_makeup_lesson(uuid, date, smallint, text, date, smallint, text, text, text) from public;
grant execute on function public.book_makeup_lesson(uuid, date, smallint, text, date, smallint, text, text, text) to anon, authenticated;

-- PostgREST が関数を再認識しやすくする（無視されても害はありません）
notify pgrst, 'reload schema';
