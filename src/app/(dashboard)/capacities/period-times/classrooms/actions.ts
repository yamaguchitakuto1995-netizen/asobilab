"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { COURSE_SUBJECTS, type CourseSubject } from "@/lib/types";

const BASE = "/capacities/period-times";
const NEW_PATH = `${BASE}/classrooms/new`;
const EDIT_BASE = `${BASE}/classrooms`;

function fail(msg: string, returnTo: string = NEW_PATH): never {
  redirect(`${returnTo}?error=${encodeURIComponent(msg)}`);
}

function readDefaultMaxStudents(formData: FormData): number | null {
  const raw = Number(formData.get("default_max_students"));
  if (!Number.isInteger(raw) || raw < 0 || raw > 99) return null;
  return raw;
}

function readClassroomPayload(formData: FormData): {
  ok: true;
  value: {
    name: string;
    note: string | null;
    subjects: CourseSubject[];
    default_max_students: number;
  };
} | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const subjects = readSubjects(formData);
  const default_max_students = readDefaultMaxStudents(formData);

  if (!name) return { ok: false, error: "教室名を入力してください。" };
  if (name.length > 80) {
    return { ok: false, error: "教室名は 80 文字以内にしてください。" };
  }
  if (subjects.length === 0) {
    return { ok: false, error: "開講教科を 1 つ以上選んでください。" };
  }
  if (default_max_students === null) {
    return { ok: false, error: "コマ定員は 0〜99 の整数で入力してください。" };
  }

  return {
    ok: true,
    value: { name, note: note || null, subjects, default_max_students },
  };
}

function revalidateClassroomPaths() {
  revalidatePath(BASE);
  revalidatePath(NEW_PATH);
  revalidatePath("/capacities");
  revalidatePath("/students");
  revalidatePath("/students/new");
  revalidatePath("/apply");
}

function readSubjects(formData: FormData): CourseSubject[] {
  const raw = formData.getAll("subjects").map(String);
  return raw.filter((s): s is CourseSubject =>
    (COURSE_SUBJECTS as readonly string[]).includes(s)
  );
}

export async function createClassroom(formData: FormData) {
  const u = await getCurrentUser();
  if (!u?.isAdmin) redirect("/capacities");

  const parsed = readClassroomPayload(formData);
  if (!parsed.ok) fail(parsed.error);

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("classrooms")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = (last?.sort_order ?? 0) + 1;

  const { error } = await supabase.from("classrooms").insert({
    ...parsed.value,
    sort_order,
  });

  if (error) {
    if (error.code === "23505") {
      fail("同じ名前の教室がすでに登録されています。");
    }
    if (error.code === "42P01") {
      fail(
        "classrooms テーブルがありません。Supabase で supabase/classrooms_table_and_migrate.sql を実行してください。"
      );
    }
    fail(error.message);
  }

  revalidateClassroomPaths();

  redirect(
    `${BASE}?classroom_created=${encodeURIComponent(parsed.value.name)}`
  );
}

export async function updateClassroom(formData: FormData) {
  const u = await getCurrentUser();
  if (!u?.isAdmin) redirect("/capacities");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect(BASE);

  const parsed = readClassroomPayload(formData);
  const returnTo = `${EDIT_BASE}/${id}/edit`;
  if (!parsed.ok) fail(parsed.error, returnTo);

  const supabase = await createClient();
  const { error } = await supabase
    .from("classrooms")
    .update(parsed.value)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      fail("同じ名前の教室がすでに登録されています。", returnTo);
    }
    fail(error.message, returnTo);
  }

  revalidateClassroomPaths();
  revalidatePath(returnTo);

  redirect(`${BASE}?classroom_updated=${encodeURIComponent(parsed.value.name)}`);
}

export async function deleteClassroom(formData: FormData) {
  const u = await getCurrentUser();
  if (!u?.isAdmin) redirect("/capacities");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect(BASE);

  const returnTo = `${EDIT_BASE}/${id}/edit`;
  const supabase = await createClient();

  const { data: classroom } = await supabase
    .from("classrooms")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  if (!classroom) redirect(BASE);

  const name = classroom.name;

  async function relatedCount(
    table: "students" | "lesson_capacities" | "classroom_period_times" | "lessons",
    column: string
  ): Promise<number> {
    const { count } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, name);
    return count ?? 0;
  }

  const [students, capacities, periodTimes, lessons] = await Promise.all([
    relatedCount("students", "classroom"),
    relatedCount("lesson_capacities", "classroom"),
    relatedCount("classroom_period_times", "classroom"),
    relatedCount("lessons", "lesson_classroom"),
  ]);

  const blockers: string[] = [];
  if (students > 0) blockers.push(`生徒 ${students} 名`);
  if (capacities > 0) blockers.push(`振替枠 ${capacities} 件`);
  if (periodTimes > 0) blockers.push(`コマ時刻 ${periodTimes} 件`);
  if (lessons > 0) blockers.push(`授業記録 ${lessons} 件`);

  if (blockers.length > 0) {
    fail(
      `この教室は削除できません。関連データがあります（${blockers.join("、")}）。先に削除するか、別の教室へ移してください。`,
      returnTo
    );
  }

  const { error } = await supabase.from("classrooms").delete().eq("id", id);

  if (error) fail(error.message, returnTo);

  revalidateClassroomPaths();
  redirect(`${BASE}?classroom_deleted=${encodeURIComponent(name)}`);
}
