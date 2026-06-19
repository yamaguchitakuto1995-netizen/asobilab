import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classroomSubjects,
  LEGACY_SEED_CLASSROOMS,
  type ClassroomRecord,
  type CourseSubject,
} from "@/lib/types";

export type { ClassroomRecord };

/** DB 未移行・一時障害時のフォールバック */
export function legacyClassroomRecords(): ClassroomRecord[] {
  return LEGACY_SEED_CLASSROOMS.map((c, i) => ({
    id: `legacy-${i}`,
    name: c.name,
    subjects: [...c.subjects],
    note: null,
    sort_order: i,
  }));
}

export async function fetchClassrooms(
  supabase: SupabaseClient
): Promise<ClassroomRecord[]> {
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, name, subjects, note, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[fetchClassrooms]", error.message);
    return legacyClassroomRecords();
  }

  if (!data?.length) {
    return legacyClassroomRecords();
  }

  return data as ClassroomRecord[];
}

export function classroomNames(
  classrooms: readonly Pick<ClassroomRecord, "name">[]
): string[] {
  return classrooms.map((c) => c.name);
}

export function isKnownClassroom(
  name: string,
  classrooms: readonly Pick<ClassroomRecord, "name">[]
): boolean {
  return classrooms.some((c) => c.name === name);
}

export function findClassroom(
  name: string | null | undefined,
  classrooms: readonly ClassroomRecord[]
): ClassroomRecord | undefined {
  if (!name) return undefined;
  return classrooms.find((c) => c.name === name);
}

export function validateClassroomSubjects(
  classroomName: string,
  subjects: CourseSubject[],
  classrooms: readonly ClassroomRecord[]
): string | null {
  const allowed = new Set(classroomSubjects(classroomName, classrooms));
  const invalid = subjects.filter((s) => !allowed.has(s));
  if (invalid.length > 0) {
    return `${classroomName} では「${invalid.join("・")}」を開講していません。`;
  }
  return null;
}
