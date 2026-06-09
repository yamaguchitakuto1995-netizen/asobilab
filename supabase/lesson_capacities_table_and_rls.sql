-- ============================================================
-- ① 振替枠テーブル lesson_capacities + RLS + Realtime
--
-- 実行順序:
--   1) このファイルを SQL Editor で全文 Run
--   2) lessons に source_* 列があることを確認（schema.sql の ALTER 参照）
--   3) 続けて supabase/rpc_makeup_functions_only.sql を全文 Run
--
-- （または schema.sql 全文を一度に Run しても同じ結果になります）
-- ============================================================

-- lessons と同じ updated_at トリガ用（未作成なら作る）
create or replace function public.set_updated_at()
returns trigger language plpgsql as $tg$
begin
  new.updated_at = now();
  return new;
end $tg$;

-- ------------------------------------------------------------
-- lesson_capacities テーブル
-- ------------------------------------------------------------
create table if not exists public.lesson_capacities (
  id             uuid primary key default gen_random_uuid(),
  classroom      text     not null,
  day_of_week    smallint not null,           -- 0=日, 1=月, ... 6=土
  week_ordinals  smallint[] not null default array[1,2,3,4,5]::smallint[],
  period         smallint not null,           -- 1〜10コマ目
  subject        text     not null,           -- 'プログラミング' / 'ロボット'
  max_students   smallint not null default 4,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (classroom, day_of_week, period, subject)
);

alter table public.lesson_capacities add column if not exists week_ordinals smallint[] not null default array[1,2,3,4,5]::smallint[];

do $c$ begin
  alter table public.lesson_capacities add constraint lesson_capacities_classroom_check
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
exception when duplicate_object then null; end $c$;

do $c$ begin
  alter table public.lesson_capacities add constraint lesson_capacities_dow_check
    check (day_of_week between 0 and 6);
exception when duplicate_object then null; end $c$;

do $c$ begin
  alter table public.lesson_capacities add constraint lesson_capacities_period_check
    check (period between 1 and 10);
exception when duplicate_object then null; end $c$;

do $c$ begin
  alter table public.lesson_capacities add constraint lesson_capacities_subject_check
    check (subject in ('プログラミング', 'ロボット'));
exception when duplicate_object then null; end $c$;

do $c$ begin
  alter table public.lesson_capacities add constraint lesson_capacities_max_check
    check (max_students >= 0);
exception when duplicate_object then null; end $c$;

do $c$ begin
  alter table public.lesson_capacities add constraint lesson_capacities_week_ordinals_check
    check (
      cardinality(week_ordinals) >= 1
      and week_ordinals <@ array[1,2,3,4,5]::smallint[]
    );
exception when duplicate_object then null; end $c$;

create index if not exists lesson_capacities_lookup_idx
  on public.lesson_capacities (classroom, day_of_week, period, subject);

drop trigger if exists lesson_capacities_set_updated_at on public.lesson_capacities;
create trigger lesson_capacities_set_updated_at
  before update on public.lesson_capacities
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.lesson_capacities enable row level security;

drop policy if exists "lc: authenticated read" on public.lesson_capacities;
drop policy if exists "lc: admin write"        on public.lesson_capacities;

create policy "lc: authenticated read"
  on public.lesson_capacities for select
  to authenticated
  using (true);

create policy "lc: admin write"
  on public.lesson_capacities for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- Realtime（空き更新の購読用。無ければスキップ）
-- ------------------------------------------------------------
do $r$ begin
  alter publication supabase_realtime add table public.lessons;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $r$;

do $r$ begin
  alter publication supabase_realtime add table public.lesson_capacities;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $r$;
