import { createClient } from "@/lib/supabase/server";

export type AccountRole = "staff" | "parent";

export type CurrentUser = {
  id: string;
  email: string | null;
  isAdmin: boolean;
  displayName: string | null;
  accountRole: AccountRole;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("teacher_profiles")
    .select("is_admin, display_name, account_role")
    .eq("id", user.id)
    .maybeSingle<{
      is_admin: boolean;
      display_name: string | null;
      account_role: AccountRole | null;
    }>();

  const rawRole = profile?.account_role;
  const accountRole: AccountRole =
    rawRole === "parent" ? "parent" : "staff";

  return {
    id: user.id,
    email: user.email ?? null,
    isAdmin: profile?.is_admin ?? false,
    displayName: profile?.display_name ?? null,
    accountRole,
  };
}
