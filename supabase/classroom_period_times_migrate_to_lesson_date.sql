-- ============================================================
-- 移行: classroom_period_times を「第◯週」→「開催日 lesson_date」に変更
--
-- 旧列（day_of_week, week_ordinals）がある場合のみ:
--   データ全削除 → 列削除 → lesson_date 追加
-- すでに lesson_date のみの場合は、インデックスの再作成だけ試みます（重複はスキップ）
--
-- 実行後: notify で API キャッシュ更新
-- ============================================================

do $migrate$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'classroom_period_times'
      and column_name = 'day_of_week'
  ) then
    drop index if exists public.classroom_period_times_unique_any_subject;
    drop index if exists public.classroom_period_times_unique_subject;
    drop index if exists public.classroom_period_times_lookup_idx;

 -- 第◯週から日付へ自動変換はしないため全削除（アプリから再登録 / CSV）
    truncate public.classroom_period_times;

    alter table public.classroom_period_times
      drop constraint if exists classroom_period_times_dow_check;
    alter table public.classroom_period_times
      drop constraint if exists classroom_period_times_week_ordinals_check;

    alter table public.classroom_period_times drop column day_of_week;
    alter table public.classroom_period_times drop column week_ordinals;
  end if;
end
$migrate$;

alter table public.classroom_period_times
  add column if not exists lesson_date date;

delete from public.classroom_period_times where lesson_date is null;

alter table public.classroom_period_times
  alter column lesson_date set not null;

drop index if exists public.classroom_period_times_unique_any_subject;
drop index if exists public.classroom_period_times_unique_subject;
drop index if exists public.classroom_period_times_lookup_idx;

do $$ begin
  alter table public.classroom_period_times add constraint classroom_period_times_period_check
    check (period between 1 and 10);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.classroom_period_times add constraint classroom_period_times_subject_check
    check (subject is null or subject in ('プログラミング', 'ロボット'));
exception when duplicate_object then null; end $$;

create index if not exists classroom_period_times_lookup_idx
  on public.classroom_period_times (classroom, lesson_date, period);

create unique index if not exists classroom_period_times_unique_any_subject
  on public.classroom_period_times (classroom, lesson_date, period)
  where subject is null;

create unique index if not exists classroom_period_times_unique_subject
  on public.classroom_period_times (classroom, lesson_date, period, subject)
  where subject is not null;

drop trigger if exists classroom_period_times_set_updated_at on public.classroom_period_times;
create trigger classroom_period_times_set_updated_at
  before update on public.classroom_period_times
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
