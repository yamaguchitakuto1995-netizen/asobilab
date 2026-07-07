import {
  isPendingAbsenceMakeupOpen,
  makeupPendingAbsenceFromDate,
} from "@/lib/registrationDeadlines";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MakeupExpiryReminder = {
  lessonId: string;
  studentId: string;
  studentName: string;
  lessonDate: string;
  period: number;
  subject: string;
  message: string;
};

type AbsentLessonRow = {
  id: string;
  student_id: string;
  lesson_date: string;
  period: number | null;
  subject: string | null;
  source_lesson_date: string | null;
  source_period: number | null;
  source_subject: string | null;
  students: { name: string } | null;
};

function absenceSourceKey(row: AbsentLessonRow): string | null {
  if (row.period == null || !row.subject) return null;
  const date = row.source_lesson_date ?? row.lesson_date;
  const period = row.source_period ?? row.period;
  const subject = row.source_subject ?? row.subject;
  return `${date}:${period}:${subject}`;
}

function formatAbsenceDateJa(lessonDate: string): string {
  const date = new Date(`${lessonDate}T00:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatMakeupExpiryReminderMessage(
  studentName: string,
  lessonDate: string
): string {
  return `${studentName}さんの${formatAbsenceDateJa(lessonDate)}欠席分の振替が失効しました。必要に応じて進度調整をしてください。`;
}

/** 振替期限切れで未対応の欠席一覧（管理者ダッシュボード用） */
export async function listUnacknowledgedMakeupExpiryReminders(
  supabase: SupabaseClient
): Promise<MakeupExpiryReminder[]> {
  const lookbackFrom = makeupPendingAbsenceFromDate();

  const [{ data: absentRows, error: absentError }, { data: makeupRows, error: makeupError }, { data: ackRows, error: ackError }] =
    await Promise.all([
      supabase
        .from("lessons")
        .select(
          "id, student_id, lesson_date, period, subject, source_lesson_date, source_period, source_subject, students ( name )"
        )
        .eq("status", "scheduled")
        .eq("attendance", "absent")
        .gte("lesson_date", lookbackFrom)
        .not("period", "is", null)
        .not("subject", "is", null)
        .order("lesson_date", { ascending: false })
        .returns<AbsentLessonRow[]>(),
      supabase
        .from("lessons")
        .select("source_lesson_date, source_period, source_subject")
        .eq("status", "scheduled")
        .eq("attendance", "makeup")
        .not("source_lesson_date", "is", null),
      supabase
        .from("makeup_expiry_acknowledgments")
        .select("lesson_id"),
    ]);

  if (absentError) throw new Error(absentError.message);
  if (makeupError) throw new Error(makeupError.message);
  if (ackError) throw new Error(ackError.message);

  const bookedKeys = new Set(
    (makeupRows ?? []).map((row) => {
      const r = row as {
        source_lesson_date: string;
        source_period: number;
        source_subject: string;
      };
      return `${r.source_lesson_date}:${r.source_period}:${r.source_subject}`;
    })
  );

  const acknowledgedIds = new Set(
    (ackRows ?? []).map((row) => String((row as { lesson_id: string }).lesson_id))
  );

  const reminders: MakeupExpiryReminder[] = [];

  for (const row of absentRows ?? []) {
    if (acknowledgedIds.has(row.id)) continue;

    const sourceKey = absenceSourceKey(row);
    if (!sourceKey || bookedKeys.has(sourceKey)) continue;

    if (isPendingAbsenceMakeupOpen(row.lesson_date)) continue;

    const studentName = row.students?.name?.trim() || "（名前不明）";
    reminders.push({
      lessonId: row.id,
      studentId: row.student_id,
      studentName,
      lessonDate: String(row.lesson_date).slice(0, 10),
      period: Number(row.period),
      subject: row.subject!,
      message: formatMakeupExpiryReminderMessage(studentName, row.lesson_date),
    });
  }

  return reminders.sort((a, b) => b.lessonDate.localeCompare(a.lessonDate));
}
