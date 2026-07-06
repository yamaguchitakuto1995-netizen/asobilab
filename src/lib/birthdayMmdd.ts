/** 保護者ログイン用の誕生日（月日4桁 MMDD） */

const MMDD_RE = /^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$/;
const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

/** 入力を MMDD に正規化（旧 YYYY-MM-DD も受け付ける） */
export function normalizeBirthdayMmdd(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;

  if (ISO_DATE_RE.test(t)) {
    return t.slice(5, 7) + t.slice(8, 10);
  }

  const digits = t.replace(/\D/g, "");
  if (digits.length === 4 && MMDD_RE.test(digits)) {
    return digits;
  }

  if (digits.length === 3) {
    const padded = digits.padStart(4, "0");
    if (MMDD_RE.test(padded)) return padded;
  }

  return null;
}

export function isValidBirthdayMmdd(value: string | null | undefined): boolean {
  return normalizeBirthdayMmdd(value) != null;
}

/** 表示用（例: 0327 → 3月27日） */
export function formatBirthdayMmddJa(mmdd: string | null | undefined): string {
  const normalized = normalizeBirthdayMmdd(mmdd);
  if (!normalized) return "";
  const month = Number(normalized.slice(0, 2));
  const day = Number(normalized.slice(2, 4));
  return `${month}月${day}日`;
}
