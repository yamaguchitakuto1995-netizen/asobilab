import { createClient } from "@supabase/supabase-js";

/**
 * サーバー専用。service_role はクライアントに絶対に出さないこと。
 * メールで auth ユーザーを特定し、teacher_profiles を更新する用途。
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase 管理用キーが未設定です。環境変数 NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を確認してください。"
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * 登録ユーザーのメール（大文字小文字無視）で ID を探す。
 * Auth Admin API にメール検索がないためページングで走査する。
 */
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const admin = createAdminClient();
  const perPage = 200;
  const maxPages = 30;

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === normalized
    );
    if (hit) return hit.id;
    if (data.users.length < perPage) break;
  }
  return null;
}
