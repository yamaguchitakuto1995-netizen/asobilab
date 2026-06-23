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
import {
  createScheduledLessonsForPeriodTimes,
  removeEnrollmentLessonsForPeriodTime,
  resyncAllRegularAttendance,
} from "@/lib/regularAttendanceSync";
import {
  ensureRegularSlotCapacitiesForPeriodTime,
  readRegularSlotFromForm,
  validateLessonDateMatchesRegularSlot,
} from "@/lib/ensureRegularSlotCapacities";
import { fetchClassrooms, isKnownClassroom } from "@/lib/classrooms";
import type { RegularWeekGroupId } from "@/lib/regularSlot";
import { createClient } from "@/lib/supabase/server";
import {
  COURSE_SUBJECTS,
  MAX_PERIOD,
  classroomSubjects,
  type ClassroomPeriodTime,
  type ClassroomRecord,
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
  formData: FormData,
  classrooms: readonly ClassroomRecord[]
): { ok: true; value: Parsed } | { ok: false; error: string } {
  const classroom = String(formData.get("classroom") ?? "").trim();
  const lesson_date = String(formData.get("lesson_date") ?? "").trim();
  const period = Number(formData.get("period"));
  const subject = readSubject(formData);
  const start_time = String(formData.get("start_time") ?? "").trim();
  const end_time = String(formData.get("end_time") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!isKnownClassroom(classroom, classrooms)) {
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
    !classroomSubjects(classroom, classrooms).includes(subject as CourseSubject)
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

async function applyRegularSlotForPeriodTime(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
  parsed: Parsed,
  classrooms: readonly ClassroomRecord[]
): Promise<{ capacityCreated: number; error?: string }> {
  const slot = readRegularSlotFromForm(formData, parsed.period);
  if (!slot.ok) {
    return { capacityCreated: 0, error: slot.error };
  }

  const dateErr = validateLessonDateMatchesRegularSlot(
    parsed.lesson_date,
    slot.parts
  );
  if (dateErr) {
    return { capacityCreated: 0, error: dateErr };
  }

  const subjects = parsed.subject
    ? [parsed.subject]
    : [...classroomSubjects(parsed.classroom, classrooms)];

  const ensured = await ensureRegularSlotCapacitiesForPeriodTime(supabase, {
    classroom: parsed.classroom,
    subjects,
    regularSlot: slot.parts,
    lessonDate: parsed.lesson_date,
  });
  if (ensured.error) {
    return { capacityCreated: 0, error: ensured.error };
  }
  return { capacityCreated: ensured.created };
}

async function ensureRegularSlotFromParsedRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parsed: {
    classroom: string;
    lesson_date: string;
    period: number;
    subject: string | null;
    regular_week_group: RegularWeekGroupId;
    regular_day_of_week: number;
  },
  classrooms: readonly ClassroomRecord[]
): Promise<{ capacityCreated: number; error?: string }> {
  const subjects = parsed.subject
    ? [parsed.subject]
    : [...classroomSubjects(parsed.classroom, classrooms)];

  const ensured = await ensureRegularSlotCapacitiesForPeriodTime(supabase, {
    classroom: parsed.classroom,
    subjects,
    regularSlot: {
      weekGroupId: parsed.regular_week_group,
      dayOfWeek: parsed.regular_day_of_week,
      period: parsed.period,
    },
    lessonDate: parsed.lesson_date,
  });
  if (ensured.error) {
    return { capacityCreated: 0, error: ensured.error };
  }
  return { capacityCreated: ensured.created };
}

export async function createPeriodTime(formData: FormData) {
  const u = await getCurrentUser();
  if (!u?.isAdmin) redirect("/capacities");

  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);
  const parsed = readParsed(formData, classrooms);
  if (!parsed.ok) fail(parsed.error);

  const regular = await applyRegularSlotForPeriodTime(
    supabase,
    formData,
    parsed.value,
    classrooms
  );
  if (regular.error) fail(regular.error);

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

    const sync = await createScheduledLessonsForPeriodTimes(
      supabase,
      [parsed.value],
      u.id
    );
    if (sync.error) fail(`時刻は保存しましたが出席予定の連動に失敗: ${sync.error}`);

    revalidatePath(BASE);
    revalidatePath("/capacities");
    revalidatePath("/");
    revalidatePath("/students");
    const label = periodTimeSlotLabelFromRow(parsed.value);
    const before = formatTimeRange(existing.start_time, existing.end_time);
    const after = formatTimeRange(parsed.value.start_time, parsed.value.end_time);
    const params = new URLSearchParams({
      updated: "1",
      overwrites: `${label}: ${before} → ${after}`,
    });
    if (sync.created > 0) {
      params.set("scheduled", String(sync.created));
    }
    if (regular.capacityCreated > 0) {
      params.set("capacities", String(regular.capacityCreated));
    }
    redirect(`${BASE}?${params.toString()}`);
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

  const sync = await createScheduledLessonsForPeriodTimes(
    supabase,
    [parsed.value],
    u.id
  );
  if (sync.error) fail(`時刻は登録しましたが出席予定の連動に失敗: ${sync.error}`);

  revalidatePath(BASE);
  revalidatePath("/capacities");
  revalidatePath("/");
  revalidatePath("/students");
  const params = new URLSearchParams();
  if (sync.created > 0) {
    params.set("scheduled", String(sync.created));
  }
  if (regular.capacityCreated > 0) {
    params.set("capacities", String(regular.capacityCreated));
  }
  const qs = params.toString();
  redirect(qs ? `${BASE}?${qs}` : BASE);
}

export async function updatePeriodTime(formData: FormData) {
  const u = await getCurrentUser();
  if (!u?.isAdmin) redirect("/capacities");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect(BASE);

  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);
  const parsed = readParsed(formData, classrooms);
  if (!parsed.ok) fail(parsed.error);

  const regular = await applyRegularSlotForPeriodTime(
    supabase,
    formData,
    parsed.value,
    classrooms
  );
  if (regular.error) fail(regular.error);

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

  const sync = await createScheduledLessonsForPeriodTimes(
    supabase,
    [parsed.value],
    u.id
  );
  if (sync.error) fail(`時刻は更新しましたが出席予定の連動に失敗: ${sync.error}`);

  revalidatePath(BASE);
  revalidatePath("/capacities");
  revalidatePath("/");
  revalidatePath("/students");
  const params = new URLSearchParams();
  if (sync.created > 0) {
    params.set("scheduled", String(sync.created));
  }
  if (regular.capacityCreated > 0) {
    params.set("capacities", String(regular.capacityCreated));
  }
  const qs = params.toString();
  redirect(qs ? `${BASE}?${qs}` : BASE);
}

/** 登録済みコマ時刻とレギュラー出席コマから、出席予定を一括再作成（管理者向け） */
export async function resyncScheduledLessonsFromPeriodTimes() {
  const u = await getCurrentUser();
  if (!u?.isAdmin) redirect("/capacities");

  const supabase = await createClient();
  const sync = await resyncAllRegularAttendance(supabase, u.id);
  if (sync.error) fail(sync.error);

  revalidatePath(BASE);
  revalidatePath("/capacities");
  revalidatePath("/");
  revalidatePath("/students");

  const params = new URLSearchParams({ resynced: String(sync.created) });
  redirect(`${BASE}?${params.toString()}`);
}

export async function deletePeriodTime(formData: FormData) {
  const u = await getCurrentUser();
  if (!u?.isAdmin) redirect("/capacities");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect(BASE);

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("classroom_period_times")
    .select("classroom, lesson_date, period, subject")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("classroom_period_times")
    .delete()
    .eq("id", id);

  if (error) fail(error.message);

  if (row) {
    const removed = await removeEnrollmentLessonsForPeriodTime(supabase, row);
    if (removed.error) {
      fail(`時刻は削除しましたが出席予定の削除に失敗: ${removed.error}`);
    }
  }

  revalidatePath(BASE);
  revalidatePath("/capacities");
  revalidatePath("/");
  revalidatePath("/students");
  redirect(BASE);
}

/** 管理者向け: CSV 一括取り込み（ヘッダー1行必須。既存キーは上書き） */
export async function importPeriodTimesCsv(formData: FormData) {
  const u = await getCurrentUser();
  if (!u?.isAdmin) redirect("/capacities");

  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);

  const raw = String(formData.get("csv") ?? "");
  const parsedResult = parsePeriodTimesCsv(raw, classrooms);
  if (!parsedResult.ok) fail(parsedResult.error);

  const { data: existingRows } = await supabase
    .from("classroom_period_times")
    .select("*");

  const plan = buildPeriodTimeImportPlan(
    parsedResult.parsed,
    (existingRows ?? []) as ClassroomPeriodTime[]
  );

  let capacityCreated = 0;
  for (const row of plan.rows) {
    const ensured = await ensureRegularSlotFromParsedRow(
      supabase,
      row,
      classrooms
    );
    if (ensured.error) {
      fail(`${periodTimeSlotLabelFromRow(row)}: ${ensured.error}`);
    }
    capacityCreated += ensured.capacityCreated;
  }

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
      .insert(plan.toInsert.map((item) => item.dbRow));

    if (error) {
      if (error.code === "23505") {
        fail(
          "登録時に重複が発生しました。一覧を更新してから再度お試しください。"
        );
      }
      fail(error.message);
    }
  }

  const syncSlots = [
    ...plan.toInsert.map((item) => item.dbRow),
    ...plan.toUpdate.map((u) => u.row),
  ];
  const sync = await createScheduledLessonsForPeriodTimes(
    supabase,
    syncSlots,
    u.id
  );
  if (sync.error) {
    fail(`CSV取り込みは完了しましたが出席予定の連動に失敗: ${sync.error}`);
  }

  revalidatePath(BASE);
  revalidatePath("/capacities");
  revalidatePath("/");
  revalidatePath("/students");

  const params = new URLSearchParams();
  if (plan.toInsert.length > 0) {
    params.set("imported", String(plan.toInsert.length));
  }
  if (plan.toUpdate.length > 0) {
    params.set("updated", String(plan.toUpdate.length));
  }
  if (sync.created > 0) {
    params.set("scheduled", String(sync.created));
  }
  if (capacityCreated > 0) {
    params.set("capacities", String(capacityCreated));
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
