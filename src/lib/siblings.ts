import type { SupabaseClient } from "@supabase/supabase-js";
import type { Student } from "@/lib/types";

export type SiblingSummary = Pick<
  Student,
  "id" | "name" | "grade" | "classroom" | "subjects"
>;

export async function fetchSiblingSummaries(
  supabase: SupabaseClient,
  studentId: string,
  siblingGroupId: string | null | undefined
): Promise<SiblingSummary[]> {
  if (!siblingGroupId) return [];

  const { data, error } = await supabase
    .from("students")
    .select("id, name, grade, classroom, subjects")
    .eq("sibling_group_id", siblingGroupId)
    .neq("id", studentId)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as SiblingSummary[];
}

export async function fetchStudentsForSiblingPicker(
  supabase: SupabaseClient,
  excludeId?: string
): Promise<SiblingSummary[]> {
  let q = supabase
    .from("students")
    .select("id, name, grade, classroom, subjects")
    .order("name", { ascending: true });

  if (excludeId) q = q.neq("id", excludeId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as SiblingSummary[];
}

export function readSiblingFormInput(formData: FormData): {
  hasSiblings: boolean;
  siblingIds: string[];
} {
  const hasSiblings = formData.get("has_siblings") === "1";
  const siblingIds = formData
    .getAll("sibling_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);
  return { hasSiblings, siblingIds };
}

/** 兄弟姉妹グループを更新（同グループから外れた生徒は null に） */
export async function applySiblingGroup(
  supabase: SupabaseClient,
  studentId: string,
  hasSiblings: boolean,
  selectedSiblingIds: string[]
): Promise<{ error?: string }> {
  const uniqueSelected = [
    ...new Set(selectedSiblingIds.filter((id) => id && id !== studentId)),
  ];

  const { data: current, error: curErr } = await supabase
    .from("students")
    .select("sibling_group_id")
    .eq("id", studentId)
    .maybeSingle<{ sibling_group_id: string | null }>();

  if (curErr) return { error: curErr.message };
  if (!current) return { error: "生徒が見つかりません。" };

  if (!hasSiblings) {
    const { error } = await supabase
      .from("students")
      .update({ sibling_group_id: null })
      .eq("id", studentId);
    return error ? { error: error.message } : {};
  }

  if (uniqueSelected.length === 0) {
    return { error: "兄弟・姉妹がいる場合は、該当する生徒を1名以上選んでください。" };
  }

  const memberIds = [studentId, ...uniqueSelected];
  const { data: memberRows, error: memErr } = await supabase
    .from("students")
    .select("id, sibling_group_id")
    .in("id", memberIds);

  if (memErr) return { error: memErr.message };
  if ((memberRows ?? []).length !== memberIds.length) {
    return { error: "選択した兄弟姉妹の生徒が見つかりません。" };
  }

  const existingGroupId =
    (memberRows ?? []).find((r) => r.sibling_group_id)?.sibling_group_id ??
    crypto.randomUUID();

  const oldGroupId = current.sibling_group_id;
  if (oldGroupId) {
    const { data: oldMembers } = await supabase
      .from("students")
      .select("id")
      .eq("sibling_group_id", oldGroupId);

    for (const m of oldMembers ?? []) {
      if (!memberIds.includes(m.id)) {
        const { error } = await supabase
          .from("students")
          .update({ sibling_group_id: null })
          .eq("id", m.id);
        if (error) return { error: error.message };
      }
    }
  }

  const { error: updErr } = await supabase
    .from("students")
    .update({ sibling_group_id: existingGroupId })
    .in("id", memberIds);

  return updErr ? { error: updErr.message } : {};
}
