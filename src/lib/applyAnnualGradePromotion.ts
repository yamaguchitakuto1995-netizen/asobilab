import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIso } from "@/lib/date";
import {
  nextGradeLevel,
  schoolYearStartYm,
} from "@/lib/annualGradePromotion";
import type { GradeLevel } from "@/lib/types";

type GradeStudentRow = {
  id: string;
  grade: GradeLevel;
  grade_promoted_through_ym?: string | null;
};

/**
 * 4月1日を境に学年を1つ上げる（年長→小1 など）。
 * grade_promoted_through_ym が当該年度の4月未満の生徒のみ対象。
 */
export async function applyAnnualGradePromotionIfNeeded(
  supabase: SupabaseClient,
  nowDate: string = todayIso()
): Promise<{ promoted: number; error?: string }> {
  const targetYm = schoolYearStartYm(nowDate);
  const [, month, day] = nowDate.split("-").map(Number);
  if (month < 4 || (month === 4 && day < 1)) {
    return { promoted: 0 };
  }

  const { data: students, error: fetchError } = await supabase
    .from("students")
    .select("id, grade, grade_promoted_through_ym")
    .or(`grade_promoted_through_ym.is.null,grade_promoted_through_ym.lt.${targetYm}`);

  if (fetchError) return { promoted: 0, error: fetchError.message };
  if (!students?.length) return { promoted: 0 };

  let promoted = 0;
  for (const row of students as GradeStudentRow[]) {
    const next = nextGradeLevel(row.grade);
    if (!next) {
      await supabase
        .from("students")
        .update({ grade_promoted_through_ym: targetYm })
        .eq("id", row.id);
      continue;
    }

    const { error } = await supabase
      .from("students")
      .update({
        grade: next,
        grade_promoted_through_ym: targetYm,
      })
      .eq("id", row.id);

    if (!error) promoted++;
  }

  return { promoted };
}
