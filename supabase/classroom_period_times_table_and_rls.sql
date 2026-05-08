-- ============================================================
-- コマ時刻テーブル classroom_period_times + RLS
-- 開催日 = lesson_date（暦日）。第◯週は使いません。
--
-- 新規プロジェクト: このファイルを SQL Editor で全文 Run
-- 既存 DB（day_of_week / week_ordinals 版）からの移行:
--   → 先に classroom_period_times_migrate_to_lesson_date.sql を Run
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $tg$
begin
  new.updated_at = now();
  return new;
end $tg$;

create table if not exists public.classroom_period_times (
  id             uuid primary key default gen_random_uuid(),
  classroom      text     not null,
  lesson_date    date     not null,
  period         smallint not null,
  subject        text,
  start_time     time     not null,
  end_time       time     not null,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint classroom_period_times_time_order check (start_time < end_time)
);

do $$ begin
  alter table public.classroom_period_times add constraint classroom_period_times_classroom_check
    check (classroom in (
      '長浜八幡中山教室',
      '長浜駅前通り教室',
      '米原駅前教室',
      '米原長岡教室',
      '西宮鳴尾町教室',
      '出屋敷教室',
      '長浜神照教室',
      '学校法人芦屋学園芦屋大学附属幼稚園教室'
    ));
exception when duplicate_object then null; end $$;

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

drop index if exists classroom_period_times_unique_any_subject;
drop index if exists classroom_period_times_unique_subject;

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

alter table public.classroom_period_times enable row level security;

drop policy if exists "cpt: public read" on public.classroom_period_times;
drop policy if exists "cpt: admin write" on public.classroom_period_times;

create policy "cpt: public read"
  on public.classroom_period_times for select
  to anon, authenticated
  using (true);

create policy "cpt: admin write"
  on public.classroom_period_times for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.classroom_period_times to anon, authenticated;
grant insert, update, delete on public.classroom_period_times to authenticated;

notify pgrst, 'reload schema';
