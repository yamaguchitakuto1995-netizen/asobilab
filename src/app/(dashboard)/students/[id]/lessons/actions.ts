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

async function hasMakeupBookedForSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  lessonDate: string,
  period: number,
  subject: string
): Promise<boolean> {
  const { data } = await supabase
    .from("lessons")
    .select("id")
    .eq("student_id", studentId)
    .eq("status", "scheduled")
    .eq("attendance", "makeup")
    .eq("source_lesson_date", lessonDate)
    .eq("source_period", period)
    .eq("source_subject", subject)
    .maybeSingle();
  return data != null;
}

function revalidateMakeupPaths(studentId: string) {
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/");
  revalidatePath("/apply");
  revalidatePath("/schedule");
  revalidatePath("/parent");
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

/**
 * 記録済みの欠席などを「欠席（振替可能）」(scheduled + absent) に変換する。
 */
export async function markLessonMakeupEligibleAbsent(formData: FormData) {
  const auth = await requireAdminUser();
  if (!auth.ok) {
    redirect(`/students?error=${encodeURIComponent(auth.error)}`);
  }

  const studentId = String(formData.get("student_id") ?? "");
  const lessonId = String(formData.get("lesson_id") ?? "");
  if (!studentId || !lessonId) redirect("/students");

  const supabase = await createClient();
  const { data: lesson, error: fetchError } = await supabase
    .from("lessons")
    .select(
      "id, student_id, lesson_date, period, subject, attendance, status, source_lesson_date, source_period, source_subject"
    )
    .eq("id", lessonId)
    .eq("student_id", studentId)
    .maybeSingle();

  const redirectBase = `/students/${studentId}`;

  if (fetchError) {
    redirect(`${redirectBase}?error=${encodeURIComponent(fetchError.message)}`);
  }
  if (!lesson) {
    redirect(`${redirectBase}?error=${encodeURIComponent("授業が見つかりません。")}`);
  }

  if (lesson.status === "scheduled" && lesson.attendance === "absent") {
    redirect(
      `${redirectBase}?info=${encodeURIComponent("すでに欠席（振替可能）として登録されています。")}`
    );
  }

  if (lesson.period == null || !lesson.subject) {
    redirect(
      `${redirectBase}?error=${encodeURIComponent("コマと科目を設定してから、欠席（振替可能）にできます。授業の編集画面で設定してください。")}`
    );
  }

  if (
    await hasMakeupBookedForSource(
      supabase,
      studentId,
      lesson.source_lesson_date ?? lesson.lesson_date,
      lesson.source_period ?? lesson.period,
      lesson.source_subject ?? lesson.subject
    )
  ) {
    redirect(
      `${redirectBase}?error=${encodeURIComponent("この欠席にはすでに振替が登録されているため、変更できません。")}`
    );
  }

  const { data: conflicting } = await supabase
    .from("lessons")
    .select("id")
    .eq("student_id", studentId)
    .eq("lesson_date", lesson.lesson_date)
    .eq("period", lesson.period)
    .eq("subject", lesson.subject)
    .eq("status", "scheduled")
    .neq("id", lessonId)
    .maybeSingle();

  if (conflicting) {
    redirect(
      `${redirectBase}?error=${encodeURIComponent("同じコマに別の予定がすでに存在します。重複を解消してから再度お試しください。")}`
    );
  }

  const { error } = await supabase
    .from("lessons")
    .update({
      status: "scheduled",
      attendance: "absent",
      source_lesson_date: null,
      source_period: null,
      source_subject: null,
    })
    .eq("id", lessonId)
    .eq("student_id", studentId);

  if (error) {
    redirect(`${redirectBase}?error=${encodeURIComponent(error.message)}`);
  }

  revalidateMakeupPaths(studentId);
  redirect(`${redirectBase}?info=${encodeURIComponent("欠席（振替可能）として登録しました。")}`);
}

/**
 * 授業コマ未登録の過去日付に「欠席（振替可能）」を新規作成する（導入前の振替分の手動登録用）。
 */
export async function registerMakeupEligibleAbsent(formData: FormData) {
  const auth = await requireAdminUser();
  if (!auth.ok) {
    redirect(`/students?error=${encodeURIComponent(auth.error)}`);
  }

  const studentId = String(formData.get("student_id") ?? "");
  const lessonDate = String(formData.get("lesson_date") ?? "");
  const subjectRaw = String(formData.get("subject") ?? "").trim();
  const textMemo = String(formData.get("text_memo") ?? "").trim();
  const periodResult = readPeriod(String(formData.get("period") ?? ""));

  const formPath = `/students/${studentId}/lessons/backfill-absent`;

  if (!studentId) redirect("/students");

  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);
  const lessonVenue = readLessonClassroom(formData, classrooms);

  if (!lessonDate) {
    redirect(`${formPath}?error=${encodeURIComponent("授業日を選択してください。")}`);
  }
  if (periodResult.value == null) {
    redirect(`${formPath}?error=${encodeURIComponent("コマを選択してください。")}`);
  }
  if (periodResult.error) {
    redirect(`${formPath}?error=${encodeURIComponent(periodResult.error)}`);
  }
  if (lessonVenue.error) {
    redirect(`${formPath}?error=${encodeURIComponent(lessonVenue.error)}`);
  }
  if (!subjectRaw) {
    redirect(`${formPath}?error=${encodeURIComponent("科目を選択してください。")}`);
  }
  if (!(COURSE_SUBJECTS as readonly string[]).includes(subjectRaw)) {
    redirect(`${formPath}?error=${encodeURIComponent("科目が不正です。")}`);
  }
  const subject = subjectRaw as CourseSubject;

  const today = new Date().toISOString().slice(0, 10);
  if (lessonDate >= today) {
    redirect(
      `${formPath}?error=${encodeURIComponent("過去の日付のみ登録できます。当日以降は「予定を追加」または欠席・振替登録をご利用ください。")}`
    );
  }

  const { data: existingScheduled } = await supabase
    .from("lessons")
    .select("id, attendance")
    .eq("student_id", studentId)
    .eq("lesson_date", lessonDate)
    .eq("period", periodResult.value)
    .eq("subject", subject)
    .eq("status", "scheduled")
    .maybeSingle();

  if (existingScheduled) {
    if (existingScheduled.attendance === "absent") {
      redirect(
        `/students/${studentId}?info=${encodeURIComponent("すでに欠席（振替可能）として登録されています。")}`
      );
    }
    redirect(
      `${formPath}?error=${encodeURIComponent("同じコマに別の予定がすでに存在します。")}`
    );
  }

  const { data: existingRecorded } = await supabase
    .from("lessons")
    .select("id")
    .eq("student_id", studentId)
    .eq("lesson_date", lessonDate)
    .eq("period", periodResult.value)
    .eq("subject", subject)
    .eq("status", "recorded")
    .maybeSingle();

  if (existingRecorded) {
    const fd = new FormData();
    fd.set("student_id", studentId);
    fd.set("lesson_id", existingRecorded.id);
    await markLessonMakeupEligibleAbsent(fd);
    return;
  }

  if (
    await hasMakeupBookedForSource(
      supabase,
      studentId,
      lessonDate,
      periodResult.value,
      subject
    )
  ) {
    redirect(
      `${formPath}?error=${encodeURIComponent("この欠席にはすでに振替が登録されています。")}`
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("lessons").insert({
    student_id: studentId,
    teacher_id: user.id,
    lesson_date: lessonDate,
    period: periodResult.value,
    attendance: "absent" as AttendanceStatus,
    subject,
    status: "scheduled" as LessonStatus,
    text_memo: textMemo || "管理者による振替可能欠席の手動登録",
    lesson_classroom: lessonVenue.value,
    registered_via_detail: true,
  });

  if (error) {
    redirect(`${formPath}?error=${encodeURIComponent(error.message)}`);
  }

  revalidateMakeupPaths(studentId);
  redirect(
    `/students/${studentId}?info=${encodeURIComponent("欠席（振替可能）として登録しました。")}`
  );
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
