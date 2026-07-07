import type { CurrentUser } from "@/lib/auth";

export function isInstructor(user: CurrentUser | null): boolean {
  return user !== null && user.accountRole === "staff" && !user.isAdmin;
}

export function isAdminUser(user: CurrentUser | null): boolean {
  return user !== null && user.accountRole === "staff" && user.isAdmin;
}

/** 管理者専用パス（講師はアクセス不可） */
export const ADMIN_ONLY_PATH_PREFIXES = [
  "/capacities",
  "/settings",
  "/students/new",
] as const;

export function isAdminOnlyPath(pathname: string): boolean {
  if (ADMIN_ONLY_PATH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return true;
  }
  if (/^\/students\/[^/]+\/edit\/?$/.test(pathname)) return true;
  if (/^\/students\/[^/]+\/lessons\//.test(pathname)) return true;
  return false;
}

export function normalizePhoneDigits(input: string): string {
  return input.replace(/\D/g, "");
}

export function phoneLastFour(phone: string): string {
  const digits = normalizePhoneDigits(phone);
  return digits.slice(-4);
}
