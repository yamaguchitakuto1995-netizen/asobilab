import type { SupabaseClient } from "@supabase/supabase-js";
import { dowOf } from "@/lib/days";
import { weekdayOccurrenceInMonth } from "@/lib/enrollmentSchedule";
import {
  REGULAR_WEEK_GROUPS,
  capacityMatchesWeekGroup,
  type RegularSlotParts,
  type RegularWeekGroupId,
} from "@/lib/regularSlot";
import { dayLabel } from "@/lib/days";
import type { LessonCapacity } from "@/lib/types";

/** 開催日から曜日・第何週を読み取り、週グループを推定（第5週は null） */
export function inferRegularSlotFromLessonDate(
  lessonDate: string,
  period: number
): RegularSlotParts | null {
  const dayOfWeek = dowOf(lessonDate);
  const occ = weekdayOccurrenceInMonth(lessonDate);
  let weekGroupId: RegularWeekGroupId | null = null;
  if (occ === 1 || occ === 3) weekGroupId = "1-3";
  if (occ === 2 || occ === 4) weekGroupId = "2-4";
  if (!weekGroupId) return null;
  return { weekGroupId, dayOfWeek, period };
}

/** 開催日とレギュラーコマの曜日が一致するか（曜日のみ。週グループ名と第何週の一致は不要） */
export function validateLessonDateMatchesRegularSlot(
  lessonDate: string,
  parts: RegularSlotParts
): string | null {
  const dow = dowOf(lessonDate);
  if (dow !== parts.dayOfWeek) {
    return `開催日は${dayLabel(dow)}曜ですが、レギュラーコマは${dayLabel(parts.dayOfWeek)}曜に設定されています。`;
  }
  return null;
}

/** 週グループ名と開催日の第何週が異なる場合の確認メッセージ（保存は可能） */
export function getWeekGroupOccurrenceMismatchWarning(
  lessonDate: string,
  weekGroupId: RegularWeekGroupId
): string | null {
  const occ = weekdayOccurrenceInMonth(lessonDate);
  const group = REGULAR_WEEK_GROUPS.find((g) => g.id === weekGroupId);
  if (!group || (group.ordinals as readonly number[]).includes(occ)) {
    return null;
  }
  return `開催日は第${occ}週ですが、週グループは「${group.label}」です。第1・3 / 第2・4 は名称であり、第${occ}週の開催日でも問題ありません。このまま保存しますか？`;
}

function mergeWeekOrdinals(
  base: readonly number[],
  lessonDate?: string
): number[] {
  const set = new Set(base);
  if (lessonDate) {
    set.add(weekdayOccurrenceInMonth(lessonDate));
  }
  return [...set].sort((a, b) => a - b);
}

export function readRegularSlotFromForm(
  formData: FormData,
  period: number
): { ok: true; parts: RegularSlotParts } | { ok: false; error: string } {
  const weekGroup = String(formData.get("regular_week_group") ?? "").trim();
  const dayRaw = String(formData.get("regular_day_of_week") ?? "").trim();

  if (!weekGroup) {
    return { ok: false, error: "レギュラー出席コマの週グループを選んでください。" };
  }
  if (dayRaw === "") {
    return { ok: false, error: "レギュラー出席コマの曜日を選んでください。" };
  }

  const dayOfWeek = Number(dayRaw);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { ok: false, error: "レギュラー出席コマの曜日が不正です。" };
  }

  const weekGroupId = weekGroup as RegularWeekGroupId;
  if (!REGULAR_WEEK_GROUPS.some((g) => g.id === weekGroupId)) {
    return { ok: false, error: "週グループは第1/3 または 第2/4 を選んでください。" };
  }

  return {
    ok: true,
    parts: { weekGroupId, dayOfWeek, period },
  };
}

/** 振替枠マスタにレギュラーコマがなければ作成し、id を返す */
export async function ensureLessonCapacityForRegularSlot(
  supabase: SupabaseClient,
  params: {
    classroom: string;
    subject: string;
    weekGroupId: RegularWeekGroupId;
    dayOfWeek: number;
    period: number;
    /** 指定時、その日の第何週を week_ordinals に追加（出席連動用） */
    lessonDate?: string;
  }
): Promise<{ id: string; created: boolean; error?: string }> {
  const group = REGULAR_WEEK_GROUPS.find((g) => g.id === params.weekGroupId);
  if (!group) {
    return { id: "", created: false, error: "週グループが不正です。" };
  }

  const { data: rows, error: selErr } = await supabase
    .from("lesson_capacities")
    .select("id, week_ordinals")
    .eq("classroom", params.classroom)
    .eq("day_of_week", params.dayOfWeek)
    .eq("period", params.period)
    .eq("subject", params.subject);

  if (selErr) {
    return { id: "", created: false, error: selErr.message };
  }

  const existing = (rows ?? []).find((r) =>
    capacityMatchesWeekGroup(
      r as Pick<LessonCapacity, "week_ordinals">,
      params.weekGroupId
    )
  );
  if (existing) {
    if (params.lessonDate) {
      const merged = mergeWeekOrdinals(existing.week_ordinals, params.lessonDate);
      const changed =
        merged.length !== existing.week_ordinals.length ||
        merged.some((o, i) => o !== existing.week_ordinals[i]);
      if (changed) {
        const { error: updErr } = await supabase
          .from("lesson_capacities")
          .update({ week_ordinals: merged })
          .eq("id", existing.id);
        if (updErr) {
          return { id: "", created: false, error: updErr.message };
        }
      }
    }
    return { id: existing.id, created: false };
  }

  const week_ordinals = mergeWeekOrdinals(group.ordinals, params.lessonDate);

  const { data, error: insErr } = await supabase
    .from("lesson_capacities")
    .insert({
      classroom: params.classroom,
      day_of_week: params.dayOfWeek,
      week_ordinals,
      period: params.period,
      subject: params.subject,
      max_students: 4,
      note: null,
    })
    .select("id")
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      const { data: retry } = await supabase
        .from("lesson_capacities")
        .select("id, week_ordinals")
        .eq("classroom", params.classroom)
        .eq("day_of_week", params.dayOfWeek)
        .eq("period", params.period)
        .eq("subject", params.subject);
      const found = (retry ?? []).find((r) =>
        capacityMatchesWeekGroup(
          r as Pick<LessonCapacity, "week_ordinals">,
          params.weekGroupId
        )
      );
      if (found) return { id: found.id, created: false };
    }
    return { id: "", created: false, error: insErr.message };
  }

  return { id: data!.id, created: true };
}

export async function ensureRegularSlotCapacitiesForPeriodTime(
  supabase: SupabaseClient,
  params: {
    classroom: string;
    subjects: string[];
    regularSlot: RegularSlotParts;
    lessonDate?: string;
  }
): Promise<{ created: number; error?: string }> {
  let created = 0;
  for (const subject of params.subjects) {
    const result = await ensureLessonCapacityForRegularSlot(supabase, {
      classroom: params.classroom,
      subject,
      ...params.regularSlot,
      lessonDate: params.lessonDate,
    });
    if (result.error) {
      return { created, error: result.error };
    }
    if (result.created) created++;
  }
  return { created };
}
