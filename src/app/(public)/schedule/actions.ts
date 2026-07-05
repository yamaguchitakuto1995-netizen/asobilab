"use server";

import { shiftDate, todayIso } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import {
  readBirthdayFromInput,
  readPortalIdFromInput,
} from "@/lib/studentPortal";
import type { AttendanceStatus } from "@/lib/types";
import {
  MAKEUP_TARGET_MAX_DAYS_AHEAD,
  studentEnrollsInSubject,
} from "@/lib/types";
import type { PortalScheduleLesson } from "@/lib/portalScheduleLessons";
import { isLessonAfterWithdrawal } from "@/lib/studentWithdrawal";
import {
  lookupStudent,
  type FoundStudent,
  type LookupResult,
} from "../apply/actions";

type PortalScheduleLessonRow = {
  id: string;
  lesson_date: string;
  period: number;
  subject: string;
  attendance: AttendanceStatus;
  lesson_classroom?: string | null;
  source_lesson_date?: string | null;
  source_period?: number | null;
  source_subject?: string | null;
};

export type { FoundStudent, LookupResult };

export type StudentScheduleResult =
  | { ok: true; lessons: PortalScheduleLesson[] }
  | { ok: false; error: string };

export async function lookupStudentForSchedule(input: {
  portalId: string;
  birthday: string;
}): Promise<LookupResult> {
  return lookupStudent(input);
}

export async function listStudentScheduleForPortal(input: {
  studentId: string;
  portalId: string;
  birthday: string;
  subjects?: string[];
}): Promise<StudentScheduleResult> {
  if (!input.studentId) return { ok: false, error: "生徒情報が不正です。" };
  const portalIdResult = readPortalIdFromInput(input.portalId);
  if (portalIdResult.error) return { ok: false, error: portalIdResult.error };
  const birthdayResult = readBirthdayFromInput(input.birthday);
  if (birthdayResult.error) return { ok: false, error: birthdayResult.error };

  const today = todayIso();
  const end = shiftDate(today, MAKEUP_TARGET_MAX_DAYS_AHEAD);
  const supabase = await createClient();

  const { data: studentRow, error: studentErr } = await supabase
    .from("students")
    .select("withdrawal_until_ym")
    .eq("id", input.studentId)
    .maybeSingle<{ withdrawal_until_ym: string | null }>();

  if (studentErr) return { ok: false, error: studentErr.message };

  const { data, error } = await supabase.rpc("list_student_schedule_for_portal", {
    p_student_id: input.studentId,
    p_portal_id: portalIdResult.value,
    p_birthday: birthdayResult.value,
    p_from_date: today,
    p_to_date: end,
  });

  if (error) return { ok: false, error: error.message };

  let lessons: PortalScheduleLesson[] = (
    (data ?? []) as PortalScheduleLessonRow[]
  ).map((row) => ({
    id: String(row.id),
    lesson_date: String(row.lesson_date).slice(0, 10),
    period: Number(row.period),
    subject: row.subject,
    attendance: row.attendance,
    lesson_classroom: row.lesson_classroom ?? null,
    source_lesson_date: row.source_lesson_date
      ? String(row.source_lesson_date).slice(0, 10)
      : null,
    source_period:
      row.source_period != null ? Number(row.source_period) : null,
    source_subject: row.source_subject ?? null,
  }));

  if (input.subjects?.length) {
    lessons = lessons.filter((l) =>
      studentEnrollsInSubject(input.subjects!, l.subject)
    );
  }

  const withdrawalYm = studentRow?.withdrawal_until_ym ?? null;
  if (withdrawalYm) {
    lessons = lessons.filter(
      (l) => !isLessonAfterWithdrawal(l.lesson_date, withdrawalYm)
    );
  }

  return { ok: true, lessons };
}
