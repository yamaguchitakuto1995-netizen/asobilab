"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isValidDate, parseLessonDateFromPaste } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import {
  CLASSROOM_NAMES,
  COURSE_SUBJECTS,
  MAX_PERIOD,
  classroomSubjects,
  type CourseSubject,
} from "@/lib/types";

const BASE = "/capacities/period-times";

/** 貼り付け由来のゼロ幅・NBSP・全角スペースを除去 */
function normalizePasteCell(s: string): string {
  return s
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\u3000/g, " ")
    .trim();
}

function splitTableRow(line: string): string[] {
  const parts = (() => {
    if (line.includes("\t")) return line.split(/\t/);
    const commas = (line.match(/,/g) ?? []).length;
    const semis = (line.match(/;/g) ?? []).length;
    if (semis > commas) return line.split(";");
    return line.split(",");
  })();
  return parts.map(normalizePasteCell);
}

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

/** 管理者向け: CSV 一括取り込み（ヘッダー1行必須） */
export async function importPeriodTimesCsv(formData: FormData) {
  const u = await getCurrentUser();
  if (!u?.isAdmin) redirect("/capacities");

  const raw = String(formData.get("csv") ?? "")
    .replace(/^\uFEFF/, "")
    .trim();
  if (!raw) fail("CSV を貼り付けてください。");

  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) fail("ヘッダー行とデータ行が必要です。");

  const header = splitTableRow(lines[0]).map((s) => s.toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const iClass = idx("classroom");
  const iDate = idx("lesson_date");
  const iPeriod = idx("period");
  const iSub = idx("subject");
  const iStart = idx("start_time");
  const iEnd = idx("end_time");
  const iNote = idx("note");

  if (
    iClass < 0 ||
    iDate < 0 ||
    iPeriod < 0 ||
    iStart < 0 ||
    iEnd < 0
  ) {
    fail(
      "必須列: classroom, lesson_date, period, start_time, end_time（日付は YYYY-MM-DD または Excel の 2026/5/10 形式）"
    );
  }

  const rows: Parsed[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitTableRow(lines[r]);
    const classroom = normalizePasteCell(cells[iClass] ?? "");
    const lesson_date = parseLessonDateFromPaste(cells[iDate] ?? "");
    const period = Number(cells[iPeriod]);
    const subjectCell = iSub >= 0 ? (cells[iSub] ?? "").trim() : "";
    const subject =
      !subjectCell ||
      subjectCell === "-" ||
      subjectCell.toLowerCase() === "null"
        ? null
        : subjectCell;
    let start_time = (cells[iStart] ?? "").trim();
    let end_time = (cells[iEnd] ?? "").trim();
    const note = iNote >= 0 ? (cells[iNote] ?? "").trim() || null : null;

    if (!(CLASSROOM_NAMES as readonly string[]).includes(classroom)) continue;
    if (!lesson_date) continue;
    if (!Number.isInteger(period) || period < 1 || period > MAX_PERIOD)
      continue;

    if (subject && !(COURSE_SUBJECTS as readonly string[]).includes(subject))
      continue;
    if (
      subject &&
      !classroomSubjects(classroom).includes(subject as CourseSubject)
    )
      continue;

    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(start_time)) {
      start_time =
        start_time.length === 5 ? `${start_time}:00` : start_time.slice(0, 8);
    } else continue;
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(end_time)) {
      end_time =
        end_time.length === 5 ? `${end_time}:00` : end_time.slice(0, 8);
    } else continue;

    if (start_time >= end_time) continue;

    rows.push({
      classroom,
      lesson_date,
      period,
      subject,
      start_time,
      end_time,
      note,
    });
  }

  if (rows.length === 0) {
    fail("取り込める有効な行がありませんでした。列名・値を確認してください。");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("classroom_period_times").insert(rows);

  if (error) {
    if (error.code === "23505") {
      fail(
        "一部の行が既存データと重複しています。重複を除いて再実行してください。"
      );
    }
    fail(error.message);
  }

  revalidatePath(BASE);
  revalidatePath("/capacities");
  redirect(`${BASE}?imported=${encodeURIComponent(String(rows.length))}`);
}
