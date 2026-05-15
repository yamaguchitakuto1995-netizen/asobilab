import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceStatus } from "@/lib/types";
import {
  advanceProgrammingNextTextCombined,
  advanceRobotNextTextCombined,
  programmingNextTextStudentColumnsFromCombined,
  resolveProgrammingNextTextPartsForStudent,
  resolveRobotNextTextPartsForStudent,
  robotNextTextStudentColumnsFromCombined,
} from "@/lib/courseNextText";

type StudentNextRow = {
  next_text_robot?: string | null;
  next_text_robot_course?: string | null;
  next_text_robot_text?: string | null;
  next_text_programming?: string | null;
  next_text_programming_course?: string | null;
  next_text_programming_text?: string | null;
};

/** 実施としてテキストを1つ進める出欠（欠席のみ進めない） */
const ATTENDANCE_ADVANCES_NEXT_TEXT: ReadonlySet<AttendanceStatus> = new Set([
  "present",
  "late",
  "makeup",
]);

/**
 * 授業を記録済みにした 1 回につき、その科目の次回テキストをカリキュラム順で 1 つ進める。
 * 欠席のみ進めず次回テキストはそのまま。出席・遅刻・振替（振替枠で受講した場合）では進める。
 * 末尾・未設定・値が不正なときは更新しない。
 */
export async function advanceStudentNextTextAfterLessonRecorded(
  supabase: SupabaseClient,
  studentId: string,
  subject: string | null,
  attendance: AttendanceStatus | null
): Promise<void> {
  if (attendance == null || !ATTENDANCE_ADVANCES_NEXT_TEXT.has(attendance)) return;
  if (subject !== "ロボット" && subject !== "プログラミング") return;

  const { data: student } = await supabase
    .from("students")
    .select(
      "next_text_robot, next_text_robot_course, next_text_robot_text, next_text_programming, next_text_programming_course, next_text_programming_text"
    )
    .eq("id", studentId)
    .maybeSingle<StudentNextRow>();

  if (!student) return;

  if (subject === "ロボット") {
    const resolved = resolveRobotNextTextPartsForStudent(student);
    const current = resolved?.full ?? null;
    const next = advanceRobotNextTextCombined(current);
    if (next == null || next === current) return;
    await supabase
      .from("students")
      .update(robotNextTextStudentColumnsFromCombined(next))
      .eq("id", studentId);
    return;
  }

  const resolved = resolveProgrammingNextTextPartsForStudent(student);
  const current = resolved?.full ?? null;
  const next = advanceProgrammingNextTextCombined(current);
  if (next == null || next === current) return;
  await supabase
    .from("students")
    .update(programmingNextTextStudentColumnsFromCombined(next))
    .eq("id", studentId);
}
