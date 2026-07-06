import { currentYm, shiftMonth } from "@/lib/date";
import { todayJstIso } from "@/lib/registrationDeadlines";
import { resolveCourseStartYm } from "@/lib/studentCourseStart";
import { isValidYearMonth } from "@/lib/studentWithdrawal";
import {
  PROGRAMMING_NEXT_TEXT_OPTIONS,
  programmingCourseOptionsInOrder,
  parseProgrammingNextTextParts,
  parseRobotNextTextParts,
  resolveProgrammingNextTextPartsForStudent,
  resolveRobotNextTextPartsForStudent,
  ROBOT_NEXT_TEXT_OPTIONS,
  robotCourseOptionsInOrder,
  type ProgrammingNextText,
  type RobotNextText,
} from "@/lib/courseNextText";
import { textbookCourseChipLabel } from "@/lib/textbookCourseColors";
import {
  estimateProgrammingAutoPromotionScheduledYm,
  programmingRemainingMonthsInCourse,
} from "@/lib/programmingCoursePromotion";
import {
  estimateRobotAutoPromotionScheduledYm,
  robotRemainingMonthsInCourse,
} from "@/lib/robotCoursePromotion";

/** 月2回ペースでコース修了→進級月を見積もる */
const LESSONS_PER_MONTH = 2;

export const PROMOTION_TYPES = [
  { value: "normal", label: "自動進級" },
  { value: "skip_grade", label: "飛び級" },
] as const;

export type PromotionType = (typeof PROMOTION_TYPES)[number]["value"];

export type PromotionStudentFields = {
  promotion_scheduled_ym?: string | null;
  promotion_type?: PromotionType | string | null;
  course_start_robot_ym?: string | null;
  course_start_programming_ym?: string | null;
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

function remainingLessonsInCourse(
  subject: string,
  student: PromotionStudentFields
): number | null {
  if (subject === "ロボット") {
    const parts = resolveRobotNextTextPartsForStudent(student);
    if (!parts?.full || !parts.course) return null;
    const inCourse = ROBOT_NEXT_TEXT_OPTIONS.filter((opt) => {
      const p = parseRobotNextTextParts(opt);
      return p?.course === parts.course;
    });
    const idx = inCourse.indexOf(parts.full as RobotNextText);
    if (idx === -1) return null;
    return inCourse.length - idx;
  }

  if (subject === "プログラミング") {
    const parts = resolveProgrammingNextTextPartsForStudent(student);
    if (!parts?.full || !parts.course) return null;
    const inCourse = PROGRAMMING_NEXT_TEXT_OPTIONS.filter((opt) => {
      const p = parseProgrammingNextTextParts(opt);
      return p?.course === parts.course;
    });
    const idx = inCourse.indexOf(parts.full as ProgrammingNextText);
    if (idx === -1) return null;
    return inCourse.length - idx;
  }

  return null;
}

/** コース修了までの見積もり月数（月2回ペース） */
export function estimateMonthsUntilCourseEnd(
  subject: string | null | undefined,
  student: PromotionStudentFields | null | undefined
): number | null {
  if (!student || !subject) return null;

  if (subject === "ロボット") {
    return robotRemainingMonthsInCourse(student);
  }

  if (subject === "プログラミング") {
    return programmingRemainingMonthsInCourse(student);
  }

  const remaining = remainingLessonsInCourse(subject, student);
  if (remaining == null || remaining <= 0) return null;
  return Math.max(1, Math.ceil(remaining / LESSONS_PER_MONTH));
}

/** コース開始月と残り授業数から進級予定月を算出 */
export function estimateAutoPromotionScheduledYm(
  subject: string | null | undefined,
  student: PromotionStudentFields | null | undefined
): string | null {
  if (!student || !subject) return null;

  if (subject === "ロボット") {
    return estimateRobotAutoPromotionScheduledYm(student);
  }

  if (subject === "プログラミング") {
    return estimateProgrammingAutoPromotionScheduledYm(student);
  }

  const months = estimateMonthsUntilCourseEnd(subject, student);
  if (months == null) return null;

  const courseStartYm = resolveCourseStartYm(subject, student);
  const baseYm = courseStartYm ?? currentYm();
  return shiftMonth(baseYm, months - 1);
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

/** コマ表・生徒情報用の進級予定（ラベル＋強調表示の要否） */
export type PromotionScheduleInfo = {
  label: string;
  promotionScheduledYm: string;
  promotionType: PromotionType;
  highlight: boolean;
};

/** 進級予定の強調判定・表示に使う現在月（JST） */
export function promotionNowYm(now = new Date()): string {
  return todayJstIso(now).slice(0, 7);
}

/** 進級予定バナーを薄オレンジで強調するか */
export function isPromotionScheduleHighlighted(
  promotionScheduledYm: string,
  promotionType: PromotionType | string | null | undefined,
  nowYm: string = promotionNowYm()
): boolean {
  const ym = promotionScheduledYm.trim();
  if (!ym) return false;

  if (promotionType === "skip_grade") return true;

  const highlightFrom = shiftMonth(ym, -2);
  return nowYm >= highlightFrom && nowYm <= ym;
}

export function resolvePromotionScheduleInfo(
  subject: string | null | undefined,
  student: PromotionStudentFields | null | undefined,
  nowYm: string = promotionNowYm()
): PromotionScheduleInfo | null {
  const nextCourse = resolveNextPromotionCourseDisplay(subject, student);
  if (!nextCourse) return null;

  const isSkipGrade =
    student?.promotion_type === "skip_grade" &&
    student?.promotion_scheduled_ym?.trim();

  let promotionScheduledYm: string;
  let promotionType: PromotionType;

  if (isSkipGrade) {
    promotionScheduledYm = student!.promotion_scheduled_ym!.trim();
    promotionType = "skip_grade";
  } else {
    const estimatedYm = estimateAutoPromotionScheduledYm(subject, student);
    if (!estimatedYm) return null;
    promotionScheduledYm = estimatedYm;
    promotionType = "normal";
  }

  const label = formatPromotionScheduleLabel(
    promotionScheduledYm,
    promotionType,
    nextCourse
  );
  if (!label) return null;

  return {
    label,
    promotionScheduledYm,
    promotionType,
    highlight: isPromotionScheduleHighlighted(
      promotionScheduledYm,
      promotionType,
      nowYm
    ),
  };
}

/** @deprecated resolvePromotionScheduleInfo を使用 */
export function resolvePromotionScheduleLabel(
  subject: string | null | undefined,
  student: PromotionStudentFields | null | undefined
): string | null {
  return resolvePromotionScheduleInfo(subject, student)?.label ?? null;
}

/** 飛び級のみ手動入力（空欄なら自動進級表示） */
export function readPromotionFromForm(formData: FormData): {
  promotion_scheduled_ym: string | null;
  promotion_type: PromotionType;
  error?: string;
} {
  const rawYm = String(formData.get("promotion_scheduled_ym") ?? "").trim();

  if (!rawYm) {
    return { promotion_scheduled_ym: null, promotion_type: "normal" };
  }

  if (!isValidYearMonth(rawYm)) {
    return {
      promotion_scheduled_ym: null,
      promotion_type: "normal",
      error: "飛び級予定月の形式が不正です（YYYY-MM）。",
    };
  }

  return { promotion_scheduled_ym: rawYm, promotion_type: "skip_grade" };
}
