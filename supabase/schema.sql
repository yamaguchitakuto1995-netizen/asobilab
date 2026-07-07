-- ============================================================
-- ASOBI Lab. - Supabase schema
-- 実行手順: Supabase ダッシュボード → SQL Editor → 全文を貼り付けて Run
-- ============================================================

-- ------------------------------------------------------------
-- 1) ENUM 型
-- ------------------------------------------------------------
do $$ begin
  create type grade_level as enum (
    '年少','年中','年長',
    '小1','小2','小3','小4','小5','小6',
    '中1','中2','中3',
    '高1','高2','高3','浪人','その他'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_status as enum (
    'present', 'absent', 'late', 'makeup', 'on_leave'
  );
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2) teacher_profiles テーブル (講師の付加情報 + 管理者フラグ)
-- ------------------------------------------------------------
create table if not exists public.teacher_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- アカウント種別（is_staff_user より先に列が必要）
alter table public.teacher_profiles
  add column if not exists account_role text not null default 'staff';

alter table public.teacher_profiles
  add column if not exists phone text;

alter table public.teacher_profiles
  add column if not exists instructor_login_secret text;

do $$ begin
  alter table public.teacher_profiles add constraint teacher_profiles_account_role_check
    check (account_role in ('staff', 'parent'));
exception when duplicate_object then null; end $$;

update public.teacher_profiles set account_role = 'staff' where account_role is null;

-- ------------------------------------------------------------
-- 3) 管理者判定ヘルパー (RLS 用 / security definer で再帰回避)
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select tp.is_admin from public.teacher_profiles tp where tp.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

/** 職員アカウント（全生徒にアクセス可なロール）かどうか */
create or replace function public.is_staff_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teacher_profiles tp
    where tp.id = auth.uid() and tp.account_role = 'staff'
  );
$$;

revoke all on function public.is_staff_user() from public;
grant execute on function public.is_staff_user() to authenticated;

-- ------------------------------------------------------------
-- 4) サインアップ時に teacher_profiles を自動作成
--    特定メールアドレスは自動的に管理者へ昇格
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_emails text[] := array[
    'yamaguchi.takuto1995@gmail.com'
  ];
begin
  insert into public.teacher_profiles (id, email, is_admin)
  values (
    new.id,
    new.email,
    new.email = any (admin_emails)
  )
  on conflict (id) do update
    set email    = excluded.email,
        is_admin = excluded.is_admin or public.teacher_profiles.is_admin;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 既に登録済みのユーザがいた場合のリカバリ (初回適用後にも安全に動く)
-- is_admin は admin_emails に含まれるメール、または既に true の行は維持
insert into public.teacher_profiles (id, email, is_admin)
select
  u.id,
  u.email,
  u.email = any (array[
    'yamaguchi.takuto1995@gmail.com'
  ]::text[])
from auth.users u
on conflict (id) do update
  set email    = excluded.email,
      is_admin = excluded.is_admin or public.teacher_profiles.is_admin;

-- ------------------------------------------------------------
-- 5) students テーブル
-- ------------------------------------------------------------
create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  grade       grade_level not null,
  classroom   text,
  subjects    text[] not null default '{}',
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid not null references auth.users(id) on delete restrict
);

-- 既存 DB に対するカラム追加 (冪等)
alter table public.students add column if not exists subjects  text[] not null default '{}';
alter table public.students add column if not exists classroom text;

-- subjects は 'プログラミング' または 'ロボット' のみ
do $$ begin
  alter table public.students add constraint students_subjects_check
    check (subjects <@ array['プログラミング', 'ロボット']::text[]);
exception when duplicate_object then null; end $$;

-- classroom は許可リストから選択 (NULL も可)
do $$ begin
  alter table public.students add constraint students_classroom_check
    check (classroom is null or classroom in (
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

create index if not exists students_name_idx      on public.students (name);
create index if not exists students_subjects_idx  on public.students using gin (subjects);
create index if not exists students_classroom_idx on public.students (classroom);

-- 次回テキスト（大枠[/ 周] / 単元）。再生成: npm run gen:next-text-sql
alter table public.students add column if not exists next_text_robot text;
do $$ begin
  alter table public.students add constraint students_next_text_robot_check
    check (
      next_text_robot is null
      or next_text_robot = any (
      ARRAY[
          'スタートアップ（入会時） / SU1',
          'スタートアップ（入会時） / SU2',
          'プレプライマリー / 1-1',
          'プレプライマリー / 1-2',
          'プレプライマリー / 2-1',
          'プレプライマリー / 2-2',
          'プレプライマリー / 3-1',
          'プレプライマリー / 3-2',
          'プレプライマリー / 4-1',
          'プレプライマリー / 4-2',
          'プレプライマリー / 5-1',
          'プレプライマリー / 5-2',
          'プレプライマリー / 6-1',
          'プレプライマリー / 6-2',
          'プレプライマリー / 7-1',
          'プレプライマリー / 7-2',
          'プレプライマリー / 8-1',
          'プレプライマリー / 8-2',
          'プレプライマリー / 9-1',
          'プレプライマリー / 9-2',
          'プレプライマリー / 10-1',
          'プレプライマリー / 10-2',
          'プレプライマリー / 11-1',
          'プレプライマリー / 11-2',
          'プレプライマリー / 12-1',
          'プレプライマリー / 12-2',
          'プライマリー / 1-1',
          'プライマリー / 1-2',
          'プライマリー / 2-1',
          'プライマリー / 2-2',
          'プライマリー / 3-1',
          'プライマリー / 3-2',
          'プライマリー / 4-1',
          'プライマリー / 4-2',
          'プライマリー / 5-1',
          'プライマリー / 5-2',
          'プライマリー / 6-1',
          'プライマリー / 6-2',
          'プライマリー / 7-1',
          'プライマリー / 7-2',
          'プライマリー / 8-1',
          'プライマリー / 8-2',
          'プライマリー / 9-1',
          'プライマリー / 9-2',
          'プライマリー / 10-1',
          'プライマリー / 10-2',
          'プライマリー / 11-1',
          'プライマリー / 11-2',
          'プライマリー / 12-1',
          'プライマリー / 12-2',
          'ベーシック（2周） / 1周目 / 1-1',
          'ベーシック（2周） / 1周目 / 1-2',
          'ベーシック（2周） / 1周目 / 2-1',
          'ベーシック（2周） / 1周目 / 2-2',
          'ベーシック（2周） / 1周目 / 3-1',
          'ベーシック（2周） / 1周目 / 3-2',
          'ベーシック（2周） / 1周目 / 4-1',
          'ベーシック（2周） / 1周目 / 4-2',
          'ベーシック（2周） / 1周目 / 5-1',
          'ベーシック（2周） / 1周目 / 5-2',
          'ベーシック（2周） / 1周目 / 6-1',
          'ベーシック（2周） / 1周目 / 6-2',
          'ベーシック（2周） / 1周目 / 7-1',
          'ベーシック（2周） / 1周目 / 7-2',
          'ベーシック（2周） / 1周目 / 8-1',
          'ベーシック（2周） / 1周目 / 8-2',
          'ベーシック（2周） / 1周目 / 9-1',
          'ベーシック（2周） / 1周目 / 9-2',
          'ベーシック（2周） / 1周目 / 10-1',
          'ベーシック（2周） / 1周目 / 10-2',
          'ベーシック（2周） / 1周目 / 11-1',
          'ベーシック（2周） / 1周目 / 11-2',
          'ベーシック（2周） / 1周目 / 12-1',
          'ベーシック（2周） / 1周目 / 12-2',
          'ベーシック（2周） / 2周目 / 1-1',
          'ベーシック（2周） / 2周目 / 1-2',
          'ベーシック（2周） / 2周目 / 2-1',
          'ベーシック（2周） / 2周目 / 2-2',
          'ベーシック（2周） / 2周目 / 3-1',
          'ベーシック（2周） / 2周目 / 3-2',
          'ベーシック（2周） / 2周目 / 4-1',
          'ベーシック（2周） / 2周目 / 4-2',
          'ベーシック（2周） / 2周目 / 5-1',
          'ベーシック（2周） / 2周目 / 5-2',
          'ベーシック（2周） / 2周目 / 6-1',
          'ベーシック（2周） / 2周目 / 6-2',
          'ベーシック（2周） / 2周目 / 7-1',
          'ベーシック（2周） / 2周目 / 7-2',
          'ベーシック（2周） / 2周目 / 8-1',
          'ベーシック（2周） / 2周目 / 8-2',
          'ベーシック（2周） / 2周目 / 9-1',
          'ベーシック（2周） / 2周目 / 9-2',
          'ベーシック（2周） / 2周目 / 10-1',
          'ベーシック（2周） / 2周目 / 10-2',
          'ベーシック（2周） / 2周目 / 11-1',
          'ベーシック（2周） / 2周目 / 11-2',
          'ベーシック（2周） / 2周目 / 12-1',
          'ベーシック（2周） / 2周目 / 12-2',
          'ミドル（2周） / 1周目 / SU1',
          'ミドル（2周） / 1周目 / SU2',
          'ミドル（2周） / 1周目 / 1-1',
          'ミドル（2周） / 1周目 / 1-2',
          'ミドル（2周） / 1周目 / 2-1',
          'ミドル（2周） / 1周目 / 2-2',
          'ミドル（2周） / 1周目 / 3-1',
          'ミドル（2周） / 1周目 / 3-2',
          'ミドル（2周） / 1周目 / 4-1',
          'ミドル（2周） / 1周目 / 4-2',
          'ミドル（2周） / 1周目 / 5-1',
          'ミドル（2周） / 1周目 / 5-2',
          'ミドル（2周） / 1周目 / 6-1',
          'ミドル（2周） / 1周目 / 6-2',
          'ミドル（2周） / 1周目 / 7-1',
          'ミドル（2周） / 1周目 / 7-2',
          'ミドル（2周） / 1周目 / 8-1',
          'ミドル（2周） / 1周目 / 8-2',
          'ミドル（2周） / 1周目 / 9-1',
          'ミドル（2周） / 1周目 / 9-2',
          'ミドル（2周） / 1周目 / 10-1',
          'ミドル（2周） / 1周目 / 10-2',
          'ミドル（2周） / 1周目 / 11-1',
          'ミドル（2周） / 1周目 / 11-2',
          'ミドル（2周） / 1周目 / 12-1',
          'ミドル（2周） / 1周目 / 12-2',
          'ミドル（2周） / 2周目 / 1-1',
          'ミドル（2周） / 2周目 / 1-2',
          'ミドル（2周） / 2周目 / 2-1',
          'ミドル（2周） / 2周目 / 2-2',
          'ミドル（2周） / 2周目 / 3-1',
          'ミドル（2周） / 2周目 / 3-2',
          'ミドル（2周） / 2周目 / 4-1',
          'ミドル（2周） / 2周目 / 4-2',
          'ミドル（2周） / 2周目 / 5-1',
          'ミドル（2周） / 2周目 / 5-2',
          'ミドル（2周） / 2周目 / 6-1',
          'ミドル（2周） / 2周目 / 6-2',
          'ミドル（2周） / 2周目 / 7-1',
          'ミドル（2周） / 2周目 / 7-2',
          'ミドル（2周） / 2周目 / 8-1',
          'ミドル（2周） / 2周目 / 8-2',
          'ミドル（2周） / 2周目 / 9-1',
          'ミドル（2周） / 2周目 / 9-2',
          'ミドル（2周） / 2周目 / 10-1',
          'ミドル（2周） / 2周目 / 10-2',
          'ミドル（2周） / 2周目 / 11-1',
          'ミドル（2周） / 2周目 / 11-2',
          'ミドル（2周） / 2周目 / 12-1',
          'ミドル（2周） / 2周目 / 12-2',
          'アドバンス（2周） / 1周目 / SU1',
          'アドバンス（2周） / 1周目 / SU2',
          'アドバンス（2周） / 1周目 / 2・3-1',
          'アドバンス（2周） / 1周目 / 2・3-2',
          'アドバンス（2周） / 1周目 / 2・3-3',
          'アドバンス（2周） / 1周目 / 2・3-4',
          'アドバンス（2周） / 1周目 / 4・5-1',
          'アドバンス（2周） / 1周目 / 4・5-2',
          'アドバンス（2周） / 1周目 / 6・7-1',
          'アドバンス（2周） / 1周目 / 6・7-2',
          'アドバンス（2周） / 1周目 / 6・7-3',
          'アドバンス（2周） / 1周目 / 6・7-4',
          'アドバンス（2周） / 1周目 / 8・9-1',
          'アドバンス（2周） / 1周目 / 10・11-1',
          'アドバンス（2周） / 1周目 / 12・1-1',
          'アドバンス（2周） / 2周目 / 2・3-1',
          'アドバンス（2周） / 2周目 / 2・3-2',
          'アドバンス（2周） / 2周目 / 2・3-3',
          'アドバンス（2周） / 2周目 / 2・3-4',
          'アドバンス（2周） / 2周目 / 4・5-1',
          'アドバンス（2周） / 2周目 / 4・5-2',
          'アドバンス（2周） / 2周目 / 6・7-1',
          'アドバンス（2周） / 2周目 / 6・7-2',
          'アドバンス（2周） / 2周目 / 6・7-3',
          'アドバンス（2周） / 2周目 / 6・7-4',
          'アドバンス（2周） / 2周目 / 8・9-1',
          'アドバンス（2周） / 2周目 / 10・11-1',
          'アドバンス（2周） / 2周目 / 12・1-1'
      ]::text[]
      )
    );
exception when duplicate_object then null; end $$;

alter table public.students add column if not exists next_text_programming text;
do $$ begin
  alter table public.students add constraint students_next_text_programming_check
    check (
      next_text_programming is null
      or next_text_programming = any (
      ARRAY[
          'スタートアップ（入会時） / SU1',
          'スタートアップ（入会時） / SU2',
          'ベーシック / 1-1',
          'ベーシック / 1-2',
          'ベーシック / 2-1',
          'ベーシック / 2-2',
          'ベーシック / 3-1',
          'ベーシック / 3-2',
          'ベーシック / 4-1',
          'ベーシック / 4-2',
          'ベーシック / 5-1',
          'ベーシック / 5-2',
          'ベーシック / 6-1',
          'ベーシック / 6-2',
          'ベーシック / 7-1',
          'ベーシック / 7-2',
          'ベーシック / 8-1',
          'ベーシック / 8-2',
          'ベーシック / 9-1',
          'ベーシック / 9-2',
          'ベーシック / 10-1',
          'ベーシック / 10-2',
          'ベーシック / 11-1',
          'ベーシック / 11-2',
          'ベーシック / 12-1',
          'ベーシック / 12-2',
          'ベーシック2 / SU1',
          'ベーシック2 / SU2',
          'ベーシック2 / 1-1',
          'ベーシック2 / 1-2',
          'ベーシック2 / 2-1',
          'ベーシック2 / 2-2',
          'ベーシック2 / 3-1',
          'ベーシック2 / 3-2',
          'ベーシック2 / 4-1',
          'ベーシック2 / 4-2',
          'ベーシック2 / 5-1',
          'ベーシック2 / 5-2',
          'ベーシック2 / 6-1',
          'ベーシック2 / 6-2',
          'ベーシック2 / 7-1',
          'ベーシック2 / 7-2',
          'ベーシック2 / 8-1',
          'ベーシック2 / 8-2',
          'ベーシック2 / 9-1',
          'ベーシック2 / 9-2',
          'ベーシック2 / 10-1',
          'ベーシック2 / 10-2',
          'ベーシック2 / 11-1',
          'ベーシック2 / 11-2',
          'ベーシック2 / 12-1',
          'ベーシック2 / 12-2',
          'ミドル / 1-1',
          'ミドル / 1-2',
          'ミドル / 2-1',
          'ミドル / 2-2',
          'ミドル / 3-1',
          'ミドル / 3-2',
          'ミドル / 4-1',
          'ミドル / 4-2',
          'ミドル / 5-1',
          'ミドル / 5-2',
          'ミドル / 6-1',
          'ミドル / 6-2',
          'ミドル / 7-1',
          'ミドル / 7-2',
          'ミドル / 8-1',
          'ミドル / 8-2',
          'ミドル / 9-1',
          'ミドル / 9-2',
          'ミドル / 10-1',
          'ミドル / 10-2',
          'ミドル / 11-1',
          'ミドル / 11-2',
          'ミドル / 12-1',
          'ミドル / 12-2',
          'ミドル2 / SU1',
          'ミドル2 / SU2',
          'ミドル2 / 1-1',
          'ミドル2 / 1-2',
          'ミドル2 / 2-1',
          'ミドル2 / 2-2',
          'ミドル2 / 3-1',
          'ミドル2 / 3-2',
          'ミドル2 / 4-1',
          'ミドル2 / 4-2',
          'ミドル2 / 5-1',
          'ミドル2 / 5-2',
          'ミドル2 / 6-1',
          'ミドル2 / 6-2',
          'ミドル2 / 7-1',
          'ミドル2 / 7-2',
          'ミドル2 / 8-1',
          'ミドル2 / 8-2',
          'ミドル2 / 9-1',
          'ミドル2 / 9-2',
          'ミドル2 / 10-1',
          'ミドル2 / 10-2',
          'ミドル2 / 11-1',
          'ミドル2 / 11-2',
          'ミドル2 / 12-1',
          'ミドル2 / 12-2',
          'アドバンス / SU1',
          'アドバンス / SU2',
          'アドバンス / 1-1',
          'アドバンス / 1-2',
          'アドバンス / 2-1',
          'アドバンス / 2-2',
          'アドバンス / 3-1',
          'アドバンス / 3-2',
          'アドバンス / 4-1',
          'アドバンス / 4-2',
          'アドバンス / 5-1',
          'アドバンス / 5-2',
          'アドバンス / 6-1',
          'アドバンス / 6-2',
          'アドバンス / 7-1',
          'アドバンス / 7-2',
          'アドバンス / 8-1',
          'アドバンス / 8-2',
          'アドバンス / 9-1',
          'アドバンス / 9-2',
          'アドバンス / 10-1',
          'アドバンス / 10-2',
          'アドバンス / 11-1',
          'アドバンス / 11-2',
          'アドバンス / 12-1',
          'アドバンス / 12-2'
      ]::text[]
      )
    );
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 5.5) parent_student_links（保護者アカウント ↔ 生徒）
-- ------------------------------------------------------------
create table if not exists public.parent_student_links (
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  student_id     uuid not null references public.students(id) on delete cascade,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id) on delete set null,
  primary key (parent_user_id, student_id)
);

create index if not exists parent_student_links_student_idx
  on public.parent_student_links (student_id);

alter table public.parent_student_links enable row level security;

-- ------------------------------------------------------------
-- 6) lessons テーブル
-- ------------------------------------------------------------
create table if not exists public.lessons (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.students(id) on delete cascade,
  teacher_id         uuid not null references auth.users(id)      on delete restrict,
  lesson_date        date not null,
  period             smallint,                       -- 何コマ目か (1〜10) / 未設定可
  attendance         attendance_status not null default 'present',
  subject            text,
  textbook           text,                           -- 使用テキスト (任意)
  status             text not null default 'recorded',
  text_memo          text,
  source_lesson_date date,                         -- 振替の元になった欠席授業日
  source_period      smallint,
  source_subject     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 既存 DB へのカラム追加 (冪等)
alter table public.lessons add column if not exists subject  text;
alter table public.lessons add column if not exists status   text not null default 'recorded';
alter table public.lessons add column if not exists period   smallint;
alter table public.lessons add column if not exists textbook text;
alter table public.lessons add column if not exists source_lesson_date date;
alter table public.lessons add column if not exists source_period   smallint;
alter table public.lessons add column if not exists source_subject  text;
alter table public.lessons add column if not exists lesson_classroom text;
alter table public.lessons add column if not exists created_from_enrollment boolean not null default false;
alter table public.lessons add column if not exists registered_via_detail boolean not null default false;

-- 実施会場（別教室での振替など）。null = 生徒の所属教室と同じ扱い
do $$ begin
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
exception when duplicate_object then null; end $$;

-- period は 1〜10 のいずれか、または未設定 (null)
do $$ begin
  alter table public.lessons add constraint lessons_period_check
    check (period is null or (period between 1 and 10));
exception when duplicate_object then null; end $$;

-- subject を 'プログラミング' / 'ロボット' に限定する前に、既存の他値を NULL にクリア
update public.lessons
   set subject = null
 where subject is not null
   and subject not in ('プログラミング', 'ロボット');

do $$ begin
  alter table public.lessons add constraint lessons_subject_check
    check (subject is null or subject in ('プログラミング', 'ロボット'));
exception when duplicate_object then null; end $$;

-- status は 'scheduled' (予定) か 'recorded' (記録済み)
do $$ begin
  alter table public.lessons add constraint lessons_status_check
    check (status in ('scheduled', 'recorded'));
exception when duplicate_object then null; end $$;

-- 予定 (scheduled) のときは attendance に 'late' を許さない
do $$ begin
  alter table public.lessons add constraint lessons_status_attendance_check
    check (status = 'recorded' or attendance <> 'late');
exception when duplicate_object then null; end $$;

-- 振替元: 3 つ揃うか null のみ
do $$ begin
  alter table public.lessons add constraint lessons_source_triple_check
    check (
      (source_lesson_date is null and source_period is null and source_subject is null)
      or (
        source_lesson_date is not null
        and source_period between 1 and 10
        and source_subject in ('プログラミング', 'ロボット')
      )
    );
exception when duplicate_object then null; end $$;

create index if not exists lessons_subject_idx     on public.lessons (subject);
create index if not exists lessons_status_date_idx on public.lessons (status, lesson_date);
create index if not exists lessons_date_period_idx on public.lessons (lesson_date, period);

create index if not exists lessons_student_date_idx
  on public.lessons (student_id, lesson_date desc);

create index if not exists lessons_teacher_date_idx
  on public.lessons (teacher_id, lesson_date desc);

-- 同一コマの scheduled 重複を防ぐ（コマ時刻登録と日次補完の二重作成対策）
create unique index if not exists lessons_unique_scheduled_slot
  on public.lessons (student_id, lesson_date, period, subject)
  where status = 'scheduled'
    and period is not null
    and subject is not null;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists lessons_set_updated_at on public.lessons;
create trigger lessons_set_updated_at
before update on public.lessons
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 6.5) lesson_capacities テーブル
--      (教室, 曜日, コマ, 教科) 単位で 振替の最大受け入れ人数 を保持
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
alter table public.lesson_capacities alter column max_students set default 4;

do $$ begin
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
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.lesson_capacities add constraint lesson_capacities_dow_check
    check (day_of_week between 0 and 6);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.lesson_capacities add constraint lesson_capacities_period_check
    check (period between 1 and 10);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.lesson_capacities add constraint lesson_capacities_subject_check
    check (subject in ('プログラミング', 'ロボット'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.lesson_capacities add constraint lesson_capacities_max_check
    check (max_students >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.lesson_capacities add constraint lesson_capacities_week_ordinals_check
    check (
      cardinality(week_ordinals) >= 1
      and week_ordinals <@ array[1,2,3,4,5]::smallint[]
    );
exception when duplicate_object then null; end $$;

create index if not exists lesson_capacities_lookup_idx
  on public.lesson_capacities (classroom, day_of_week, period, subject);

-- 生徒のレギュラー出席コマ（lesson_capacities）。コマ時刻設定と連動して出席予定を自動生成する。
alter table public.students add column if not exists enrollment_robot_capacity_id uuid;
alter table public.students add column if not exists enrollment_prog_capacity_id uuid;

alter table public.students add column if not exists sibling_group_id uuid;

alter table public.students add column if not exists portal_id text;
alter table public.students add column if not exists birthday text;

do $$ begin
  alter table public.students add constraint students_birthday_mmdd_check
    check (
      birthday is null
      or birthday ~ '^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'
    );
exception when duplicate_object then null; end $$;

create unique index if not exists students_portal_id_unique
  on public.students (portal_id)
  where portal_id is not null;

alter table public.students add column if not exists name_kana text;

alter table public.students add column if not exists leave_from_ym text;
alter table public.students add column if not exists leave_until_ym text;
alter table public.students add column if not exists persistent_memo text;
alter table public.students add column if not exists grade_promoted_through_ym text;
alter table public.students add column if not exists withdrawal_until_ym text;

do $$ begin
  alter table public.students add constraint students_withdrawal_until_ym_check
    check (withdrawal_until_ym is null or withdrawal_until_ym ~ '^\d{4}-(0[1-9]|1[0-2])$');
exception when duplicate_object then null; end $$;

alter table public.students add column if not exists scratch_login_id text;
alter table public.students add column if not exists scratch_login_pass text;
alter table public.students add column if not exists minecraft_login text;
alter table public.students add column if not exists promotion_scheduled_ym text;
alter table public.students add column if not exists promotion_type text not null default 'normal';
alter table public.students add column if not exists course_start_robot_ym text;
alter table public.students add column if not exists course_start_programming_ym text;

do $$ begin
  alter table public.students add constraint students_promotion_scheduled_ym_check
    check (promotion_scheduled_ym is null or promotion_scheduled_ym ~ '^\d{4}-(0[1-9]|1[0-2])$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.students add constraint students_promotion_type_check
    check (promotion_type in ('normal', 'skip_grade'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.students add constraint students_course_start_robot_ym_check
    check (course_start_robot_ym is null or course_start_robot_ym ~ '^\d{4}-(0[1-9]|1[0-2])$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.students add constraint students_course_start_programming_ym_check
    check (course_start_programming_ym is null or course_start_programming_ym ~ '^\d{4}-(0[1-9]|1[0-2])$');
exception when duplicate_object then null; end $$;

create index if not exists students_sibling_group_id_idx
  on public.students (sibling_group_id)
  where sibling_group_id is not null;

do $$ begin
  alter table public.students
    add constraint students_enrollment_robot_capacity_id_fkey
    foreign key (enrollment_robot_capacity_id) references public.lesson_capacities(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.students
    add constraint students_enrollment_prog_capacity_id_fkey
    foreign key (enrollment_prog_capacity_id) references public.lesson_capacities(id) on delete set null;
exception when duplicate_object then null; end $$;

drop trigger if exists lesson_capacities_set_updated_at on public.lesson_capacities;
create trigger lesson_capacities_set_updated_at
  before update on public.lesson_capacities
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 6.55) classroom_period_times（教室・開催日・コマごとの時刻表記）
--       第◯週ではなく暦日（lesson_date）で指定。イレギュラーな開催に合わせやすい。
-- ------------------------------------------------------------
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

-- subject 未指定は「その日そのコマの共通時刻」1行まで、指定時は教科ごとに1行
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

-- ------------------------------------------------------------
-- 6.6) 保護者向け 振替申請用 SECURITY DEFINER 関数
--      フロントは anon ロールでもこの関数だけは実行可能に
-- ------------------------------------------------------------

-- カレンダー月内で、その日の曜日が「第何回目か」(1〜5)
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

-- (a) 指定日の各枠の空き状況を返す（コマ時刻登録がある日・コマのみ）
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
  with period_slots as (
    select cpt.classroom, cpt.period, cpt.subject as slot_subject
      from public.classroom_period_times cpt
      join public.classrooms cl on cl.name = cpt.classroom
     where cpt.lesson_date = target_date
  ),
  expanded as (
    select
      ps.classroom,
      ps.period,
      s.subject
    from period_slots ps
    cross join lateral (
      select unnest(
        case
          when ps.slot_subject is not null then array[ps.slot_subject::text]
          else array['プログラミング', 'ロボット']::text[]
        end
      ) as subject
    ) s
  ),
  capacity as (
    select
      e.classroom,
      e.period,
      e.subject,
      coalesce(lc.max_students, cl.default_max_students, 4)::smallint as max_students
    from expanded e
    join public.classrooms cl on cl.name = e.classroom
    left join public.lesson_capacities lc
      on lc.classroom = e.classroom
     and lc.day_of_week = extract(dow from target_date)::smallint
     and lc.period = e.period
     and lc.subject = e.subject
    where e.subject in ('プログラミング', 'ロボット')
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
      and l.attendance in ('present', 'makeup')
      and l.period is not null
      and l.subject is not null
    group by 1, l.period, l.subject
  )
  select
    c.classroom,
    c.period,
    c.subject,
    c.max_students,
    coalesce(o.occ, 0)                                                as occupied,
    greatest(0, c.max_students::int - coalesce(o.occ, 0))             as available
  from capacity c
  left join occupied o
    on o.classroom = c.classroom
   and o.period    = c.period
   and o.subject   = c.subject
  order by c.classroom, c.period, c.subject
$get_makeup$;

revoke all on function public.get_makeup_availability(date) from public;
grant execute on function public.get_makeup_availability(date) to anon, authenticated;

-- (b) 保護者が子供を本人確認するための限定ルックアップ（生徒ID + 誕生日）
create or replace function public.verify_makeup_session_access(
  p_portal_id  text,
  p_birthday   text,
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

revoke all on function public.verify_makeup_session_access(text, text, uuid) from public;
grant execute on function public.verify_makeup_session_access(text, text, uuid) to anon, authenticated;

create or replace function public.find_student_for_makeup(
  p_portal_id text,
  p_birthday  text
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

revoke all on function public.find_student_for_makeup(text, text) from public;
grant execute on function public.find_student_for_makeup(text, text) to anon, authenticated;

-- 振替フォーム: 本人確認済み生徒の兄弟一覧（匿名可）
create or replace function public.list_siblings_for_makeup(
  p_student_id uuid,
  p_portal_id  text,
  p_birthday   text
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

revoke all on function public.list_siblings_for_makeup(uuid, text, text) from public;
grant execute on function public.list_siblings_for_makeup(uuid, text, text) to anon, authenticated;

-- 保護者申請: 欠席にする元の授業を一覧（予定のうち日付・コマ・教科が揃った行）
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

-- 保護者申請: 欠席済みで振替未登録の scheduled 行（過去分の手動登録を含む）
create or replace function public.list_pending_absences_for_makeup(
  p_student_id uuid,
  p_portal_id  text,
  p_birthday   text,
  p_from_date  date default (current_date - interval '730 days')
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

revoke all on function public.list_pending_absences_for_makeup(uuid, text, text, date) from public;
grant execute on function public.list_pending_absences_for_makeup(uuid, text, text, date) to anon, authenticated;

-- 保護者ポータル: 授業予定一覧（出席・振替・欠席すべて）
create or replace function public.list_student_schedule_for_portal(
  p_student_id uuid,
  p_portal_id  text,
  p_birthday   text,
  p_from_date  date default current_date,
  p_to_date    date default (current_date + interval '120 days')
)
returns table (
  id                 uuid,
  lesson_date        date,
  period             smallint,
  subject            text,
  attendance         attendance_status,
  lesson_classroom   text,
  source_lesson_date date,
  source_period      smallint,
  source_subject     text
)
language sql
stable
security definer
set search_path = public
as $list_schedule$
  select
    l.id,
    l.lesson_date,
    l.period,
    l.subject,
    l.attendance,
    l.lesson_classroom,
    l.source_lesson_date,
    l.source_period,
    l.source_subject
  from public.lessons l
  where l.student_id = p_student_id
    and public.verify_makeup_session_access(p_portal_id, p_birthday, p_student_id)
    and l.status = 'scheduled'
    and l.lesson_date >= p_from_date
    and l.lesson_date <= p_to_date
    and l.period is not null
    and l.subject is not null
  order by l.lesson_date, l.period;
$list_schedule$;

revoke all on function public.list_student_schedule_for_portal(uuid, text, text, date, date) from public;
grant execute on function public.list_student_schedule_for_portal(uuid, text, text, date, date) to anon, authenticated;

drop function if exists public.book_makeup_lesson(uuid, date, smallint, text, text);
drop function if exists public.book_makeup_lesson(uuid, date, smallint, text, date, smallint, text, text);
drop function if exists public.book_makeup_lesson(uuid, date, smallint, text, date, smallint, text, text, text);

-- (c) 振替予約を 容量チェック付き でアトミックに作成（欠席元の登録・更新も同時に）
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
  v_student         record;
  v_venue           text;
  v_max             smallint;
  v_current         bigint;
  v_lesson_id       uuid;
  v_src_attendance  attendance_status;
  v_chain_date      date;
  v_chain_period    smallint;
  v_chain_subject   text;
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
    coalesce(l.source_subject, l.subject)
  into
    v_src_attendance,
    v_chain_date,
    v_chain_period,
    v_chain_subject
  from public.lessons l
  where l.student_id  = p_student_id
    and l.lesson_date = p_source_lesson_date
    and l.period      = p_source_period
    and l.subject     = p_source_subject
    and l.status      = 'scheduled'
    and l.attendance  in ('present', 'makeup');

  if not found then
    raise exception '欠席にできるのは、振替フォームに表示されている「出席予定」または「振替予定」のコマのみです。一覧にない場合は教室までお問い合わせください。';
  end if;

  update public.lessons
     set attendance = 'absent',
         updated_at = now()
   where student_id  = p_student_id
     and lesson_date = p_source_lesson_date
     and period      = p_source_period
     and subject     = p_source_subject
     and status      = 'scheduled'
     and attendance  in ('present', 'makeup');

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
  returning id into v_lesson_id;

  return v_lesson_id;
end;
$book_makeup$;

revoke all on function public.book_makeup_lesson(uuid, date, smallint, text, date, smallint, text, text, text) from public;
grant execute on function public.book_makeup_lesson(uuid, date, smallint, text, date, smallint, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 7) RLS
-- ------------------------------------------------------------
alter table public.teacher_profiles    enable row level security;
alter table public.students            enable row level security;
alter table public.lessons             enable row level security;
alter table public.lesson_capacities          enable row level security;
alter table public.classroom_period_times     enable row level security;

-- ===== teacher_profiles =====
drop policy if exists "tp: read all"          on public.teacher_profiles;
drop policy if exists "tp: read own or all staff" on public.teacher_profiles;
drop policy if exists "tp: update own"        on public.teacher_profiles;
drop policy if exists "tp: admin update any"  on public.teacher_profiles;
drop policy if exists "tp: admin delete any"  on public.teacher_profiles;

create policy "tp: read own or all staff"
  on public.teacher_profiles for select
  to authenticated
  using (id = auth.uid() or public.is_staff_user());

create policy "tp: update own"
  on public.teacher_profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and is_admin = public.is_admin());

create policy "tp: admin update any"
  on public.teacher_profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "tp: admin delete any"
  on public.teacher_profiles for delete
  to authenticated
  using (public.is_admin());

-- ===== students =====
drop policy if exists "students: authenticated read"   on public.students;
drop policy if exists "students: authenticated insert" on public.students;
drop policy if exists "students: authenticated update" on public.students;
drop policy if exists "students: creator delete"       on public.students;
drop policy if exists "students: delete (creator or admin)" on public.students;

create policy "students: authenticated read"
  on public.students for select
  to authenticated
  using (
    public.is_staff_user()
    or exists (
      select 1 from public.parent_student_links l
      where l.student_id = students.id and l.parent_user_id = auth.uid()
    )
  );

create policy "students: authenticated insert"
  on public.students for insert
  to authenticated
  with check (public.is_staff_user() and created_by = auth.uid());

create policy "students: authenticated update"
  on public.students for update
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

create policy "students: delete (creator or admin)"
  on public.students for delete
  to authenticated
  using (
    public.is_staff_user()
    and (created_by = auth.uid() or public.is_admin())
  );

-- ===== lessons =====
drop policy if exists "lessons: authenticated read" on public.lessons;
drop policy if exists "lessons: insert as self"     on public.lessons;
drop policy if exists "lessons: update own"         on public.lessons;
drop policy if exists "lessons: delete own"         on public.lessons;
drop policy if exists "lessons: update (own or admin)" on public.lessons;
drop policy if exists "lessons: delete (own or admin)" on public.lessons;

create policy "lessons: authenticated read"
  on public.lessons for select
  to authenticated
  using (
    public.is_staff_user()
    or exists (
      select 1 from public.parent_student_links l
      where l.student_id = lessons.student_id and l.parent_user_id = auth.uid()
    )
  );

create policy "lessons: insert as self"
  on public.lessons for insert
  to authenticated
  with check (public.is_staff_user() and teacher_id = auth.uid());

create policy "lessons: update (own or admin)"
  on public.lessons for update
  to authenticated
  using (public.is_staff_user() and (teacher_id = auth.uid() or public.is_admin()))
  with check (public.is_staff_user() and (teacher_id = auth.uid() or public.is_admin()));

create policy "lessons: delete (own or admin)"
  on public.lessons for delete
  to authenticated
  using (
    public.is_staff_user()
    and (
      teacher_id = auth.uid()
      or public.is_admin()
      or coalesce(lessons.created_from_enrollment, false) = true
    )
  );

-- ===== lesson_capacities =====
-- 認証済みは閲覧可、管理者のみ書込可。
-- 保護者向け公開フォームはこのテーブルを直接読むのではなく、
-- get_makeup_availability() RPC を経由するので anon アクセスは不要。
drop policy if exists "lc: authenticated read" on public.lesson_capacities;
drop policy if exists "lc: admin write"        on public.lesson_capacities;

create policy "lc: authenticated read"
  on public.lesson_capacities for select
  to authenticated
  using (public.is_staff_user());

create policy "lc: admin write"
  on public.lesson_capacities for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===== classroom_period_times =====
-- 時刻表は個人情報ではないため anon も SELECT 可（/apply の表記用）。
-- 書き込みは管理者のみ。
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

-- ===== parent_student_links =====
drop policy if exists "psl: staff all" on public.parent_student_links;
drop policy if exists "psl: parent read own" on public.parent_student_links;

create policy "psl: staff all"
  on public.parent_student_links for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

create policy "psl: parent read own"
  on public.parent_student_links for select
  to authenticated
  using (parent_user_id = auth.uid());

grant select, insert, delete on public.parent_student_links to authenticated;

-- ------------------------------------------------------------
-- 8) Realtime
--    保護者フォームで lessons の変更をリアルタイム反映させるため、
--    lessons を supabase_realtime publication に追加。
-- ------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.lessons;
exception
  when duplicate_object then null;
  when undefined_object then null;  -- publication が無い環境では握りつぶす
end $$;

do $$ begin
  alter publication supabase_realtime add table public.lesson_capacities;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
