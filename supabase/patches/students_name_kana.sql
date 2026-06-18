-- 生徒のふりがな（コマ表表示用）
alter table public.students add column if not exists name_kana text;
