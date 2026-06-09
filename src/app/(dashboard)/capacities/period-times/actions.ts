"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isValidDate } from "@/lib/date";
import {
  buildPeriodTimeImportPlan,
  formatCsvDuplicateMessage,
  formatOverwriteMessage,
  parsePeriodTimesCsv,
  periodTimeNaturalKey,
  periodTimeSlotLabelFromRow,
} from "@/lib/periodTimeCsvImport";
import { formatTimeRange } from "@/lib/periodTimes";
import { createClient } from "@/lib/supabase/server";
import {
  CLASSROOM_NAMES,
  COURSE_SUBJECTS,
  MAX_PERIOD,
  classroomSubjects,
  type ClassroomPeriodTime,
  type CourseSubject,
} from "@/lib/types";

const BASE = "/capacities/period-times";

function fail(msg: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(msg)}`);
}

type Parsed = {
  classroom: string;
  lesson_date: string;
  period: number;
  subject: string | null;
  start_time: string;
  end_time: string;
  note: string | null;
};

function readSubject(formData: FormData): string | null {
  const raw = String(formData.get("subject") ?? "").trim();
  if (!raw || raw === "__common__") return null;
  return raw;
}

function readParsed(
  formData: FormData
): { ok: true; value: Parsed } | { ok: false; error: string } {
  const classroom = String(formData.get("classroom") ?? "").trim();
  const lesson_date = String(formData.get("lesson_date") ?? "").trim();
  const period = Number(formData.get("period"));
  const subject = readSubject(formData);
  const start_time = String(formData.get("start_time") ?? "").trim();
  const end_time = String(formData.get("end_time") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!(CLASSROOM_NAMES as readonly string[]).includes(classroom)) {
    return { ok: false, error: "教室の選択が不正です。" };
  }
  if (!isValidDate(lesson_date)) {
    return { ok: false, error: "開催日を正しく選択してください。" };
  }
  if (!Number.isInteger(period) || period < 1 || period > MAX_PERIOD) {
    return { ok: false, error: `コマは 1〜${MAX_PERIOD} で指定してください。` };
  }
  if (subject && !(COURSE_SUBJECTS as readonly string[]).includes(subject)) {
    return { ok: false, error: "教科が不正です。" };
  }
  if (
    subject &&
    !classroomSubjects(classroom).includes(subject as CourseSubject)
  ) {
    return {
      ok: false,
      error: `${classroom} では「${subject}」を開講していません。`,
    };
  }
  if (!/^\d{2}:\d{2}$/.test(start_time) || !/^\d{2}:\d{2}$/.test(end_time)) {
    return {
      ok: false,
      error: "開始・終了時刻は HH:mm 形式で入力してください。",
    };
  }
  if (start_time >= end_time) {
    return { ok: false, error: "終了時刻は開始時刻より後にしてください。" };
  }

  return {
    ok: true,
    value: {
      classroom,
      lesson_date,
      period,
      subject,
      start_time: `${start_time}:00`,
      end_time: `${end_time}:00`,
      note: note || null,
    },
  };
}

export async function createPeriodTime(formData: FormData) {
  const u = await getCurrentUser();
  if (!u?.isAdmin) redirect("/capacities");

  const parsed = readParsed(formData);
  if (!parsed.ok) fail(parsed.error);

  const supabase = await createClient();
  const key = periodTimeNaturalKey(parsed.value);
  const { data: existingRows } = await supabase
    .from("classroom_period_times")
    .select("*");

  const existing = (existingRows ?? []).find(
    (r) => periodTimeNaturalKey(r as ClassroomPeriodTime) === key
  ) as ClassroomPeriodTime | undefined;

  if (existing) {
    const { error } = await supabase
      .from("classroom_period_times")
      .update(parsed.value)
      .eq("id", existing.id);

    if (error) fail(error.message);

    revalidatePath(BASE);
    revalidatePath("/capacities");
    const label = periodTimeSlotLabelFromRow(parsed.value);
    const before = formatTimeRange(existing.start_time, existing.end_time);
    const after = formatTimeRange(parsed.value.start_time, parsed.value.end_time);
    redirect(
      `${BASE}?updated=1&overwrites=${encodeURIComponent(`${label}: ${before} → ${after}`)}`
    );
  }

  const { error } = await supabase
    .from("classroom_period_times")
    .insert(parsed.value);

  if (error) {
    if (error.code === "23505") {
      fail("同じ教室・開催日・コマ（・教科）の組み合わせがすでにあります。");
    }
    fail(error.message);
  }

  revalidatePath(BASE);
  revalidatePath("/capacities");
  redirect(BASE);
}

export async function updatePeriodTime(formData: FormData) {
  const u = await getCurrentUser();
  if (!u?.isAdmin) redirect("/capacities");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect(BASE);

  const parsed = readParsed(formData);
  if (!parsed.ok) fail(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("classroom_period_times")
    .update(parsed.value)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      fail("同じ教室・開催日・コマ（・教科）の組み合わせがすでにあります。");
    }
    fail(error.message);
  }

  revalidatePath(BASE);
  revalidatePath("/capacities");
  redirect(BASE);
}

export async function deletePeriodTime(formData: FormData) {
  const u = await getCurrentUser();
  if (!u?.isAdmin) redirect("/capacities");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect(BASE);

  const supabase = await createClient();
  const { error } = await supabase
    .from("classroom_period_times")
    .delete()
    .eq("id", id);

  if (error) fail(error.message);

  revalidatePath(BASE);
  revalidatePath("/capacities");
  redirect(BASE);
}

/** 管理者向け: CSV 一括取り込み（ヘッダー1行必須。既存キーは上書き） */
export async function importPeriodTimesCsv(formData: FormData) {
  const u = await getCurrentUser();
  if (!u?.isAdmin) redirect("/capacities");

  const raw = String(formData.get("csv") ?? "");
  const parsedResult = parsePeriodTimesCsv(raw);
  if (!parsedResult.ok) fail(parsedResult.error);

  const supabase = await createClient();
  const { data: existingRows } = await supabase
    .from("classroom_period_times")
    .select("*");

  const plan = buildPeriodTimeImportPlan(
    parsedResult.parsed,
    (existingRows ?? []) as ClassroomPeriodTime[]
  );

  for (const { id, row } of plan.toUpdate) {
    const { error } = await supabase
      .from("classroom_period_times")
      .update({
        classroom: row.classroom,
        lesson_date: row.lesson_date,
        period: row.period,
        subject: row.subject,
        start_time: row.start_time,
        end_time: row.end_time,
        note: row.note,
      })
      .eq("id", id);

    if (error) fail(`上書きに失敗しました（${row.classroom}・${row.lesson_date}）: ${error.message}`);
  }

  if (plan.toInsert.length > 0) {
    const { error } = await supabase
      .from("classroom_period_times")
      .insert(plan.toInsert);

    if (error) {
      if (error.code === "23505") {
        fail(
          "登録時に重複が発生しました。一覧を更新してから再度お試しください。"
        );
      }
      fail(error.message);
    }
  }

  revalidatePath(BASE);
  revalidatePath("/capacities");

  const params = new URLSearchParams();
  if (plan.toInsert.length > 0) {
    params.set("imported", String(plan.toInsert.length));
  }
  if (plan.toUpdate.length > 0) {
    params.set("updated", String(plan.toUpdate.length));
  }
  const csvDupes = formatCsvDuplicateMessage(plan.csvDuplicates);
  if (csvDupes) params.set("csv_dupes", csvDupes);
  const overwrites = formatOverwriteMessage(
    plan.toUpdate.map((u) => u.overwrite)
  );
  if (overwrites) params.set("overwrites", overwrites);

  const qs = params.toString();
  redirect(qs ? `${BASE}?${qs}` : BASE);
}
