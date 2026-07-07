"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/requireRole";
import { fetchClassrooms, isKnownClassroom } from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";
import { advanceStudentNextTextAfterLessonRecorded } from "@/lib/advanceNextTextOnLessonRecorded";
import {
  ATTENDANCE_OPTIONS,
  COURSE_SUBJECTS,
  LESSON_STATUS_OPTIONS,
  MAX_PERIOD,
  type AttendanceStatus,
  type ClassroomRecord,
  type CourseSubject,
  type LessonStatus,
} from "@/lib/types";

const ATTENDANCE_VALUES = ATTENDANCE_OPTIONS.map((o) => o.value) as readonly AttendanceStatus[];
const STATUS_VALUES = LESSON_STATUS_OPTIONS.map((o) => o.value) as readonly LessonStatus[];

function readLessonClassroom(
  formData: FormData,
  classrooms: readonly ClassroomRecord[]
): {
  value: string | null;
  error?: string;
} {
  const raw = String(formData.get("lesson_classroom") ?? "").trim();
  if (!raw) return { value: null };
  if (!isKnownClassroom(raw, classrooms)) {
    return { value: null, error: "実施会場の選択が不正です。" };
  }
  return { value: raw };
}

function readPeriod(raw: string): { value: number | null; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null };
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PERIOD) {
    return { value: null, error: `コマは 1〜${MAX_PERIOD} の整数で指定してください。` };
  }
  return { value: n };
}

export async function updateLesson(formData: FormData) {
  const auth = await requireAdminUser();
  if (!auth.ok) {
    redirect(`/students?error=${encodeURIComponent(auth.error)}`);
  }

  const studentId = String(formData.get("student_id") ?? "");
  const lessonId = String(formData.get("lesson_id") ?? "");
  const lessonDate = String(formData.get("lesson_date") ?? "");
  const attendance = String(formData.get("attendance") ?? "");
  const subjectRaw = String(formData.get("subject") ?? "").trim();
  const textbookRaw = String(formData.get("textbook") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "recorded");
  const textMemo = String(formData.get("text_memo") ?? "").trim();
  const periodResult = readPeriod(String(formData.get("period") ?? ""));

  const editPath = `/students/${studentId}/lessons/${lessonId}/edit`;

  if (!studentId || !lessonId) redirect("/students");

  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);
  const lessonVenue = readLessonClassroom(formData, classrooms);

  if (!lessonDate) {
    redirect(`${editPath}?error=${encodeURIComponent("授業日を選択してください。")}`);
  }
  if (periodResult.error) {
    redirect(`${editPath}?error=${encodeURIComponent(periodResult.error)}`);
  }
  if (lessonVenue.error) {
    redirect(`${editPath}?error=${encodeURIComponent(lessonVenue.error)}`);
  }
  if (!ATTENDANCE_VALUES.includes(attendance as AttendanceStatus)) {
    redirect(`${editPath}?error=${encodeURIComponent("出欠を選択してください。")}`);
  }
  if (!STATUS_VALUES.includes(statusRaw as LessonStatus)) {
    redirect(`${editPath}?error=${encodeURIComponent("種別が不正です。")}`);
  }
  const status = statusRaw as LessonStatus;
  if (status === "scheduled" && attendance === "late") {
    redirect(`${editPath}?error=${encodeURIComponent("予定では遅刻を選択できません。")}`);
  }

  let subject: CourseSubject | null = null;
  if (subjectRaw) {
    if (!(COURSE_SUBJECTS as readonly string[]).includes(subjectRaw)) {
      redirect(`${editPath}?error=${encodeURIComponent("科目が不正です。")}`);
    }
    subject = subjectRaw as CourseSubject;
  }

  const { data: before } = await supabase
    .from("lessons")
    .select("status, lesson_date")
    .eq("id", lessonId)
    .maybeSingle();

  const { error } = await supabase
    .from("lessons")
    .update({
      lesson_date: lessonDate,
      period: periodResult.value,
      attendance: attendance as AttendanceStatus,
      subject,
      textbook: textbookRaw || null,
      status,
      text_memo: textMemo || null,
      lesson_classroom: lessonVenue.value,
    })
    .eq("id", lessonId);

  if (error) {
    redirect(`${editPath}?error=${encodeURIComponent(error.message)}`);
  }

  if (before?.status === "scheduled" && status === "recorded") {
    await advanceStudentNextTextAfterLessonRecorded(
      supabase,
      studentId,
      subject,
      attendance as AttendanceStatus,
      before.lesson_date ?? lessonDate
    );
  }

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/");
  redirect(`/students/${studentId}`);
}

export async function deleteLesson(formData: FormData) {
  const auth = await requireAdminUser();
  if (!auth.ok) {
    redirect(`/students?error=${encodeURIComponent(auth.error)}`);
  }

  const studentId = String(formData.get("student_id") ?? "");
  const lessonId = String(formData.get("lesson_id") ?? "");

  if (!studentId || !lessonId) redirect("/students");

  const supabase = await createClient();
  const { error } = await supabase.from("lessons").delete().eq("id", lessonId);

  if (error) {
    redirect(
      `/students/${studentId}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/");
  redirect(`/students/${studentId}`);
}

/**
 * 予定 (scheduled) を 記録済み (recorded) に切り替える簡易アクション。
 * 生徒詳細ページの「予定→記録に変換」ボタンから使う。
 */
export async function markLessonRecorded(formData: FormData) {
  const auth = await requireAdminUser();
  if (!auth.ok) {
    redirect(`/students?error=${encodeURIComponent(auth.error)}`);
  }

  const studentId = String(formData.get("student_id") ?? "");
  const lessonId = String(formData.get("lesson_id") ?? "");

  if (!studentId || !lessonId) redirect("/students");

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("lessons")
    .update({ status: "recorded" })
    .eq("id", lessonId)
    .eq("student_id", studentId)
    .eq("status", "scheduled")
    .select("student_id, subject, attendance, lesson_date")
    .maybeSingle();

  if (error) {
    redirect(
      `/students/${studentId}?error=${encodeURIComponent(error.message)}`
    );
  }
  if (!updated) {
    redirect(
      `/students/${studentId}?error=${encodeURIComponent(
        "予定が見つからないか、すでに記録済みです。"
      )}`
    );
  }

  await advanceStudentNextTextAfterLessonRecorded(
    supabase,
    updated.student_id,
    updated.subject,
    updated.attendance,
    updated.lesson_date
  );

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/");
  redirect(`/students/${studentId}`);
}
