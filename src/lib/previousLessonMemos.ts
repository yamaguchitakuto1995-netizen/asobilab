import type { SupabaseClient } from "@supabase/supabase-js";

type LessonRef = {
  id: string;
  student_id: string;
  subject: string | null;
  lesson_date: string;
  period: number | null;
};

type RecordedRow = {
  id: string;
  student_id: string;
  subject: string | null;
  lesson_date: string;
  period: number | null;
  text_memo: string | null;
};

function isBeforeLesson(a: RecordedRow, b: LessonRef): boolean {
  if (a.id === b.id) return false;
  if (a.lesson_date < b.lesson_date) return true;
  if (a.lesson_date > b.lesson_date) return false;
  return (a.period ?? 0) < (b.period ?? 0);
}

/** 各授業に対する「前回の備考」（同一生徒・同一教科の直前の記録済み授業の text_memo） */
export async function fetchPreviousLessonMemos(
  supabase: SupabaseClient,
  lessons: LessonRef[],
  selectedDate: string
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  if (lessons.length === 0) return result;

  const studentIds = [...new Set(lessons.map((l) => l.student_id))];
  const { data: rows, error } = await supabase
    .from("lessons")
    .select("id, student_id, subject, lesson_date, period, text_memo")
    .in("student_id", studentIds)
    .eq("status", "recorded")
    .lte("lesson_date", selectedDate)
    .order("lesson_date", { ascending: false })
    .order("period", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);

  const recorded = (rows ?? []) as RecordedRow[];

  for (const lesson of lessons) {
    const prev = recorded.find(
      (r) =>
        r.student_id === lesson.student_id &&
        r.subject === lesson.subject &&
        isBeforeLesson(r, lesson)
    );
    result[lesson.id] = prev?.text_memo?.trim() || null;
  }

  return result;
}
