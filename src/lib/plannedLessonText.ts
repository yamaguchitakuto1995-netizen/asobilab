import {
  advanceProgrammingNextTextCombined,
  advanceRobotNextTextCombined,
  resolveProgrammingNextTextPartsForStudent,
  resolveRobotNextTextPartsForStudent,
} from "@/lib/courseNextText";

export type StudentTextFields = {
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
  subject: string
): number {
  return upcoming.filter(
    (l) =>
      l.subject === subject &&
      l.status === "scheduled" &&
      ADVANCING_ATTENDANCES.has(l.attendance) &&
      l.id !== target.id &&
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

  const base =
    subject === "ロボット"
      ? resolveRobotNextTextPartsForStudent({
          next_text_robot: student.next_text_robot,
          next_text_robot_course: student.next_text_robot_course,
          next_text_robot_text: student.next_text_robot_text,
        })?.full ?? null
      : resolveProgrammingNextTextPartsForStudent({
          next_text_programming: student.next_text_programming,
          next_text_programming_course: student.next_text_programming_course,
          next_text_programming_text: student.next_text_programming_text,
        })?.full ?? null;

  if (!base) return "—";

  const steps = countPriorAdvancingScheduledLessons(
    upcomingScheduled,
    {
      id: lesson.id,
      lesson_date: lesson.lesson_date,
      period: lesson.period,
      subject: lesson.subject,
    },
    subject
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
