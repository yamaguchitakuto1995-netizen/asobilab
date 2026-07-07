import { shiftDate } from "@/lib/date";
import {
  makeupTargetMaxDate,
  todayJstIso,
} from "@/lib/registrationDeadlines";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffLessonOption = {
  id: string;
  lesson_date: string;
  period: number;
  subject: string;
  attendance: string;
  lesson_classroom: string | null;
};

type LessonRow = {
  id: string;
  lesson_date: string;
  period: number | null;
  subject: string | null;
  attendance: string;
  lesson_classroom: string | null;
  source_lesson_date?: string | null;
  source_period?: number | null;
  source_subject?: string | null;
};

function normalizeLessonRow(row: LessonRow): StaffLessonOption | null {
  if (row.period == null || row.subject == null) return null;
  return {
    id: row.id,
    lesson_date: String(row.lesson_date).slice(0, 10),
    period: Number(row.period),
    subject: row.subject,
    attendance: row.attendance,
    lesson_classroom: row.lesson_classroom ?? null,
  };
}

function sourceChainKey(row: {
  lesson_date: string;
  period: number;
  subject: string;
  source_lesson_date?: string | null;
  source_period?: number | null;
  source_subject?: string | null;
}): string {
  const date = row.source_lesson_date ?? row.lesson_date;
  const period = row.source_period ?? row.period;
  const subject = row.source_subject ?? row.subject;
  return `${date}:${period}:${subject}`;
}

/** 講師向け: 出席予定・振替予定の scheduled 授業 */
export async function listAttendanceSourceLessonsForStaff(
  supabase: SupabaseClient,
  studentId: string,
  fromDate: string
): Promise<StaffLessonOption[]> {
  const { data, error } = await supabase
    .from("lessons")
    .select("id, lesson_date, period, subject, attendance, lesson_classroom")
    .eq("student_id", studentId)
    .eq("status", "scheduled")
    .gte("lesson_date", fromDate)
    .in("attendance", ["present", "makeup"])
    .not("period", "is", null)
    .not("subject", "is", null)
    .order("lesson_date", { ascending: true })
    .order("period", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => normalizeLessonRow(row as LessonRow))
    .filter((row): row is StaffLessonOption => row !== null);
}

/** 講師向け: 欠席済みで振替未登録の scheduled 授業 */
export async function listPendingAbsenceLessonsForStaff(
  supabase: SupabaseClient,
  studentId: string,
  fromDate: string
): Promise<StaffLessonOption[]> {
  const [{ data: absentRows, error: absentError }, { data: makeupRows, error: makeupError }] =
    await Promise.all([
      supabase
        .from("lessons")
        .select(
          "id, lesson_date, period, subject, attendance, lesson_classroom, source_lesson_date, source_period, source_subject"
        )
        .eq("student_id", studentId)
        .eq("status", "scheduled")
        .eq("attendance", "absent")
        .gte("lesson_date", fromDate)
        .not("period", "is", null)
        .not("subject", "is", null)
        .order("lesson_date", { ascending: true })
        .order("period", { ascending: true }),
      supabase
        .from("lessons")
        .select("source_lesson_date, source_period, source_subject")
        .eq("student_id", studentId)
        .eq("status", "scheduled")
        .eq("attendance", "makeup")
        .not("source_lesson_date", "is", null),
    ]);

  if (absentError) throw new Error(absentError.message);
  if (makeupError) throw new Error(makeupError.message);

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

  return (absentRows ?? [])
    .map((row) => normalizeLessonRow(row as LessonRow))
    .filter((row): row is StaffLessonOption => row !== null)
    .filter((row) => !bookedKeys.has(sourceChainKey(row)));
}

/** 講師登録用の振替先日付レンジ（保護者の3日前締切は適用しない） */
export function makeupTargetDateRangeForStaff(
  sourceLessonDates: string[],
  now = new Date()
): { min: string; max: string } {
  const today = todayJstIso(now);
  const max120 = shiftDate(today, 120);

  if (sourceLessonDates.length === 0) {
    return { min: today, max: max120 };
  }

  const mins = sourceLessonDates.map((d) => {
    const sourceMonthStart = `${d.slice(0, 7)}-01`;
    return sourceMonthStart > today ? sourceMonthStart : today;
  });
  const maxs = sourceLessonDates.map((d) => makeupTargetMaxDate(d));
  const cappedMax = maxs.sort()[0]!;

  return {
    min: mins.sort().reverse()[0]!,
    max: cappedMax < max120 ? cappedMax : max120,
  };
}

/** 講師登録用の振替先日付チェック（3日前締切はスキップ） */
export function validateMakeupTargetDateForStaff(
  sourceLessonDate: string,
  targetLessonDate: string,
  now = new Date()
): { ok: true } | { ok: false; error: string } {
  const sourceYm = sourceLessonDate.slice(0, 7);
  const targetYm = targetLessonDate.slice(0, 7);
  const today = todayJstIso(now);

  if (targetYm < sourceYm) {
    return {
      ok: false,
      error:
        "振替先は欠席月より前の月には設定できません。同月内であれば前の日付への振替が可能です。",
    };
  }

  if (targetLessonDate < today) {
    return {
      ok: false,
      error: "振替先の授業はすでに終了しているため、登録できません。",
    };
  }

  const range = makeupTargetDateRangeForStaff([sourceLessonDate], now);
  if (targetLessonDate < range.min) {
    return {
      ok: false,
      error: `振替先の日付は ${range.min} 以降を選んでください。`,
    };
  }
  if (targetLessonDate > range.max) {
    return {
      ok: false,
      error: `振替先は ${range.max} まで選べます。`,
    };
  }

  return { ok: true };
}
