"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ATTENDANCE_OPTIONS,
  COURSE_SUBJECTS,
  LESSON_STATUS_OPTIONS,
  MAX_PERIOD,
  type AttendanceStatus,
  type CourseSubject,
  type LessonStatus,
} from "@/lib/types";

const ATTENDANCE_VALUES = ATTENDANCE_OPTIONS.map((o) => o.value) as readonly AttendanceStatus[];
const STATUS_VALUES = LESSON_STATUS_OPTIONS.map((o) => o.value) as readonly LessonStatus[];

function readPeriod(raw: string): { value: number | null; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null };
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PERIOD) {
    return { value: null, error: `コマは 1〜${MAX_PERIOD} の整数で指定してください。` };
  }
  return { value: n };
}

export async function createLesson(formData: FormData) {
  const studentId = String(formData.get("student_id") ?? "");
  const lessonDate = String(formData.get("lesson_date") ?? "");
  const attendance = String(formData.get("attendance") ?? "");
  const subjectRaw = String(formData.get("subject") ?? "").trim();
  const textbookRaw = String(formData.get("textbook") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "recorded");
  const textMemo = String(formData.get("text_memo") ?? "").trim();
  const periodResult = readPeriod(String(formData.get("period") ?? ""));

  const newPath = `/students/${studentId}/lessons/new`;

  if (!studentId) redirect("/students");
  if (!lessonDate) {
    redirect(`${newPath}?error=${encodeURIComponent("授業日を選択してください。")}`);
  }
  if (periodResult.error) {
    redirect(`${newPath}?error=${encodeURIComponent(periodResult.error)}`);
  }
  if (!ATTENDANCE_VALUES.includes(attendance as AttendanceStatus)) {
    redirect(`${newPath}?error=${encodeURIComponent("出欠を選択してください。")}`);
  }
  if (!STATUS_VALUES.includes(statusRaw as LessonStatus)) {
    redirect(`${newPath}?error=${encodeURIComponent("種別が不正です。")}`);
  }
  const status = statusRaw as LessonStatus;
  if (status === "scheduled" && attendance === "late") {
    redirect(`${newPath}?error=${encodeURIComponent("予定では遅刻を選択できません。")}`);
  }

  let subject: CourseSubject | null = null;
  if (subjectRaw) {
    if (!(COURSE_SUBJECTS as readonly string[]).includes(subjectRaw)) {
      redirect(`${newPath}?error=${encodeURIComponent("科目が不正です。")}`);
    }
    subject = subjectRaw as CourseSubject;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("lessons").insert({
    student_id: studentId,
    teacher_id: user.id,
    lesson_date: lessonDate,
    period: periodResult.value,
    attendance: attendance as AttendanceStatus,
    subject,
    textbook: textbookRaw || null,
    status,
    text_memo: textMemo || null,
  });

  if (error) {
    redirect(`${newPath}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/");
  redirect(`/students/${studentId}`);
}
