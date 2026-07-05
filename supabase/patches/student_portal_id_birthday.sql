-- 保護者振替フォーム: 生徒ID + 誕生日での本人確認
-- Supabase SQL Editor で実行してください。

-- 1) 生徒テーブルにカラム追加
alter table public.students
  add column if not exists portal_id text,
  add column if not exists birthday date;

create unique index if not exists students_portal_id_unique
  on public.students (portal_id)
  where portal_id is not null;

comment on column public.students.portal_id is '保護者向け振替フォーム用の生徒ID（教室が発行）';
comment on column public.students.birthday is '保護者向け振替フォーム用の本人確認（誕生日）';

-- 2) 振替セッション: ログイン生徒またはその兄弟へのアクセス可否
create or replace function public.verify_makeup_session_access(
  p_portal_id  text,
  p_birthday   date,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with primary_student as (
    select id, sibling_group_id
      from public.students
     where trim(portal_id) = trim(p_portal_id)
       and birthday = p_birthday
       and portal_id is not null
       and birthday is not null
     limit 1
  )
  select exists (
    select 1 from primary_student p where p.id = p_student_id
  )
  or exists (
    select 1
      from primary_student p
      join public.students s
        on s.sibling_group_id = p.sibling_group_id
       and s.id = p_student_id
     where p.sibling_group_id is not null
       and s.id <> p.id
  );
$$;

revoke all on function public.verify_makeup_session_access(text, date, uuid) from public;
grant execute on function public.verify_makeup_session_access(text, date, uuid) to anon, authenticated;

-- 3) 本人確認（旧: 名前+教室+学年 → 新: 生徒ID+誕生日）
drop function if exists public.find_student_for_makeup(text, text, text);

create or replace function public.find_student_for_makeup(
  p_portal_id text,
  p_birthday  date
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
  where trim(s.portal_id) = trim(p_portal_id)
    and s.birthday = p_birthday
    and s.portal_id is not null
    and s.birthday is not null
  limit 5
$find_student$;

revoke all on function public.find_student_for_makeup(text, date) from public;
grant execute on function public.find_student_for_makeup(text, date) to anon, authenticated;

-- 4) 兄弟一覧
drop function if exists public.list_siblings_for_makeup(uuid, text, text, text);

create or replace function public.list_siblings_for_makeup(
  p_student_id uuid,
  p_portal_id  text,
  p_birthday   date
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
as $list_siblings$
  select
    s2.id,
    s2.name,
    s2.classroom,
    s2.grade::text,
    s2.subjects
  from public.students s1
  join public.students s2
    on s2.sibling_group_id = s1.sibling_group_id
   and s2.id <> s1.id
  where s1.id = p_student_id
    and trim(s1.portal_id) = trim(p_portal_id)
    and s1.birthday = p_birthday
    and s1.sibling_group_id is not null
    and s2.classroom is not null
    and s2.grade is not null
  order by s2.name;
$list_siblings$;

revoke all on function public.list_siblings_for_makeup(uuid, text, date) from public;
grant execute on function public.list_siblings_for_makeup(uuid, text, date) to anon, authenticated;

-- 5) 出席予定・振替予定の一覧
drop function if exists public.list_scheduled_lessons_for_makeup(uuid, text, text, text, date);

create or replace function public.list_scheduled_lessons_for_makeup(
  p_student_id uuid,
  p_portal_id  text,
  p_birthday   date,
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
as $list_sched$
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
    and l.attendance in ('present', 'makeup')
  order by l.lesson_date, l.period;
$list_sched$;

revoke all on function public.list_scheduled_lessons_for_makeup(uuid, text, date, date) from public;
grant execute on function public.list_scheduled_lessons_for_makeup(uuid, text, date, date) to anon, authenticated;

-- 6) 欠席済み（振替未登録）の一覧
drop function if exists public.list_pending_absences_for_makeup(uuid, text, text, text, date);

create or replace function public.list_pending_absences_for_makeup(
  p_student_id uuid,
  p_portal_id  text,
  p_birthday   date,
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

revoke all on function public.list_pending_absences_for_makeup(uuid, text, date, date) from public;
grant execute on function public.list_pending_absences_for_makeup(uuid, text, date, date) to anon, authenticated;

-- 7) 欠席のみ登録
drop function if exists public.mark_scheduled_lesson_absent(uuid, text, text, text, date, smallint, text);

create or replace function public.mark_scheduled_lesson_absent(
  p_student_id   uuid,
  p_portal_id    text,
  p_birthday     date,
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
  if not public.verify_makeup_session_access(p_portal_id, p_birthday, p_student_id) then
    raise exception '生徒情報を確認できませんでした。教室までお問い合わせください。';
  end if;

  if p_period < 1 or p_period > 10 then
    raise exception 'コマの指定が不正です。';
  end if;

  if p_subject not in ('プログラミング', 'ロボット') then
    raise exception '教科の指定が不正です。';
  end if;

  update public.lessons l
     set attendance = 'absent',
         updated_at = now()
   where l.student_id = p_student_id
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

revoke all on function public.mark_scheduled_lesson_absent(uuid, text, date, date, smallint, text) from public;
grant execute on function public.mark_scheduled_lesson_absent(uuid, text, date, date, smallint, text) to anon, authenticated;

notify pgrst, 'reload schema';
