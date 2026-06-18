"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { COURSE_SUBJECTS, type CourseSubject } from "@/lib/types";

const BASE = "/capacities/period-times";
const NEW_PATH = `${BASE}/classrooms/new`;

function fail(msg: string): never {
  redirect(`${NEW_PATH}?error=${encodeURIComponent(msg)}`);
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

  const name = String(formData.get("name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const subjects = readSubjects(formData);

  if (!name) fail("教室名を入力してください。");
  if (name.length > 80) fail("教室名は 80 文字以内にしてください。");
  if (subjects.length === 0) {
    fail("開講教科を 1 つ以上選んでください。");
  }

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("classrooms")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = (last?.sort_order ?? 0) + 1;

  const { error } = await supabase.from("classrooms").insert({
    name,
    subjects,
    note: note || null,
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

  revalidatePath(BASE);
  revalidatePath(NEW_PATH);
  revalidatePath("/capacities");
  revalidatePath("/students");
  revalidatePath("/students/new");
  revalidatePath("/apply");

  redirect(
    `${BASE}?classroom_created=${encodeURIComponent(name)}`
  );
}
