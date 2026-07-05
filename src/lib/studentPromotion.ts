import { isValidYearMonth } from "@/lib/studentWithdrawal";

export const PROMOTION_TYPES = [
  { value: "normal", label: "進級" },
  { value: "skip_grade", label: "飛び級" },
] as const;

export type PromotionType = (typeof PROMOTION_TYPES)[number]["value"];

export function formatPromotionScheduleLabel(
  promotionScheduledYm: string | null | undefined,
  promotionType: PromotionType | string | null | undefined
): string | null {
  if (!promotionScheduledYm?.trim()) return null;
  const ym = promotionScheduledYm.trim();
  const year = ym.slice(0, 4);
  const month = Number(ym.slice(5, 7));
  if (!month) return null;
  const suffix =
    promotionType === "skip_grade" ? "飛び級予定" : "進級予定";
  return `${year}年${month}月${suffix}`;
}

export function readPromotionFromForm(formData: FormData): {
  promotion_scheduled_ym: string | null;
  promotion_type: PromotionType;
  error?: string;
} {
  const rawYm = String(formData.get("promotion_scheduled_ym") ?? "").trim();
  const rawType = String(formData.get("promotion_type") ?? "normal").trim();

  let promotion_type: PromotionType = "normal";
  if (rawType === "skip_grade") {
    promotion_type = "skip_grade";
  } else if (rawType !== "normal") {
    return {
      promotion_scheduled_ym: null,
      promotion_type: "normal",
      error: "進級予定の種別が不正です。",
    };
  }

  if (!rawYm) {
    return { promotion_scheduled_ym: null, promotion_type };
  }

  if (!isValidYearMonth(rawYm)) {
    return {
      promotion_scheduled_ym: null,
      promotion_type,
      error: "進級予定月の形式が不正です（YYYY-MM）。",
    };
  }

  return { promotion_scheduled_ym: rawYm, promotion_type };
}
