"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizePhoneDigits } from "@/lib/access";
import { requireAdminUser } from "@/lib/requireRole";
import { createAdminClient, findAuthUserIdByEmail } from "@/lib/supabase/admin";

function settingsRedirect(error?: string, message?: string): never {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (message) params.set("message", message);
  const q = params.toString();
  redirect(q ? `/settings/instructors?${q}` : "/settings/instructors");
}

function generateLoginSecret(): string {
  return randomBytes(32).toString("hex");
}

export async function createInstructor(formData: FormData) {
  const auth = await requireAdminUser();
  if (!auth.ok) settingsRedirect(auth.error);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = normalizePhoneDigits(String(formData.get("phone") ?? ""));
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!email || !email.includes("@")) {
    settingsRedirect("メールアドレスを正しく入力してください。");
  }
  if (phone.length < 4) {
    settingsRedirect("電話番号は4桁以上で入力してください。");
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("teacher_profiles")
    .select("id, is_admin")
    .ilike("email", email)
    .maybeSingle<{ id: string; is_admin: boolean }>();

  if (existing?.is_admin) {
    settingsRedirect("このメールは管理者アカウントです。講師としては登録できません。");
  }

  const secret = generateLoginSecret();
  let userId = existing?.id ?? (await findAuthUserIdByEmail(email));

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: secret,
      email_confirm: true,
      user_metadata: { display_name: displayName || undefined },
    });
    const createdUser = data.user;
    if (error || !createdUser?.id) {
      settingsRedirect(error?.message ?? "アカウントの作成に失敗しました。");
    }
    userId = createdUser.id;
  } else {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: secret,
    });
    if (error) settingsRedirect(error.message);
  }

  const { error: upsertError } = await admin.from("teacher_profiles").upsert(
    {
      id: userId,
      email,
      phone,
      instructor_login_secret: secret,
      is_admin: false,
      account_role: "staff",
      display_name: displayName || null,
    },
    { onConflict: "id" }
  );

  if (upsertError) settingsRedirect(upsertError.message);

  revalidatePath("/settings/instructors");
  settingsRedirect(undefined, `${email} を講師として登録しました。`);
}

export async function removeInstructor(formData: FormData) {
  const auth = await requireAdminUser();
  if (!auth.ok) settingsRedirect(auth.error);

  const userId = String(formData.get("user_id") ?? "").trim();
  if (!userId) settingsRedirect("削除対象が指定されていません。");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("teacher_profiles")
    .select("email, is_admin")
    .eq("id", userId)
    .maybeSingle<{ email: string; is_admin: boolean }>();

  if (!profile) settingsRedirect("講師が見つかりません。");
  if (profile.is_admin) settingsRedirect("管理者アカウントは削除できません。");

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) settingsRedirect(error.message);

  revalidatePath("/settings/instructors");
  settingsRedirect(undefined, `${profile.email} の講師権限を削除しました。`);
}
