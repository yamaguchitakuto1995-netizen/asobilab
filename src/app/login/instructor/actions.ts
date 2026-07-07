"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  normalizePhoneDigits,
  phoneLastFour,
} from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function instructorLogin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phoneLast4Input = normalizePhoneDigits(
    String(formData.get("phone_last4") ?? "")
  ).slice(-4);

  if (!email || phoneLast4Input.length !== 4) {
    redirect(
      `/login/instructor?error=${encodeURIComponent("メールアドレスと電話番号の下4桁を入力してください。")}`
    );
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("teacher_profiles")
    .select(
      "id, email, phone, instructor_login_secret, is_admin, account_role"
    )
    .ilike("email", email)
    .maybeSingle<{
      id: string;
      email: string;
      phone: string | null;
      instructor_login_secret: string | null;
      is_admin: boolean;
      account_role: string;
    }>();

  if (
    profileError ||
    !profile ||
    profile.account_role !== "staff" ||
    profile.is_admin
  ) {
    redirect(
      `/login/instructor?error=${encodeURIComponent("メールアドレスまたは電話番号が正しくありません。")}`
    );
  }

  if (
    !profile.phone ||
    phoneLastFour(profile.phone) !== phoneLast4Input ||
    !profile.instructor_login_secret
  ) {
    redirect(
      `/login/instructor?error=${encodeURIComponent("メールアドレスまたは電話番号が正しくありません。管理者に講師登録を確認してください。")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: profile.instructor_login_secret,
  });

  if (error) {
    redirect(
      `/login/instructor?error=${encodeURIComponent("ログインに失敗しました。管理者にお問い合わせください。")}`
    );
  }

  revalidatePath("/", "layout");
  redirect("/");
}
