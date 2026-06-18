-- 兄弟姉妹グループ + 振替一括申請
-- Supabase SQL Editor で実行してください。

alter table public.students
  add column if not exists sibling_group_id uuid;

create index if not exists students_sibling_group_id_idx
  on public.students (sibling_group_id)
  where sibling_group_id is not null;

comment on column public.students.sibling_group_id is
  '同一グループの兄弟姉妹。振替申請の一括入力・保護者画面で利用。';

-- 複数生徒の振替を1トランザクションで登録
create or replace function public.book_makeup_lessons_batch(p_bookings jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $batch$
declare
  v_item jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if p_bookings is null or jsonb_array_length(p_bookings) = 0 then
    raise exception '振替内容がありません。';
  end if;

  for v_item in select * from jsonb_array_elements(p_bookings)
  loop
    v_id := public.book_makeup_lesson(
      (v_item->>'student_id')::uuid,
      (v_item->>'lesson_date')::date,
      (v_item->>'period')::smallint,
      v_item->>'subject',
      (v_item->>'source_lesson_date')::date,
      (v_item->>'source_period')::smallint,
      v_item->>'source_subject',
      nullif(trim(v_item->>'text_memo'), ''),
      nullif(trim(v_item->>'lesson_classroom'), '')
    );
    v_ids := array_append(v_ids, v_id);
  end loop;

  return v_ids;
end;
$batch$;

revoke all on function public.book_makeup_lessons_batch(jsonb) from public;
grant execute on function public.book_makeup_lessons_batch(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
