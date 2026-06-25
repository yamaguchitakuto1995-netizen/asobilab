-- 振替フォーム: 匿名ユーザー向けに兄弟一覧を返す（RLS を bypass）
-- Supabase SQL Editor で実行してください。

create or replace function public.list_siblings_for_makeup(
  p_student_id uuid,
  p_name       text,
  p_classroom  text,
  p_grade      text
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
    and lower(trim(s1.name)) = lower(trim(p_name))
    and s1.classroom = p_classroom
    and s1.grade::text = p_grade
    and s1.sibling_group_id is not null
    and s2.classroom is not null
    and s2.grade is not null
  order by s2.name;
$list_siblings$;

revoke all on function public.list_siblings_for_makeup(uuid, text, text, text) from public;
grant execute on function public.list_siblings_for_makeup(uuid, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
