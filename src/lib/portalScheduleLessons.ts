import { formatDateLong } from "@/lib/date";
import {
  effectiveLessonClassroom,
  periodLabel,
  type AttendanceStatus,
  type ClassroomPeriodTime,
} from "@/lib/types";
import {
  canRegisterAbsence,
  isPendingAbsenceMakeupOpen,
} from "@/lib/registrationDeadlines";

export type PortalScheduleLesson = {
  id: string;
  lesson_date: string;
  period: number | null;
  subject: string | null;
  attendance: AttendanceStatus;
  lesson_classroom?: string | null;
  source_lesson_date?: string | null;
  source_period?: number | null;
  source_subject?: string | null;
};

function lessonSlotKey(input: {
  lesson_date: string;
  period: number | null;
  subject: string | null;
}): string {
  return `${input.lesson_date}|${input.period}|${input.subject ?? ""}`;
}

/** 振替先が参照する元欠席のキー（DB の coalesce と同じ） */
function absenceSourceKey(lesson: PortalScheduleLesson): string {
  return lessonSlotKey({
    lesson_date: lesson.source_lesson_date ?? lesson.lesson_date,
    period: lesson.source_period ?? lesson.period,
    subject: lesson.source_subject ?? lesson.subject ?? "",
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

/** 保護者ポータルで授業行を表示し続けるか */
export function isPortalScheduleLessonVisible(
  lesson: PortalScheduleLesson,
  opts: {
    studentClassroom: string | null;
    periodTimes: ClassroomPeriodTime[];
    now?: Date;
  }
): boolean {
  if (lesson.attendance === "absent") {
    return isPendingAbsenceMakeupOpen(lesson.lesson_date, opts.now);
  }

  if (lesson.period == null || !lesson.subject) return false;

  const venue = effectiveLessonClassroom(lesson, opts.studentClassroom);
  return canRegisterAbsence(
    {
      lessonDate: lesson.lesson_date,
      period: lesson.period,
      subject: lesson.subject,
      classroom: venue,
      periodTimes: opts.periodTimes,
    },
    opts.now
  ).ok;
}

/** 振替登録済みの欠席予定を一覧から除く（保護者・職員の今後の予定用） */
export function hideAbsencesWithMakeupRegistered<T extends PortalScheduleLesson>(
  lessons: T[]
): T[] {
  const covered = makeupSourceKeys(lessons);
  return lessons.filter((lesson) => {
    if (
      lesson.attendance === "absent" &&
      covered.has(absenceSourceKey(lesson))
    ) {
      return false;
    }
    return true;
  });
}

/** 振替登録済みの欠席予定を除き、締切を過ぎた授業も除いた一覧 */
export function visiblePortalScheduleLessons(
  lessons: PortalScheduleLesson[],
  opts: {
    studentClassroom: string | null;
    periodTimes: ClassroomPeriodTime[];
    now?: Date;
  }
): PortalScheduleLesson[] {
  return hideAbsencesWithMakeupRegistered(lessons).filter((lesson) =>
    isPortalScheduleLessonVisible(lesson, opts)
  );
}

/** 振替元の表示（振替先の行の下に表示） */
export function formatMakeupSourceLine(
  lesson: Pick<
    PortalScheduleLesson,
    "source_lesson_date" | "source_period" | "source_subject"
  >
): string | null {
  if (!lesson.source_lesson_date || lesson.source_period == null) return null;
  return `振替：${formatDateLong(lesson.source_lesson_date)} ${periodLabel(lesson.source_period)} からの振替`;
}

export function portalScheduleAttendanceLabel(
  lesson: PortalScheduleLesson
): string {
  if (lesson.attendance === "on_leave") return "休会中";
  if (lesson.attendance === "absent") return "欠席予定 要振替登録";
  if (lesson.attendance === "present") return "出席予定";
  if (lesson.attendance === "makeup") return "振替予定";
  return "—";
}
