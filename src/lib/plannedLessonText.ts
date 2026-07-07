import {
  advanceProgrammingNextTextCombined,
  advanceRobotNextTextCombined,
  firstCombinedTextOfNextCourse,
  parseProgrammingNextTextParts,
  parseRobotNextTextParts,
  resolveProgrammingNextTextPartsForStudent,
  resolveRobotNextTextPartsForStudent,
} from "@/lib/courseNextText";
import {
  estimateAutoPromotionScheduledYm,
  type PromotionStudentFields,
} from "@/lib/studentPromotion";
import type { CourseStartFields } from "@/lib/studentCourseStart";

export type StudentTextFields = PromotionStudentFields &
  CourseStartFields & {
  next_text_robot: string | null;
  next_text_robot_course?: string | null;
  next_text_robot_text?: string | null;
  next_text_programming: string | null;
  next_text_programming_course?: string | null;
  next_text_programming_text?: string | null;
};

export type ScheduledLessonForPlanning = {
  id: string;
  lesson_date: string;
  period: number | null;
  subject: string | null;
  attendance: string;
  status: string;
};

const ADVANCING_ATTENDANCES = new Set(["present", "makeup"]);

function isBeforeLessonSlot(
  a: { lesson_date: string; period: number | null },
  target: { lesson_date: string; period: number | null }
): boolean {
  if (a.lesson_date < target.lesson_date) return true;
  if (a.lesson_date > target.lesson_date) return false;
  return (a.period ?? 0) < (target.period ?? 0);
}

/** 対象より前の「出席予定・振替予定」scheduled コマ数（同教科） */
export function countPriorAdvancingScheduledLessons(
  upcoming: ScheduledLessonForPlanning[],
  target: {
    id?: string;
    lesson_date: string;
    period: number | null;
    subject: string | null;
  },
  subject: string,
  /** 進級予定月以降のコマだけカウントするとき（例: 9月進級なら 2026-09） */
  advanceCountFromYm?: string | null
): number {
  return upcoming.filter(
    (l) =>
      l.subject === subject &&
      l.status === "scheduled" &&
      ADVANCING_ATTENDANCES.has(l.attendance) &&
      l.id !== target.id &&
      (!advanceCountFromYm ||
        l.lesson_date.slice(0, 7) >= advanceCountFromYm) &&
      isBeforeLessonSlot(l, target)
  ).length;
}

function advanceCombinedBySteps(
  subject: "ロボット" | "プログラミング",
  current: string | null,
  steps: number
): string | null {
  let cur = current;
  for (let i = 0; i < steps; i++) {
    const next =
      subject === "ロボット"
        ? advanceRobotNextTextCombined(cur)
        : advanceProgrammingNextTextCombined(cur);
    if (!next || next === cur) break;
    cur = next;
  }
  return cur;
}

function lessonYearMonth(lessonDate: string): string {
  return lessonDate.slice(0, 7);
}

function resolvePromotionScheduledYm(
  subject: "ロボット" | "プログラミング",
  student: PromotionStudentFields
): string | null {
  if (
    student.promotion_type === "skip_grade" &&
    student.promotion_scheduled_ym?.trim()
  ) {
    return student.promotion_scheduled_ym.trim();
  }
  return estimateAutoPromotionScheduledYm(subject, student);
}

function courseOfCombinedText(
  subject: "ロボット" | "プログラミング",
  full: string
): string | null {
  const parsed =
    subject === "ロボット"
      ? parseRobotNextTextParts(full)
      : parseProgrammingNextTextParts(full);
  return parsed?.course ?? null;
}

/** 進級予定月以降は次コース先頭を起点にする */
function resolvePlanningBase(
  subject: "ロボット" | "プログラミング",
  student: StudentTextFields,
  lessonDate: string
): { base: string | null; advanceCountFromYm: string | null } {
  const current =
    subject === "ロボット"
      ? resolveRobotNextTextPartsForStudent(student)?.full ?? null
      : resolveProgrammingNextTextPartsForStudent(student)?.full ?? null;
  if (!current) return { base: null, advanceCountFromYm: null };

  const promoYm = resolvePromotionScheduledYm(subject, student);
  if (!promoYm || lessonYearMonth(lessonDate) < promoYm) {
    return { base: current, advanceCountFromYm: null };
  }

  const nextFirst = firstCombinedTextOfNextCourse(subject, student);
  if (!nextFirst) return { base: current, advanceCountFromYm: null };

  const currentCourse = courseOfCombinedText(subject, current);
  const nextCourse = courseOfCombinedText(subject, nextFirst);
  if (!nextCourse || currentCourse === nextCourse) {
    return { base: current, advanceCountFromYm: null };
  }

  return { base: nextFirst, advanceCountFromYm: promoYm };
}

/**
 * 予定コマの受講予定テキスト。
 * 記録済みは textbook、予定は next_text を起点に前の予定コマ数だけ進めた値。
 */
export function plannedTextForScheduledLesson(
  lesson: {
    id?: string;
    lesson_date: string;
    period: number | null;
    subject: string | null;
    status: string;
    attendance: string;
    textbook?: string | null;
  },
  student: StudentTextFields | null | undefined,
  upcomingScheduled: ScheduledLessonForPlanning[]
): string {
  const tb = lesson.textbook?.trim();
  if (tb) return tb;

  if (lesson.status !== "scheduled") return "—";
  if (!student || !lesson.subject) return "—";
  if (lesson.attendance === "absent" || lesson.attendance === "on_leave") {
    return "—";
  }

  const subject = lesson.subject;
  if (subject !== "ロボット" && subject !== "プログラミング") return "—";

  const { base, advanceCountFromYm } = resolvePlanningBase(
    subject,
    student,
    lesson.lesson_date
  );
  if (!base) return "—";

  const steps = countPriorAdvancingScheduledLessons(
    upcomingScheduled,
    {
      id: lesson.id,
      lesson_date: lesson.lesson_date,
      period: lesson.period,
      subject: lesson.subject,
    },
    subject,
    advanceCountFromYm
  );

  return advanceCombinedBySteps(subject, base, steps) ?? "—";
}

export function groupUpcomingScheduledByStudent(
  rows: (ScheduledLessonForPlanning & { student_id: string })[]
): Map<string, ScheduledLessonForPlanning[]> {
  const map = new Map<string, ScheduledLessonForPlanning[]>();
  for (const row of rows) {
    const list = map.get(row.student_id) ?? [];
    list.push(row);
    map.set(row.student_id, list);
  }
  return map;
}

export function buildPlannedTextByLessonId(
  lessons: Array<{
    id: string;
    student_id: string;
    lesson_date: string;
    period: number | null;
    subject: string | null;
    status: string;
    attendance: string;
    textbook?: string | null;
    students: StudentTextFields | null;
  }>,
  upcomingByStudent: Map<string, ScheduledLessonForPlanning[]>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const lesson of lessons) {
    const upcoming = upcomingByStudent.get(lesson.student_id) ?? [];
    map[lesson.id] = plannedTextForScheduledLesson(
      lesson,
      lesson.students,
      upcoming
    );
  }
  return map;
}
