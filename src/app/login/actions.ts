"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let dest = "/";
  if (user) {
    const { data: profile } = await supabase
      .from("teacher_profiles")
      .select("account_role")
      .eq("id", user.id)
      .maybeSingle<{ account_role: string | null }>();
    if (profile?.account_role === "parent") dest = "/parent";
  }

  revalidatePath("/", "layout");
  redirect(dest);
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/login?message=${encodeURIComponent(
      "確認メールを送信しました。メールのリンクから認証してください。"
    )}`
  );
}
