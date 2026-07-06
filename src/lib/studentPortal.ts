/** 保護者向け振替フォーム用の生徒ID・誕生日（月日4桁） */

import {
  isValidBirthdayMmdd,
  normalizeBirthdayMmdd,
} from "@/lib/birthdayMmdd";

const PORTAL_ID_PATTERN = /^[0-9A-Za-z\-]{1,20}$/;

export function readPortalIdFromForm(formData: FormData): {
  value: string;
  error?: string;
} {
  const raw = String(formData.get("portal_id") ?? "").trim();
  if (!raw) {
    return { value: "", error: "生徒IDを入力してください。" };
  }
  if (!PORTAL_ID_PATTERN.test(raw)) {
    return {
      value: "",
      error: "生徒IDは20文字以内の英数字（ハイフン可）で入力してください。",
    };
  }
  return { value: raw };
}

export function readBirthdayFromForm(formData: FormData): {
  value: string | null;
  error?: string;
} {
  const raw = String(formData.get("birthday") ?? "").trim();
  if (!raw) {
    return { value: null, error: "誕生日（月日）を入力してください。" };
  }
  const normalized = normalizeBirthdayMmdd(raw);
  if (!normalized) {
    return {
      value: null,
      error: "誕生日は月日4桁で入力してください（例: 3月27日→0327）。",
    };
  }
  return { value: normalized };
}

export function readPortalIdFromInput(raw: string): {
  value: string;
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: "", error: "生徒IDを入力してください。" };
  }
  if (!PORTAL_ID_PATTERN.test(trimmed)) {
    return {
      value: "",
      error: "生徒IDは20文字以内の英数字（ハイフン可）で入力してください。",
    };
  }
  return { value: trimmed };
}

export function readBirthdayFromInput(raw: string): {
  value: string | null;
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: null, error: "誕生日（月日）を入力してください。" };
  }
  const normalized = normalizeBirthdayMmdd(trimmed);
  if (!normalized) {
    return {
      value: null,
      error: "誕生日は月日4桁で入力してください（例: 3月27日→0327）。",
    };
  }
  return { value: normalized };
}

export { isValidBirthdayMmdd, normalizeBirthdayMmdd };
