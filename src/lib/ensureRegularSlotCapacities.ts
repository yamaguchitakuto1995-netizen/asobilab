import type { SupabaseClient } from "@supabase/supabase-js";
import { dowOf } from "@/lib/days";
import { weekdayOccurrenceInMonth } from "@/lib/enrollmentSchedule";
import {
  REGULAR_WEEK_GROUPS,
  weekOrdinalsEqual,
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

/** レギュラーコマと開催日（暦日）が整合するか */
export function validateLessonDateMatchesRegularSlot(
  lessonDate: string,
  parts: RegularSlotParts
): string | null {
  const dow = dowOf(lessonDate);
  if (dow !== parts.dayOfWeek) {
    return `開催日は${dayLabel(dow)}曜ですが、レギュラーコマは${dayLabel(parts.dayOfWeek)}曜に設定されています。`;
  }
  const occ = weekdayOccurrenceInMonth(lessonDate);
  const group = REGULAR_WEEK_GROUPS.find((g) => g.id === parts.weekGroupId);
  if (!(group?.ordinals as readonly number[] | undefined)?.includes(occ)) {
    return `開催日は第${occ}週ですが、週グループ「${group?.label ?? parts.weekGroupId}」の対象外です。`;
  }
  return null;
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
    weekOrdinalsEqual((r as Pick<LessonCapacity, "week_ordinals">).week_ordinals, group.ordinals)
  );
  if (existing) {
    return { id: existing.id, created: false };
  }

  const { data, error: insErr } = await supabase
    .from("lesson_capacities")
    .insert({
      classroom: params.classroom,
      day_of_week: params.dayOfWeek,
      week_ordinals: group.ordinals,
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
        weekOrdinalsEqual(
          (r as Pick<LessonCapacity, "week_ordinals">).week_ordinals,
          group.ordinals
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
  }
): Promise<{ created: number; error?: string }> {
  let created = 0;
  for (const subject of params.subjects) {
    const result = await ensureLessonCapacityForRegularSlot(supabase, {
      classroom: params.classroom,
      subject,
      ...params.regularSlot,
    });
    if (result.error) {
      return { created, error: result.error };
    }
    if (result.created) created++;
  }
  return { created };
}
