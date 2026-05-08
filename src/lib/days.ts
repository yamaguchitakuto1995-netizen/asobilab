/** 曜日マスタ。0=日曜 〜 6=土曜 (PostgreSQL extract(dow) と一致) */
export const DAYS_OF_WEEK = [
  { value: 0, short: "日", long: "日曜日", color: "text-rose-600" },
  { value: 1, short: "月", long: "月曜日", color: "text-slate-700" },
  { value: 2, short: "火", long: "火曜日", color: "text-slate-700" },
  { value: 3, short: "水", long: "水曜日", color: "text-slate-700" },
  { value: 4, short: "木", long: "木曜日", color: "text-slate-700" },
  { value: 5, short: "金", long: "金曜日", color: "text-slate-700" },
  { value: 6, short: "土", long: "土曜日", color: "text-blue-600" },
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number]["value"];

export function dayLabel(d: number, kind: "short" | "long" = "short"): string {
  const found = DAYS_OF_WEEK.find((x) => x.value === d);
  if (!found) return "?";
  return kind === "short" ? found.short : found.long;
}

export function dayColor(d: number): string {
  return DAYS_OF_WEEK.find((x) => x.value === d)?.color ?? "text-slate-700";
}

/** 日付文字列 (YYYY-MM-DD) から曜日番号を返す */
export function dowOf(d: string): number {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).getDay();
}
