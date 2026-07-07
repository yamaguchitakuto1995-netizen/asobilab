-- 同一コマの scheduled 授業が二重に作られる問題の修正
-- （コマ時刻登録時の出席予定自動作成 + 日次ボードの補完が重なる）
-- Supabase SQL Editor で実行してください。

-- 1) 既存の重複 scheduled 行を削除（古い id を残す）
delete from public.lessons a
using public.lessons b
where a.student_id = b.student_id
  and a.lesson_date = b.lesson_date
  and a.period = b.period
  and a.subject = b.subject
  and a.status = 'scheduled'
  and b.status = 'scheduled'
  and a.period is not null
  and a.subject is not null
  and a.id > b.id;

-- 2) 今後の重複 insert を拒否
create unique index if not exists lessons_unique_scheduled_slot
  on public.lessons (student_id, lesson_date, period, subject)
  where status = 'scheduled'
    and period is not null
    and subject is not null;

-- 3) 振替元一覧 RPC: 同一コマは1行だけ返す
create or replace function public.list_scheduled_lessons_for_makeup(
  p_student_id uuid,
  p_portal_id  text,
  p_birthday   text,
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
  select distinct on (l.lesson_date, l.period, l.subject)
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
  order by l.lesson_date, l.period, l.subject, l.created_at, l.id;
$list_sched$;

revoke all on function public.list_scheduled_lessons_for_makeup(uuid, text, text, date) from public;
grant execute on function public.list_scheduled_lessons_for_makeup(uuid, text, text, date) to anon, authenticated;

notify pgrst, 'reload schema';
