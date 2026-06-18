"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { advanceStudentNextTextAfterLessonRecorded } from "@/lib/advanceNextTextOnLessonRecorded";
import { isValidDate } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import {
  ATTENDANCE_OPTIONS,
  type AttendanceStatus,
} from "@/lib/types";

const ATTENDANCE_VALUES = ATTENDANCE_OPTIONS.map((o) => o.value);

export async function confirmLessonFromDailyBoard(formData: FormData) {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const returnDate = String(formData.get("return_date") ?? "");
  const attendance = String(formData.get("attendance") ?? "");
  const textbook = String(formData.get("textbook") ?? "").trim();
  const textMemo = String(formData.get("text_memo") ?? "").trim();

  const back =
    isValidDate(returnDate) ? `/?date=${returnDate}` : "/";

  if (!lessonId) redirect(back);

  if (!ATTENDANCE_VALUES.includes(attendance as AttendanceStatus)) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent("出欠を選んでください。")}`
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: before } = await supabase
    .from("lessons")
    .select("id, student_id, subject, status, attendance")
    .eq("id", lessonId)
    .maybeSingle<{
      id: string;
      student_id: string;
      subject: string | null;
      status: string;
      attendance: AttendanceStatus;
    }>();

  if (!before) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent("授業が見つかりません。")}`
    );
  }

  const { error } = await supabase
    .from("lessons")
    .update({
      status: "recorded",
      attendance: attendance as AttendanceStatus,
      textbook: textbook || null,
      text_memo: textMemo || null,
    })
    .eq("id", lessonId);

  if (error) {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`
    );
  }

  if (before.status === "scheduled") {
    await advanceStudentNextTextAfterLessonRecorded(
      supabase,
      before.student_id,
      before.subject,
      attendance as AttendanceStatus
    );
  }

  revalidatePath("/");
  revalidatePath(`/students/${before.student_id}`);
  redirect(back);
}
