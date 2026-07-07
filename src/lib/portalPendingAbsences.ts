import {
  isPendingAbsenceMakeupOpen,
  makeupPendingAbsenceFromDate,
} from "@/lib/registrationDeadlines";
import { dedupeScheduledLessonsBySlot } from "@/lib/scheduledLessonDedupe";
import type { PortalScheduleLesson } from "@/lib/portalScheduleLessons";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PortalPendingAbsenceRow = {
  id: string;
  lesson_date: string;
  period: number;
  subject: string;
  attendance: string;
  lesson_classroom: string | null;
};

function normalizePendingRow(
  row: PortalPendingAbsenceRow
): PortalPendingAbsenceRow | null {
  if (row.period == null || !row.subject) return null;
  return {
    id: String(row.id),
    lesson_date: String(row.lesson_date).slice(0, 10),
    period: Number(row.period),
    subject: row.subject,
    attendance: row.attendance,
    lesson_classroom: row.lesson_classroom ?? null,
  };
}

/** 保護者ポータル: 振替未登録の欠席（過去分の手動登録を含む） */
export async function listPendingAbsencesForPortal(
  supabase: SupabaseClient,
  input: {
    studentId: string;
    portalId: string;
    birthday: string;
  }
): Promise<PortalPendingAbsenceRow[]> {
  const { data, error } = await supabase.rpc("list_pending_absences_for_makeup", {
    p_student_id: input.studentId,
    p_portal_id: input.portalId,
    p_birthday: input.birthday,
    p_from_date: makeupPendingAbsenceFromDate(),
  });

  if (error) throw new Error(error.message);

  return dedupeScheduledLessonsBySlot(
    ((data ?? []) as PortalPendingAbsenceRow[])
      .map((row) => normalizePendingRow(row))
      .filter((row): row is PortalPendingAbsenceRow => row !== null)
      .filter((row) => isPendingAbsenceMakeupOpen(row.lesson_date))
  );
}

export function pendingAbsenceToPortalLesson(
  row: PortalPendingAbsenceRow
): PortalScheduleLesson {
  return {
    id: row.id,
    lesson_date: row.lesson_date,
    period: row.period,
    subject: row.subject,
    attendance: "absent",
    lesson_classroom: row.lesson_classroom,
  };
}

export function mergePortalScheduleWithPendingAbsences(
  lessons: PortalScheduleLesson[],
  pendingRows: PortalPendingAbsenceRow[]
): PortalScheduleLesson[] {
  const byId = new Map<string, PortalScheduleLesson>();
  for (const lesson of lessons) {
    byId.set(lesson.id, lesson);
  }
  for (const row of pendingRows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, pendingAbsenceToPortalLesson(row));
    }
  }
  return [...byId.values()].sort((a, b) => {
    const dateCmp = a.lesson_date.localeCompare(b.lesson_date);
    if (dateCmp !== 0) return dateCmp;
    return (a.period ?? 0) - (b.period ?? 0);
  });
}
