import {
  parseProgrammingNextTextParts,
  parseRobotNextTextParts,
  resolveProgrammingNextTextPartsForStudent,
  resolveRobotNextTextPartsForStudent,
} from "@/lib/courseNextText";
import { isLessonMonthOnLeave, type StudentLeavePeriod } from "@/lib/studentLeave";
import {
  ATTENDANCE_LABEL,
  SCHEDULED_ATTENDANCE_LABEL,
  type AttendanceStatus,
  type Lesson,
} from "@/lib/types";

type StudentTextFields = {
  next_text_robot: string | null;
  next_text_robot_course?: string | null;
  next_text_robot_text?: string | null;
  next_text_programming: string | null;
  next_text_programming_course?: string | null;
  next_text_programming_text?: string | null;
};

export type LessonTodayTextParts = {
  course: string | null;
  detail: string | null;
  full: string;
};

function parseTodayTextParts(
  full: string,
  subject: string
): Pick<LessonTodayTextParts, "course" | "detail"> {
  const trimmed = full.trim();
  if (!trimmed || trimmed === "—") {
    return { course: null, detail: null };
  }

  const parsed =
    subject === "ロボット"
      ? parseRobotNextTextParts(trimmed)
      : subject === "プログラミング"
        ? parseProgrammingNextTextParts(trimmed)
        : null;

  if (parsed) {
    return { course: parsed.course, detail: parsed.text };
  }

  return { course: trimmed, detail: null };
}

/** コマ表表示用の出欠（休会期間は生徒設定から on_leave を反映） */
export function effectiveDailyLessonAttendance(
  lesson: Pick<Lesson, "lesson_date" | "status" | "attendance">,
  student: StudentLeavePeriod | null | undefined
): AttendanceStatus {
  if (lesson.attendance === "makeup") return lesson.attendance;
  if (
    lesson.status === "scheduled" &&
    student &&
    isLessonMonthOnLeave(lesson.lesson_date, student)
  ) {
    return "on_leave";
  }
  return lesson.attendance;
}

/** コマ表の出欠表示（予定 / 記録済みでラベルを切り替え） */
export function lessonAttendanceDisplayLabel(
  lesson: Pick<Lesson, "status" | "attendance">
): string {
  if (lesson.status === "scheduled") {
    return SCHEDULED_ATTENDANCE_LABEL[lesson.attendance];
  }
  return ATTENDANCE_LABEL[lesson.attendance];
}

/**
 * コマ表で欠席・休会として薄灰色カードにする。
 */
export function isDailyMutedLesson(
  lesson: Pick<Lesson, "attendance">
): boolean {
  return lesson.attendance === "absent" || lesson.attendance === "on_leave";
}

/** @deprecated isDailyMutedLesson を使用 */
export function isDailyAbsentLesson(
  lesson: Pick<Lesson, "attendance">
): boolean {
  return isDailyMutedLesson(lesson);
}

/**
 * もともと出席予定だった授業が欠席になっている（コマ表で強調表示）。
 * - レギュラー自動作成の欠席・欠席予定
 * - 記録済みの欠席（当日確認後）
 */
export function isDailyExpectedPresentAbsent(
  lesson: Pick<Lesson, "status" | "attendance" | "created_from_enrollment">
): boolean {
  if (lesson.attendance !== "absent") return false;
  if (lesson.created_from_enrollment) return true;
  return lesson.status === "recorded";
}

/** コマ表の出欠ラベル（強調対象は「欠席」に統一） */
export function dailyAttendanceStatusLabel(
  lesson: Pick<Lesson, "status" | "attendance" | "created_from_enrollment">
): string {
  if (lesson.attendance === "on_leave") {
    return lesson.status === "scheduled" ? "休会中" : "休会";
  }
  if (isDailyExpectedPresentAbsent(lesson)) return "欠席";
  return lessonAttendanceDisplayLabel(lesson);
}

/** 本日のテキスト（記録済みは textbook、予定は受講予定テキスト） */
export function lessonTodayTextLabel(
  lesson: Pick<Lesson, "textbook" | "subject" | "status">,
  student: StudentTextFields | null | undefined,
  plannedTextOverride?: string | null
): string {
  const tb = lesson.textbook?.trim();
  if (tb) return tb;

  if (plannedTextOverride?.trim()) return plannedTextOverride.trim();

  if (!student || !lesson.subject) return "—";

  if (lesson.subject === "ロボット") {
    const r = resolveRobotNextTextPartsForStudent({
      next_text_robot: student.next_text_robot,
      next_text_robot_course: student.next_text_robot_course,
      next_text_robot_text: student.next_text_robot_text,
    });
    return r?.full ?? "—";
  }

  if (lesson.subject === "プログラミング") {
    const r = resolveProgrammingNextTextPartsForStudent({
      next_text_programming: student.next_text_programming,
      next_text_programming_course: student.next_text_programming_course,
      next_text_programming_text: student.next_text_programming_text,
    });
    return r?.full ?? "—";
  }

  return "—";
}

/** 本日のテキストをコース（チップ用）と詳細に分解 */
export function lessonTodayTextParts(
  lesson: Pick<Lesson, "textbook" | "subject" | "status">,
  student: StudentTextFields | null | undefined,
  plannedTextOverride?: string | null
): LessonTodayTextParts {
  const full = lessonTodayTextLabel(lesson, student, plannedTextOverride);
  const subject = lesson.subject ?? "";
  const { course, detail } = parseTodayTextParts(full, subject);
  return { course, detail, full };
}

export const DAILY_CONFIRM_ATTENDANCE_OPTIONS: {
  value: AttendanceStatus;
  label: string;
}[] = [
  { value: "present", label: "出席" },
  { value: "late", label: "遅刻" },
  { value: "absent", label: "欠席" },
  { value: "makeup", label: "振替" },
];
