import { dayLabel } from "@/lib/days";
import {
  formatWeekOrdinals,
  MAX_PERIOD,
  type LessonCapacity,
} from "@/lib/types";

/** レギュラー出席コマの週グループ（振替枠マスタと同じ第1・3 / 第2・4） */
export const REGULAR_WEEK_GROUPS = [
  { id: "1-3", ordinals: [1, 3], label: "第1・3週" },
  { id: "2-4", ordinals: [2, 4], label: "第2・4週" },
] as const;

export type RegularWeekGroupId = (typeof REGULAR_WEEK_GROUPS)[number]["id"];

export type RegularSlotParts = {
  weekGroupId: RegularWeekGroupId;
  dayOfWeek: number;
  period: number;
};

export function weekOrdinalsEqual(
  a: readonly number[],
  b: readonly number[]
): boolean {
  const sa = [...new Set(a)].sort((x, y) => x - y);
  const sb = [...new Set(b)].sort((x, y) => x - y);
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/** 振替枠が週グループ（第1・3 / 第2・4）に属するか。week_ordinals に第5週などが追加されていても一致 */
export function capacityMatchesWeekGroup(
  cap: Pick<LessonCapacity, "week_ordinals">,
  weekGroupId: RegularWeekGroupId
): boolean {
  const group = REGULAR_WEEK_GROUPS.find((g) => g.id === weekGroupId);
  if (!group) return false;
  return group.ordinals.every((o) => cap.week_ordinals.includes(o));
}

export function weekGroupFromCapacity(
  cap: Pick<LessonCapacity, "week_ordinals">
): RegularWeekGroupId | null {
  for (const g of REGULAR_WEEK_GROUPS) {
    if (weekOrdinalsEqual(cap.week_ordinals, g.ordinals)) {
      return g.id;
    }
  }
  for (const g of REGULAR_WEEK_GROUPS) {
    if (capacityMatchesWeekGroup(cap, g.id)) {
      return g.id;
    }
  }
  return null;
}

export function regularSlotLabel(parts: RegularSlotParts): string {
  const g = REGULAR_WEEK_GROUPS.find((x) => x.id === parts.weekGroupId);
  return `${g?.label ?? parts.weekGroupId}${dayLabel(parts.dayOfWeek)} · ${parts.period}コマ`;
}

export function formatCapacityRegularSlot(
  cap: Pick<LessonCapacity, "week_ordinals" | "day_of_week" | "period">
): string {
  const wg = weekGroupFromCapacity(cap);
  if (wg) {
    return regularSlotLabel({
      weekGroupId: wg,
      dayOfWeek: cap.day_of_week,
      period: cap.period,
    });
  }
  return `${formatWeekOrdinals(cap.week_ordinals)}${dayLabel(cap.day_of_week)} · ${cap.period}コマ`;
}

export function resolveEnrollmentCapacityId(
  capacities: LessonCapacity[],
  params: {
    classroom: string;
    subject: string;
    weekGroupId: RegularWeekGroupId;
    dayOfWeek: number;
    period: number;
  }
): string | null {
  const group = REGULAR_WEEK_GROUPS.find((g) => g.id === params.weekGroupId);
  if (!group) return null;

  const found = capacities.find(
    (c) =>
      c.classroom === params.classroom &&
      c.subject === params.subject &&
      c.day_of_week === params.dayOfWeek &&
      c.period === params.period &&
      capacityMatchesWeekGroup(c, params.weekGroupId)
  );
  return found?.id ?? null;
}

export function capacityToRegularSlotParts(
  cap: LessonCapacity | undefined | null
): RegularSlotParts | null {
  if (!cap) return null;
  const weekGroupId = weekGroupFromCapacity(cap);
  if (!weekGroupId) return null;
  return {
    weekGroupId,
    dayOfWeek: cap.day_of_week,
    period: cap.period,
  };
}

/** CSV / フォーム入力の週グループ文字列 → id */
export function parseWeekGroupCell(raw: string): RegularWeekGroupId | null {
  const t = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s/g, "")
    .trim();
  if (!t) return null;

  const lower = t.toLowerCase();
  if (lower === "1-3" || lower === "13" || t === "第1/3" || t === "第1・3" || t === "第1・3週") {
    return "1-3";
  }
  if (lower === "2-4" || lower === "24" || t === "第2/4" || t === "第2・4" || t === "第2・4週") {
    return "2-4";
  }
  return null;
}

/** CSV / フォーム入力の曜日 → 0=日 … 6=土 */
export function parseDayOfWeekCell(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;

  const n = Number(t);
  if (Number.isInteger(n) && n >= 0 && n <= 6) return n;

  const map: Record<string, number> = {
    日: 0,
    日曜: 0,
    日曜日: 0,
    月: 1,
    月曜: 1,
    月曜日: 1,
    火: 2,
    火曜: 2,
    火曜日: 2,
    水: 3,
    水曜: 3,
    水曜日: 3,
    木: 4,
    木曜: 4,
    木曜日: 4,
    金: 5,
    金曜: 5,
    金曜日: 5,
    土: 6,
    土曜: 6,
    土曜日: 6,
  };
  return map[t] ?? null;
}

/** CSV / フォーム入力のコマ番号 */
export function parsePeriodCell(raw: string): number | null {
  const t = raw.trim().replace(/コマ.*$/, "");
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PERIOD) return null;
  return n;
}

export function parseRegularSlotCells(
  weekGroupRaw: string,
  dayRaw: string,
  periodRaw: string
): { ok: true; parts: RegularSlotParts } | { ok: false; error: string } {
  const hasAny = weekGroupRaw.trim() || dayRaw.trim() || periodRaw.trim();
  if (!hasAny) {
    return { ok: false, error: "未設定" };
  }

  const weekGroupId = parseWeekGroupCell(weekGroupRaw);
  const dayOfWeek = parseDayOfWeekCell(dayRaw);
  const period = parsePeriodCell(periodRaw);

  if (!weekGroupId) {
    return {
      ok: false,
      error: `週グループ「${weekGroupRaw}」が不正です（第1/3 または 第2/4）`,
    };
  }
  if (dayOfWeek === null) {
    return { ok: false, error: `曜日「${dayRaw}」が不正です` };
  }
  if (period === null) {
    return { ok: false, error: `コマ「${periodRaw}」が不正です（1〜${MAX_PERIOD}）` };
  }

  return { ok: true, parts: { weekGroupId, dayOfWeek, period } };
}
