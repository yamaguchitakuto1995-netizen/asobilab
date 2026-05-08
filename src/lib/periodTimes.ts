import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateLong } from "@/lib/date";
import type { ClassroomPeriodTime } from "@/lib/types";

export async function fetchClassroomPeriodTimes(
  supabase: SupabaseClient
): Promise<ClassroomPeriodTime[]> {
  const { data } = await supabase.from("classroom_period_times").select("*");
  return (data ?? []) as ClassroomPeriodTime[];
}

/** "09:00:00" → "09:00" */
export function formatClock(t: string | null | undefined): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatClock(start)}〜${formatClock(end)}`;
}

/**
 * マスタ行から、その授業の行に表示する時刻帯を1件に決める。
 * 開催日が完全一致する行のみ対象。教科一致があれば優先、なければ subject が null の共通行。
 */
export function resolveClassroomPeriodTime(
  rows: ClassroomPeriodTime[],
  opts: {
    classroom: string | null | undefined;
    lessonDate: string;
    period: number | null | undefined;
    subject: string | null | undefined;
  }
): ClassroomPeriodTime | null {
  const { classroom, lessonDate, period, subject } = opts;
  if (!classroom || !period) return null;

  const subj = subject?.trim() ? subject.trim() : null;

  const candidates = rows.filter(
    (r) =>
      r.classroom === classroom &&
      r.lesson_date === lessonDate &&
      r.period === period
  );

  if (candidates.length === 0) return null;
  if (subj) {
    const exact = candidates.find((c) => c.subject === subj);
    if (exact) return exact;
  }
  const common = candidates.find((c) => c.subject == null);
  return common ?? candidates[0];
}

/** 一覧 UI 用 */
export function periodTimeSlotLabel(row: ClassroomPeriodTime): string {
  const parts = [
    row.classroom,
    formatDateLong(row.lesson_date),
    `${row.period}コマ目`,
  ];
  if (row.subject) parts.push(row.subject);
  return parts.join("・");
}

export function periodWithTimeLabel(
  period: number | null | undefined,
  row: ClassroomPeriodTime | null
): string {
  const base = period ? `${period}コマ目` : "コマ未設定";
  if (!row) return base;
  return `${base} (${formatTimeRange(row.start_time, row.end_time)})`;
}
