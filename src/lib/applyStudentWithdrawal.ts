import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIso } from "@/lib/date";
import { isLessonAfterWithdrawal } from "@/lib/studentWithdrawal";

/** 退会予定月より後の自動作成出席予定を削除 */
export async function applyWithdrawalToScheduledLessons(
  supabase: SupabaseClient,
  studentId: string,
  withdrawalUntilYm: string | null
): Promise<{ error: string | null }> {
  if (!withdrawalUntilYm?.trim()) return { error: null };

  const today = todayIso();
  const { data: lessons, error } = await supabase
    .from("lessons")
    .select("id, lesson_date")
    .eq("student_id", studentId)
    .eq("status", "scheduled")
    .gte("lesson_date", today);

  if (error) return { error: error.message };

  const toDelete = (lessons ?? []).filter((l) =>
    isLessonAfterWithdrawal(l.lesson_date, withdrawalUntilYm)
  );

  if (toDelete.length === 0) return { error: null };

  const { error: delErr } = await supabase
    .from("lessons")
    .delete()
    .in(
      "id",
      toDelete.map((l) => l.id)
    );

  return { error: delErr?.message ?? null };
}
