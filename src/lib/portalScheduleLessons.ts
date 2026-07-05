import type { AttendanceStatus } from "@/lib/types";

export type PortalScheduleLesson = {
  id: string;
  lesson_date: string;
  period: number;
  subject: string;
  attendance: AttendanceStatus;
  lesson_classroom?: string | null;
  source_lesson_date?: string | null;
  source_period?: number | null;
  source_subject?: string | null;
};

function lessonSlotKey(input: {
  lesson_date: string;
  period: number;
  subject: string;
}): string {
  return `${input.lesson_date}|${input.period}|${input.subject}`;
}

/** 振替先が参照する元欠席のキー（DB の coalesce と同じ） */
function absenceSourceKey(lesson: PortalScheduleLesson): string {
  return lessonSlotKey({
    lesson_date: lesson.source_lesson_date ?? lesson.lesson_date,
    period: lesson.source_period ?? lesson.period,
    subject: lesson.source_subject ?? lesson.subject,
  });
}

function makeupSourceKeys(lessons: PortalScheduleLesson[]): Set<string> {
  const keys = new Set<string>();
  for (const lesson of lessons) {
    if (lesson.attendance !== "makeup") continue;
    if (!lesson.source_lesson_date || lesson.source_period == null) continue;
    keys.add(
      lessonSlotKey({
        lesson_date: lesson.source_lesson_date,
        period: lesson.source_period,
        subject: lesson.source_subject ?? "",
      })
    );
  }
  return keys;
}

/** 振替登録済みの欠席予定を除いた、保護者ポータル用の授業一覧 */
export function visiblePortalScheduleLessons(
  lessons: PortalScheduleLesson[]
): PortalScheduleLesson[] {
  const covered = makeupSourceKeys(lessons);
  return lessons.filter((lesson) => {
    if (lesson.attendance !== "absent") return true;
    return !covered.has(absenceSourceKey(lesson));
  });
}

export function portalScheduleAttendanceLabel(
  lesson: PortalScheduleLesson
): string {
  if (lesson.attendance === "absent") return "欠席予定 要振替登録";
  if (lesson.attendance === "present") return "出席予定";
  if (lesson.attendance === "makeup") return "振替予定";
  return "—";
}
