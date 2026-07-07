import { getCurrentUser, type CurrentUser } from "@/lib/auth";

export async function requireStaffUser(): Promise<
  | { ok: true; user: CurrentUser }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user || user.accountRole !== "staff") {
    return { ok: false, error: "権限がありません。" };
  }
  return { ok: true, user };
}

export async function requireAdminUser(): Promise<
  | { ok: true; user: CurrentUser }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user || user.accountRole !== "staff" || !user.isAdmin) {
    return { ok: false, error: "管理者権限が必要です。" };
  }
  return { ok: true, user };
}
