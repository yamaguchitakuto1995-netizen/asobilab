-- 管理者権限の復旧（1 アカウント分）
-- Supabase ダッシュボード → SQL Editor に貼り付けて Run
--
-- 対象: human.asobilab@gmail.com
-- 1) 古い DB 用に account_role 列が無ければ追加（schema.sql と同趣旨）
-- 2) 管理者 + 職員として更新

alter table public.teacher_profiles
  add column if not exists account_role text not null default 'staff';

do $$ begin
  alter table public.teacher_profiles add constraint teacher_profiles_account_role_check
    check (account_role in ('staff', 'parent'));
exception when duplicate_object then null;
end $$;

update public.teacher_profiles
set
  is_admin = true,
  account_role = 'staff'
where lower(btrim(email)) = lower(btrim('human.asobilab@gmail.com'));

-- 反映確認（1 行出れば OK）
select id, email, is_admin, account_role, created_at
from public.teacher_profiles
where lower(btrim(email)) = lower(btrim('human.asobilab@gmail.com'));
