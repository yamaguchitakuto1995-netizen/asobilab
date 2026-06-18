import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classroomSubjects,
  type ClassroomRecord,
  type CourseSubject,
} from "@/lib/types";

export type { ClassroomRecord };

export async function fetchClassrooms(
  supabase: SupabaseClient
): Promise<ClassroomRecord[]> {
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, name, subjects, note, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ClassroomRecord[];
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
