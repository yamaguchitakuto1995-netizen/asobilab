-- 教室マスタ（拡張用）。既存 DB では SQL Editor でこのファイルを実行してください。
-- 実行後: コマ時刻設定画面から新規教室を追加できます。

create table if not exists public.classrooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  subjects    text[] not null default '{}',
  note        text,
  sort_order  smallint not null default 0,
  default_max_students smallint not null default 4,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint classrooms_name_unique unique (name),
  constraint classrooms_subjects_check
    check (
      cardinality(subjects) >= 1
      and subjects <@ array['プログラミング', 'ロボット']::text[]
    )
);

alter table public.classrooms
  add column if not exists default_max_students smallint not null default 4;

do $$ begin
  alter table public.classrooms add constraint classrooms_default_max_students_check
    check (default_max_students >= 0 and default_max_students <= 99);
exception when duplicate_object then null; end $$;

create index if not exists classrooms_sort_idx on public.classrooms (sort_order, name);

drop trigger if exists classrooms_set_updated_at on public.classrooms;
create trigger classrooms_set_updated_at
  before update on public.classrooms
  for each row execute function public.set_updated_at();

-- 既存の固定リストを投入（未登録の教室のみ）
insert into public.classrooms (name, subjects, sort_order) values
  ('長浜八幡中山教室',                       array['ロボット']::text[], 1),
  ('長浜駅前通り教室',                       array['ロボット', 'プログラミング']::text[], 2),
  ('米原駅前教室',                           array['ロボット', 'プログラミング']::text[], 3),
  ('米原長岡教室',                           array['ロボット', 'プログラミング']::text[], 4),
  ('西宮鳴尾町教室',                         array['ロボット', 'プログラミング']::text[], 5),
  ('出屋敷教室',                             array['ロボット', 'プログラミング']::text[], 6),
  ('長浜神照教室',                           array['プログラミング']::text[], 7),
  ('学校法人芦屋学園芦屋大学附属幼稚園教室', array['ロボット']::text[], 8)
on conflict (name) do nothing;

-- 固定 CHECK を外し classrooms への FK に置き換え
alter table public.students drop constraint if exists students_classroom_check;
alter table public.lesson_capacities drop constraint if exists lesson_capacities_classroom_check;
alter table public.classroom_period_times drop constraint if exists classroom_period_times_classroom_check;
alter table public.lessons drop constraint if exists lessons_lesson_classroom_check;

do $$ begin
  alter table public.students add constraint students_classroom_fkey
    foreign key (classroom) references public.classrooms (name)
    on update cascade on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.lesson_capacities add constraint lesson_capacities_classroom_fkey
    foreign key (classroom) references public.classrooms (name)
    on update cascade on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.classroom_period_times add constraint classroom_period_times_classroom_fkey
    foreign key (classroom) references public.classrooms (name)
    on update cascade on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.lessons add constraint lessons_lesson_classroom_fkey
    foreign key (lesson_classroom) references public.classrooms (name)
    on update cascade on delete restrict;
exception when duplicate_object then null; end $$;

alter table public.classrooms enable row level security;

drop policy if exists "classrooms: public read" on public.classrooms;
drop policy if exists "classrooms: admin write" on public.classrooms;

create policy "classrooms: public read"
  on public.classrooms for select
  using (true);

create policy "classrooms: admin write"
  on public.classrooms for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.classrooms to anon, authenticated;
grant insert, update, delete on public.classrooms to authenticated;
