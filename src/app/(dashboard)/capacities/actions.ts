"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fetchClassrooms, isKnownClassroom } from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";
import {
  COURSE_SUBJECTS,
  MAX_PERIOD,
  classroomSubjects,
  type ClassroomRecord,
  type CourseSubject,
} from "@/lib/types";

const BASE = "/capacities";

function fail(error: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(error)}`);
}

type ParsedCapacity = {
  classroom: string;
  day_of_week: number;
  week_ordinals: number[];
  period: number;
  subject: string;
  max_students: number;
  note: string | null;
};

type ReadResult =
  | { ok: true; value: ParsedCapacity }
  | { ok: false; error: string };

function readForm(
  formData: FormData,
  classrooms: readonly ClassroomRecord[]
): ReadResult {
  const classroom = String(formData.get("classroom") ?? "").trim();
  const dayOfWeek = Number(formData.get("day_of_week"));
  const period = Number(formData.get("period"));
  const subject = String(formData.get("subject") ?? "").trim();
  const maxStudentsRaw = formData.get("max_students");
  const maxStudents =
    maxStudentsRaw === null || String(maxStudentsRaw).trim() === ""
      ? 4
      : Number(maxStudentsRaw);
  const note = String(formData.get("note") ?? "").trim();
  const ordRaw = formData.getAll("week_ordinals");
  const week_ordinals = [
    ...new Set(
      ordRaw
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5)
    ),
  ].sort((a, b) => a - b);

  if (!isKnownClassroom(classroom, classrooms)) {
    return { ok: false, error: "教室の選択が不正です。" };
  }
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { ok: false, error: "曜日が不正です。" };
  }
  if (!Number.isInteger(period) || period < 1 || period > MAX_PERIOD) {
    return { ok: false, error: `コマは 1〜${MAX_PERIOD} で指定してください。` };
  }
  if (!(COURSE_SUBJECTS as readonly string[]).includes(subject)) {
    return { ok: false, error: "教科が不正です。" };
  }
  if (
    !classroomSubjects(classroom, classrooms).includes(subject as CourseSubject)
  ) {
    return {
      ok: false,
      error: `${classroom} では「${subject}」を開講していません。`,
    };
  }
  if (!Number.isInteger(maxStudents) || maxStudents < 0 || maxStudents > 99) {
    return { ok: false, error: "最大受け入れ人数は 0〜99 で指定してください。" };
  }
  if (week_ordinals.length === 0) {
    return {
      ok: false,
      error: "開催週を 1 つ以上選んでください（例: 第2・第4週）。",
    };
  }

  return {
    ok: true,
    value: {
      classroom,
      day_of_week: dayOfWeek,
      week_ordinals,
      period,
      subject,
      max_students: maxStudents,
      note: note || null,
    },
  };
}

export async function createCapacity(formData: FormData) {
  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);
  const parsed = readForm(formData, classrooms);
  if (!parsed.ok) fail(parsed.error);

  const { error } = await supabase
    .from("lesson_capacities")
    .insert(parsed.value);

  if (error) {
    if (error.code === "23505") {
      fail("この (教室・曜日・コマ・教科) の枠はすでに設定済みです。");
    }
    fail(error.message);
  }

  revalidatePath(BASE);
  redirect(BASE);
}

export async function updateCapacity(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(BASE);

  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);
  const parsed = readForm(formData, classrooms);
  if (!parsed.ok) fail(parsed.error);

  const { error } = await supabase
    .from("lesson_capacities")
    .update(parsed.value)
    .eq("id", id);

  if (error) fail(error.message);

  revalidatePath(BASE);
  redirect(BASE);
}

export async function deleteCapacity(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(BASE);

  const supabase = await createClient();
  const { error } = await supabase
    .from("lesson_capacities")
    .delete()
    .eq("id", id);

  if (error) fail(error.message);

  revalidatePath(BASE);
  redirect(BASE);
}
