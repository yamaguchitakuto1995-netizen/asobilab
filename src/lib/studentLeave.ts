import {
  buildProgrammingNextTextFromParts,
  buildRobotNextTextFromParts,
  programmingNextTextStudentColumnsFromCombined,
  resolveProgrammingNextTextPartsForStudent,
  resolveRobotNextTextPartsForStudent,
  robotNextTextStudentColumnsFromCombined,
  TWO_LAP_ROBOT_COURSES,
} from "@/lib/courseNextText";
import { todayJstIso } from "@/lib/registrationDeadlines";

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type StudentLeavePeriod = {
  leave_from_ym?: string | null;
  leave_until_ym?: string | null;
};

export function isValidYearMonth(value: string): boolean {
  return YM_RE.test(value.trim());
}

export function lessonYearMonth(lessonDate: string): string {
  return lessonDate.slice(0, 7);
}

/** 授業日の月が休会期間に含まれるか */
export function isLessonMonthOnLeave(
  lessonDate: string,
  leave: StudentLeavePeriod,
  now = new Date()
): boolean {
  const until = leave.leave_until_ym?.trim();
  if (!until) return false;

  let from = leave.leave_from_ym?.trim();
  if (!from) {
    from = todayJstIso(now).slice(0, 7);
  }

  const ym = lessonYearMonth(lessonDate);
  return ym >= from && ym <= until;
}

export function formatYearMonthJa(ym: string): string {
  const year = ym.slice(0, 4);
  const month = Number(ym.slice(5, 7));
  return `${year}年${month}月`;
}

/** 表示用の休会開始月（未設定時は今月） */
export function effectiveLeaveFromYm(
  leave: StudentLeavePeriod,
  now = new Date()
): string | null {
  const until = leave.leave_until_ym?.trim();
  if (!until) return null;
  return leave.leave_from_ym?.trim() || todayJstIso(now).slice(0, 7);
}

export type LeavePeriodStatus = "active" | "upcoming" | "past";

/** 休会期間の表示ラベル（例: 2025年7月〜2026年8月） */
export function formatLeavePeriodRange(
  leave: StudentLeavePeriod,
  now = new Date()
): string | null {
  const until = leave.leave_until_ym?.trim();
  const from = effectiveLeaveFromYm(leave, now);
  if (!until || !from) return null;
  return `${formatYearMonthJa(from)}〜${formatYearMonthJa(until)}`;
}

export function leavePeriodStatus(
  leave: StudentLeavePeriod,
  now = new Date()
): LeavePeriodStatus | null {
  const until = leave.leave_until_ym?.trim();
  const from = effectiveLeaveFromYm(leave, now);
  if (!until || !from) return null;

  const currentYm = todayJstIso(now).slice(0, 7);
  if (currentYm > until) return "past";
  if (currentYm < from) return "upcoming";
  return "active";
}

export function leavePeriodStatusLabel(
  status: LeavePeriodStatus
): string {
  switch (status) {
    case "active":
      return "現在休会中";
    case "upcoming":
      return "休会予定";
    case "past":
      return "休会終了";
  }
}

export function readLeavePeriodFromForm(formData: FormData): {
  leave_from_ym: string | null;
  leave_until_ym: string | null;
  error?: string;
} {
  const fromRaw = String(formData.get("leave_from_ym") ?? "").trim();
  const untilRaw = String(formData.get("leave_until_ym") ?? "").trim();

  if (!fromRaw && !untilRaw) {
    return { leave_from_ym: null, leave_until_ym: null };
  }

  if (untilRaw && !isValidYearMonth(untilRaw)) {
    return {
      leave_from_ym: null,
      leave_until_ym: null,
      error: "休会終了月の形式が不正です（YYYY-MM）。",
    };
  }
  if (fromRaw && !isValidYearMonth(fromRaw)) {
    return {
      leave_from_ym: null,
      leave_until_ym: null,
      error: "休会開始月の形式が不正です（YYYY-MM）。",
    };
  }

  let leave_from_ym = fromRaw || null;
  const leave_until_ym = untilRaw || null;

  if (leave_until_ym && !leave_from_ym) {
    leave_from_ym = todayJstIso().slice(0, 7);
  }

  if (leave_from_ym && leave_until_ym && leave_from_ym > leave_until_ym) {
    return {
      leave_from_ym: null,
      leave_until_ym: null,
      error: "休会開始月は休会終了月以前にしてください。",
    };
  }

  return { leave_from_ym, leave_until_ym };
}

/** 休会明けの月にテキストを合わせる必要があるか */
export function shouldSnapNextTextAfterLeave(
  leave: StudentLeavePeriod,
  now = new Date()
): boolean {
  const { leave_until_ym } = leave;
  if (!leave_until_ym) return false;
  const currentYm = todayJstIso(now).slice(0, 7);
  return currentYm > leave_until_ym;
}

function lapFromRobotText(text: string | null | undefined): string {
  if (text?.includes("2周目")) return "2周目";
  return "1周目";
}

/** 復帰月の先頭単元（例: 9月 → 9-1）に次回テキストを合わせる */
export function snapRobotNextTextToCalendarMonth(
  student: {
    next_text_robot?: string | null;
    next_text_robot_course?: string | null;
    next_text_robot_text?: string | null;
  },
  month: number
): ReturnType<typeof robotNextTextStudentColumnsFromCombined> | null {
  const resolved = resolveRobotNextTextPartsForStudent(student);
  const course = resolved?.course?.trim();
  if (!course) return null;

  const unit = `${month}-1`;
  let text = unit;
  if (TWO_LAP_ROBOT_COURSES.has(course)) {
    text = `${lapFromRobotText(resolved?.text)} / ${unit}`;
  }

  const combined = buildRobotNextTextFromParts(course, text);
  if (!combined) return null;
  return robotNextTextStudentColumnsFromCombined(combined);
}

export function snapProgrammingNextTextToCalendarMonth(
  student: {
    next_text_programming?: string | null;
    next_text_programming_course?: string | null;
    next_text_programming_text?: string | null;
  },
  month: number
): ReturnType<typeof programmingNextTextStudentColumnsFromCombined> | null {
  const resolved = resolveProgrammingNextTextPartsForStudent(student);
  const course = resolved?.course?.trim();
  if (!course) return null;

  const combined = buildProgrammingNextTextFromParts(course, `${month}-1`);
  if (!combined) return null;
  return programmingNextTextStudentColumnsFromCombined(combined);
}

export function snapNextTextColumnsForSubjects(
  student: {
    subjects?: string[] | null;
    next_text_robot?: string | null;
    next_text_robot_course?: string | null;
    next_text_robot_text?: string | null;
    next_text_programming?: string | null;
    next_text_programming_course?: string | null;
    next_text_programming_text?: string | null;
  },
  month: number
): Record<string, string | null> {
  const subjects = new Set(student.subjects ?? []);
  const patch: Record<string, string | null> = {};

  if (subjects.has("ロボット")) {
    const cols = snapRobotNextTextToCalendarMonth(student, month);
    if (cols) {
      patch.next_text_robot = cols.next_text_robot;
      patch.next_text_robot_course = cols.next_text_robot_course;
      patch.next_text_robot_text = cols.next_text_robot_text;
    }
  }

  if (subjects.has("プログラミング")) {
    const cols = snapProgrammingNextTextToCalendarMonth(student, month);
    if (cols) {
      patch.next_text_programming = cols.next_text_programming;
      patch.next_text_programming_course = cols.next_text_programming_course;
      patch.next_text_programming_text = cols.next_text_programming_text;
    }
  }

  return patch;
}

export function attendanceForScheduledEnrollment(
  lessonDate: string,
  leave: StudentLeavePeriod
): "present" | "on_leave" {
  return isLessonMonthOnLeave(lessonDate, leave) ? "on_leave" : "present";
}
