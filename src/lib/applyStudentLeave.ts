import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIso } from "@/lib/date";
import {
  attendanceForScheduledEnrollment,
  isLessonMonthOnLeave,
  shouldSnapNextTextAfterLeave,
  snapNextTextColumnsForSubjects,
  type StudentLeavePeriod,
} from "@/lib/studentLeave";
import type { AttendanceStatus } from "@/lib/types";

type StudentLeaveRow = StudentLeavePeriod & {
  id: string;
  subjects: string[];
  next_text_robot?: string | null;
  next_text_robot_course?: string | null;
  next_text_robot_text?: string | null;
  next_text_programming?: string | null;
  next_text_programming_course?: string | null;
  next_text_programming_text?: string | null;
};

/** 休会期間に合わせて出席予定を on_leave に更新（期間外は on_leave を present に戻す） */
export async function applyLeaveToScheduledLessons(
  supabase: SupabaseClient,
  studentId: string,
  leave: StudentLeavePeriod
): Promise<{ error: string | null }> {
  const today = todayIso();
  const { data: lessons, error } = await supabase
    .from("lessons")
    .select("id, lesson_date, attendance, status")
    .eq("student_id", studentId)
    .eq("status", "scheduled")
    .gte("lesson_date", today);

  if (error) return { error: error.message };

  for (const lesson of lessons ?? []) {
    const onLeave = isLessonMonthOnLeave(lesson.lesson_date, leave);
    const current = lesson.attendance as AttendanceStatus;

    if (onLeave && current !== "makeup" && current !== "on_leave") {
      const { error: updErr } = await supabase
        .from("lessons")
        .update({ attendance: "on_leave" })
        .eq("id", lesson.id);
      if (updErr) return { error: updErr.message };
      continue;
    }

    if (!onLeave && current === "on_leave") {
      const { error: updErr } = await supabase
        .from("lessons")
        .update({ attendance: "present" })
        .eq("id", lesson.id);
      if (updErr) return { error: updErr.message };
    }
  }

  return { error: null };
}

/** 休会明け月に次回テキストをカレンダー月の先頭単元へ合わせる */
export async function snapStudentNextTextAfterLeaveIfNeeded(
  supabase: SupabaseClient,
  student: StudentLeaveRow
): Promise<{ error: string | null }> {
  if (!shouldSnapNextTextAfterLeave(student)) return { error: null };

  const month = Number(todayIso().slice(5, 7));
  if (month < 1 || month > 12) return { error: null };

  const patch = snapNextTextColumnsForSubjects(student, month);
  if (Object.keys(patch).length === 0) return { error: null };

  const { error } = await supabase
    .from("students")
    .update(patch)
    .eq("id", student.id);

  return { error: error?.message ?? null };
}

/** 生徒保存後: 休会コマ反映 + 復帰後テキスト調整 */
export async function applyStudentLeaveEffects(
  supabase: SupabaseClient,
  student: StudentLeaveRow
): Promise<{ error: string | null }> {
  const leaveResult = await applyLeaveToScheduledLessons(supabase, student.id, {
    leave_from_ym: student.leave_from_ym,
    leave_until_ym: student.leave_until_ym,
  });
  if (leaveResult.error) return leaveResult;

  return snapStudentNextTextAfterLeaveIfNeeded(supabase, student);
}

export { attendanceForScheduledEnrollment };
