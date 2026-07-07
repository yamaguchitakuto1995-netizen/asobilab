import { GRADE_LEVELS, type GradeLevel } from "@/lib/types";

/** 指定日が属する学年の開始月（4月）。例: 2026-07 → 2026-04 */
export function schoolYearStartYm(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const year = m >= 4 ? y : y - 1;
  return `${year}-04`;
}

/** 自動学年更新を開始する学年（YYYY-MM、4月）。これより前は昇級しない */
export const GRADE_PROMOTION_MIN_YM = "2027-04";

/** 新規生徒・巻き戻し後の「更新済み」マーク（2027年4月まで昇級しない） */
export const GRADE_PROMOTION_DEFERRED_THROUGH_YM = "2026-04";

const NON_DEMOTABLE = new Set<GradeLevel>(["年少", "その他"]);

export function prevGradeLevel(current: GradeLevel): GradeLevel | null {
  if (NON_DEMOTABLE.has(current)) return null;
  const idx = GRADE_LEVELS.indexOf(current);
  if (idx <= 0) return null;
  return GRADE_LEVELS[idx - 1] ?? null;
}

const NON_PROMOTABLE = new Set<GradeLevel>(["高3", "浪人", "その他"]);

export function nextGradeLevel(current: GradeLevel): GradeLevel | null {
  if (NON_PROMOTABLE.has(current)) return null;
  const idx = GRADE_LEVELS.indexOf(current);
  if (idx < 0 || idx >= GRADE_LEVELS.length - 1) return null;
  const next = GRADE_LEVELS[idx + 1];
  if (NON_PROMOTABLE.has(next)) return null;
  return next;
}
