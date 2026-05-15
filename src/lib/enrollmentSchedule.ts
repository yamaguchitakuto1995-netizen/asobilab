import { shiftDate } from "@/lib/date";
import type { LessonCapacity } from "@/lib/types";

/** 生徒登録・編集時に自動作成する「出席予定」の先送り日数 */
export const ENROLLMENT_SCHEDULE_HORIZON_DAYS = 180;

/**
 * Postgres の `weekday_occurrence_in_month(date)` と同じ値。
 * その月の月初〜当該日までで、当該日と同じ曜日が何回目か（1〜5）。
 */
export function weekdayOccurrenceInMonth(isoDate: string): number {
  const [y, m, dd] = isoDate.split("-").map(Number);
  const targetDow = new Date(y, m - 1, dd).getDay();
  let count = 0;
  for (let day = 1; day <= dd; day++) {
    const cur = new Date(y, m - 1, day);
    if (cur.getMonth() !== m - 1) break;
    if (cur.getDay() === targetDow) count++;
  }
  return count;
}

/**
 * `lesson_capacities` 1 行に対し、fromDate から horizonDays 日の範囲で
 * 開催日（YYYY-MM-DD）の一覧を返す。
 */
export function lessonDatesMatchingCapacity(
  capacity: Pick<LessonCapacity, "day_of_week" | "week_ordinals">,
  fromDate: string,
  horizonDays: number
): string[] {
  const ordSet = new Set<number>(capacity.week_ordinals);
  const out: string[] = [];
  let d = fromDate;
  for (let i = 0; i < horizonDays; i++) {
    const [y, m, dd] = d.split("-").map(Number);
    const dow = new Date(y, m - 1, dd).getDay();
    if (
      dow === capacity.day_of_week &&
      ordSet.has(weekdayOccurrenceInMonth(d))
    ) {
      out.push(d);
    }
    d = shiftDate(d, 1);
  }
  return out;
}
