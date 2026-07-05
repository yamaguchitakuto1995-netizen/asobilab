const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidYearMonth(value: string): boolean {
  return YM_RE.test(value.trim());
}

export function lessonYearMonth(lessonDate: string): string {
  return lessonDate.slice(0, 7);
}

/** 退会予定月より後の授業か（退会月当月までは表示・在籍） */
export function isLessonAfterWithdrawal(
  lessonDate: string,
  withdrawalUntilYm: string | null | undefined
): boolean {
  if (!withdrawalUntilYm?.trim()) return false;
  return lessonYearMonth(lessonDate) > withdrawalUntilYm.trim();
}

export function formatWithdrawalUntilLabel(
  withdrawalUntilYm: string | null | undefined
): string | null {
  if (!withdrawalUntilYm?.trim()) return null;
  const month = Number(withdrawalUntilYm.trim().slice(5, 7));
  if (!month) return null;
  return `${month}月末退会`;
}

export function readWithdrawalUntilFromForm(formData: FormData): {
  withdrawal_until_ym: string | null;
  error?: string;
} {
  const raw = String(formData.get("withdrawal_until_ym") ?? "").trim();
  if (!raw) return { withdrawal_until_ym: null };
  if (!isValidYearMonth(raw)) {
    return {
      withdrawal_until_ym: null,
      error: "退会予定月の形式が不正です（YYYY-MM）。",
    };
  }
  return { withdrawal_until_ym: raw };
}
