import { isValidYearMonth } from "@/lib/studentWithdrawal";
import {
  programmingCourseOptionsInOrder,
  resolveProgrammingNextTextPartsForStudent,
  resolveRobotNextTextPartsForStudent,
  robotCourseOptionsInOrder,
} from "@/lib/courseNextText";
import { textbookCourseChipLabel } from "@/lib/textbookCourseColors";

export const PROMOTION_TYPES = [
  { value: "normal", label: "自動進級" },
  { value: "skip_grade", label: "飛び級" },
] as const;

export type PromotionType = (typeof PROMOTION_TYPES)[number]["value"];

export type PromotionStudentFields = {
  next_text_robot?: string | null;
  next_text_robot_course?: string | null;
  next_text_robot_text?: string | null;
  next_text_programming?: string | null;
  next_text_programming_course?: string | null;
  next_text_programming_text?: string | null;
};

function nextCourseInOrder(
  current: string,
  order: readonly string[]
): string | null {
  const idx = order.indexOf(current);
  if (idx === -1 || idx >= order.length - 1) return null;
  return order[idx + 1] ?? null;
}

/** 進級先コースの表示名（例: プライマリー → ベーシック） */
export function resolveNextPromotionCourseDisplay(
  subject: string | null | undefined,
  student: PromotionStudentFields | null | undefined
): string | null {
  if (!student || !subject) return null;

  if (subject === "ロボット") {
    const parts = resolveRobotNextTextPartsForStudent(student);
    const current = parts?.course;
    if (!current) return null;
    const next = nextCourseInOrder(current, robotCourseOptionsInOrder());
    return next ? textbookCourseChipLabel(next) : null;
  }

  if (subject === "プログラミング") {
    const parts = resolveProgrammingNextTextPartsForStudent(student);
    const current = parts?.course;
    if (!current) return null;
    const next = nextCourseInOrder(current, programmingCourseOptionsInOrder());
    return next ? textbookCourseChipLabel(next) : null;
  }

  return null;
}

export function formatPromotionScheduleLabel(
  promotionScheduledYm: string | null | undefined,
  promotionType: PromotionType | string | null | undefined,
  nextCourseDisplay?: string | null
): string | null {
  if (!promotionScheduledYm?.trim()) return null;
  const ym = promotionScheduledYm.trim();
  const year = ym.slice(0, 4);
  const month = Number(ym.slice(5, 7));
  if (!month) return null;

  const action =
    promotionType === "skip_grade" ? "飛び級" : "自動進級";

  if (nextCourseDisplay?.trim()) {
    return `${year}年${month}月から${nextCourseDisplay.trim()}へ${action}`;
  }

  return `${year}年${month}月${action}予定`;
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
