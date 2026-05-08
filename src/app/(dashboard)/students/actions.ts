"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  CLASSROOM_NAMES,
  COURSE_SUBJECTS,
  GRADE_LEVELS,
  classroomSubjects,
  type ClassroomName,
  type CourseSubject,
  type GradeLevel,
} from "@/lib/types";

function readSubjects(formData: FormData): CourseSubject[] {
  const raw = formData.getAll("subjects").map(String);
  return raw.filter((s): s is CourseSubject =>
    (COURSE_SUBJECTS as readonly string[]).includes(s)
  );
}

function readClassroom(formData: FormData): {
  value: ClassroomName | null;
  error?: string;
} {
  const raw = String(formData.get("classroom") ?? "").trim();
  if (!raw) return { value: null };
  if (!(CLASSROOM_NAMES as readonly string[]).includes(raw)) {
    return { value: null, error: "所属教室の選択が不正です。" };
  }
  return { value: raw as ClassroomName };
}

/** 受講教科が、選択した教室で開講しているものだけかを検証 */
function validateSubjectsAgainstClassroom(
  classroom: ClassroomName | null,
  subjects: CourseSubject[]
): string | null {
  if (!classroom) return null;
  const allowed = new Set(classroomSubjects(classroom));
  const invalid = subjects.filter((s) => !allowed.has(s));
  if (invalid.length > 0) {
    return `${classroom} では「${invalid.join("・")}」を開講していません。`;
  }
  return null;
}

export async function createStudent(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const gradeRaw = String(formData.get("grade") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const subjects = readSubjects(formData);
  const classroomResult = readClassroom(formData);

  if (!name) {
    redirect(
      `/students/new?error=${encodeURIComponent("名前を入力してください。")}`
    );
  }
  if (!GRADE_LEVELS.includes(gradeRaw as GradeLevel)) {
    redirect(
      `/students/new?error=${encodeURIComponent("学年を選択してください。")}`
    );
  }
  if (classroomResult.error) {
    redirect(
      `/students/new?error=${encodeURIComponent(classroomResult.error)}`
    );
  }
  const subjectMismatch = validateSubjectsAgainstClassroom(
    classroomResult.value,
    subjects
  );
  if (subjectMismatch) {
    redirect(`/students/new?error=${encodeURIComponent(subjectMismatch)}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("students")
    .insert({
      name,
      grade: gradeRaw,
      classroom: classroomResult.value,
      subjects,
      note: note || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/students/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/students");
  revalidatePath("/");
  redirect(`/students/${data!.id}`);
}

export async function updateStudent(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const gradeRaw = String(formData.get("grade") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const subjects = readSubjects(formData);
  const classroomResult = readClassroom(formData);

  if (!id) redirect("/students");

  const editPath = `/students/${id}/edit`;

  if (!name) {
    redirect(`${editPath}?error=${encodeURIComponent("名前を入力してください。")}`);
  }
  if (!GRADE_LEVELS.includes(gradeRaw as GradeLevel)) {
    redirect(`${editPath}?error=${encodeURIComponent("学年を選択してください。")}`);
  }
  if (classroomResult.error) {
    redirect(`${editPath}?error=${encodeURIComponent(classroomResult.error)}`);
  }
  const subjectMismatch = validateSubjectsAgainstClassroom(
    classroomResult.value,
    subjects
  );
  if (subjectMismatch) {
    redirect(`${editPath}?error=${encodeURIComponent(subjectMismatch)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({
      name,
      grade: gradeRaw,
      classroom: classroomResult.value,
      subjects,
      note: note || null,
    })
    .eq("id", id);

  if (error) {
    redirect(`${editPath}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/students/${id}`);
  revalidatePath("/students");
  revalidatePath("/");
  redirect(`/students/${id}`);
}

export async function deleteStudent(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/students");

  const supabase = await createClient();
  const { error } = await supabase.from("students").delete().eq("id", id);

  if (error) {
    redirect(
      `/students/${id}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath("/students");
  revalidatePath("/");
  redirect("/students");
}
