-- 管理者メールアドレスの変更
-- yamaguchi.takuto1995@gmail.com → human.asobilab@gmail.com
-- Supabase SQL Editor で実行してください。
--
-- 事前に human.asobilab@gmail.com でアプリにサインアップ済みであること。
-- （未登録の場合は先に登録してから実行）

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_emails text[] := array[
    'human.asobilab@gmail.com'
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

-- 新しい管理者メールに権限付与
update public.teacher_profiles
set
  is_admin = true,
  account_role = 'staff'
where lower(btrim(email)) = lower(btrim('human.asobilab@gmail.com'));

-- 旧管理者メールの自動昇格を解除（アカウント自体は残す）
update public.teacher_profiles
set is_admin = false
where lower(btrim(email)) = lower(btrim('yamaguchi.takuto1995@gmail.com'));

notify pgrst, 'reload schema';
