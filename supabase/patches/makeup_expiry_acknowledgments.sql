-- 振替失効リマインドの「対応済」記録
-- Supabase SQL Editor で実行してください。

create table if not exists public.makeup_expiry_acknowledgments (
  lesson_id        uuid primary key references public.lessons(id) on delete cascade,
  acknowledged_by  uuid not null references auth.users(id) on delete restrict,
  acknowledged_at  timestamptz not null default now()
);

create index if not exists makeup_expiry_ack_student_idx
  on public.makeup_expiry_acknowledgments (acknowledged_at desc);

alter table public.makeup_expiry_acknowledgments enable row level security;

drop policy if exists "makeup_expiry_ack: admin all" on public.makeup_expiry_acknowledgments;

create policy "makeup_expiry_ack: admin all"
  on public.makeup_expiry_acknowledgments for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, delete on public.makeup_expiry_acknowledgments to authenticated;

notify pgrst, 'reload schema';
