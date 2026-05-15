-- ============================================================
-- ステップ C などで以下が出たとき:
--   ERROR: column tp.account_role does not exist
--   （is_staff_user 定義より前に account_role 列が無かった旧 schema 順序）
--
-- 対処 A（推奨）: リポジトリ最新の supabase/schema.sql を全文 Run（順序修正済み）
--
-- 対処 B: このファイルだけ先に Run してから、schema.sql の続き（3章・is_admin 以降）
--         を Run するか、schema.sql 全文をもう一度 Run
-- ============================================================

alter table public.teacher_profiles
  add column if not exists account_role text not null default 'staff';

do $$ begin
  alter table public.teacher_profiles add constraint teacher_profiles_account_role_check
    check (account_role in ('staff', 'parent'));
exception when duplicate_object then null; end $$;

update public.teacher_profiles set account_role = 'staff' where account_role is null;

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

notify pgrst, 'reload schema';
