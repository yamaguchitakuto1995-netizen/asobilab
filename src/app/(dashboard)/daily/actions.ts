"use server";

import { revalidatePath } from "next/cache";
import { advanceStudentNextTextAfterLessonRecorded } from "@/lib/advanceNextTextOnLessonRecorded";
import { notifyLineAttendanceWithMemoRegistered } from "@/lib/appLineNotifications";
import { createClient } from "@/lib/supabase/server";
import {
  ATTENDANCE_OPTIONS,
  type AttendanceStatus,
} from "@/lib/types";

const ATTENDANCE_VALUES = ATTENDANCE_OPTIONS.map((o) => o.value);

export type DailyBoardSaveResult =
  | { ok: true }
  | { ok: false; error: string };

type SaveLessonInput = {
  lessonId: string;
  attendance: AttendanceStatus;
  textbook: string;
  textMemo: string;
  viaDetail: boolean;
  persistentMemo?: string;
};

async function saveLessonFromDailyBoard(
  input: SaveLessonInput
): Promise<DailyBoardSaveResult> {
  const lessonId = input.lessonId.trim();
  const textbook = input.textbook.trim();
  const textMemo = input.textMemo.trim();
  const attendance = input.attendance;

  if (!lessonId) {
    return { ok: false, error: "授業が指定されていません。" };
  }

  if (!ATTENDANCE_VALUES.includes(attendance)) {
    return { ok: false, error: "出欠を選んでください。" };
  }

  if (!textbook) {
    return { ok: false, error: "本日のテキストを入力してください。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインが必要です。" };
  }

  const { data: before } = await supabase
    .from("lessons")
    .select(
      "id, student_id, subject, status, attendance, lesson_date, period, students(name)"
    )
    .eq("id", lessonId)
    .maybeSingle<{
      id: string;
      student_id: string;
      subject: string | null;
      status: string;
      attendance: AttendanceStatus;
      lesson_date: string;
      period: number | null;
      students: { name: string } | null;
    }>();

  if (!before) {
    return { ok: false, error: "授業が見つかりません。" };
  }

  const { error } = await supabase
    .from("lessons")
    .update({
      status: "recorded",
      attendance,
      textbook,
      text_memo: textMemo || null,
      registered_via_detail: input.viaDetail,
    })
    .eq("id", lessonId);

  if (error) {
    return { ok: false, error: error.message };
  }

  if (input.viaDetail) {
    const persistentMemo = (input.persistentMemo ?? "").trim();
    const { error: memoErr } = await supabase
      .from("students")
      .update({ persistent_memo: persistentMemo || null })
      .eq("id", before.student_id);

    if (memoErr) {
      return { ok: false, error: memoErr.message };
    }
  }

  if (before.status === "scheduled") {
    await advanceStudentNextTextAfterLessonRecorded(
      supabase,
      before.student_id,
      before.subject,
      attendance,
      before.lesson_date
    );
  }

  if (input.viaDetail && textMemo) {
    notifyLineAttendanceWithMemoRegistered({
      studentName: before.students?.name ?? "（生徒名不明）",
      lessonDate: before.lesson_date,
      period: before.period ?? 0,
      subject: before.subject ?? "",
      attendance,
      textMemo,
      persistentMemo: input.persistentMemo,
    });
  }

  revalidatePath("/");
  revalidatePath(`/students/${before.student_id}`);
  return { ok: true };
}

export async function confirmLessonFromDailyBoard(
  formData: FormData
): Promise<DailyBoardSaveResult> {
  const attendance = String(formData.get("attendance") ?? "");
  if (!ATTENDANCE_VALUES.includes(attendance as AttendanceStatus)) {
    return { ok: false, error: "出欠を選んでください。" };
  }

  return saveLessonFromDailyBoard({
    lessonId: String(formData.get("lesson_id") ?? ""),
    attendance: attendance as AttendanceStatus,
    textbook: String(formData.get("textbook") ?? ""),
    textMemo: String(formData.get("text_memo") ?? ""),
    viaDetail: true,
    persistentMemo: String(formData.get("persistent_memo") ?? ""),
  });
}

/** 予定通り・備考なしのワンクリック出席登録 */
export async function quickPresentLessonFromDailyBoard(input: {
  lessonId: string;
  textbook: string;
  attendance?: AttendanceStatus;
}): Promise<DailyBoardSaveResult> {
  return saveLessonFromDailyBoard({
    lessonId: input.lessonId,
    attendance: input.attendance ?? "present",
    textbook: input.textbook,
    textMemo: "",
    viaDetail: false,
  });
}
