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
import {
  buildProgrammingNextTextFromParts,
  buildRobotNextTextFromParts,
  isProgrammingNextText,
  isRobotNextText,
} from "@/lib/courseNextText";
import { syncEnrollmentLessons } from "@/lib/syncEnrollmentLessons";

const CAPACITY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readEnrollmentCapacityId(formData: FormData, field: string): {
  value: string | null;
  error?: string;
} {
  const raw = String(formData.get(field) ?? "").trim();
  if (!raw) return { value: null };
  if (!CAPACITY_ID_RE.test(raw)) {
    return { value: null, error: "定例コマの指定が不正です。" };
  }
  return { value: raw };
}

async function validateEnrollmentCapacity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  classroom: ClassroomName | null,
  subjects: CourseSubject[],
  capacityId: string | null,
  subject: "ロボット" | "プログラミング"
): Promise<string | null> {
  if (!capacityId) return null;
  if (!classroom) {
    return "定例コマを選ぶ場合は所属教室も指定してください。";
  }
  if (!subjects.includes(subject)) return null;

  const { data, error } = await supabase
    .from("lesson_capacities")
    .select("id, classroom, subject")
    .eq("id", capacityId)
    .maybeSingle();

  if (error) return error.message;
  if (!data) return "定例コマが見つかりません。振替枠設定を確認してください。";
  if (data.classroom !== classroom || data.subject !== subject) {
    return "定例コマが所属教室・受講教科と一致しません。";
  }
  return null;
}

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

function readNextTextRobot(
  formData: FormData,
  subjects: CourseSubject[]
): {
  value: string | null;
  course: string | null;
  text: string | null;
  error?: string;
} {
  if (!subjects.includes("ロボット")) {
    return { value: null, course: null, text: null };
  }
  const course = String(formData.get("next_text_robot_course") ?? "").trim();
  const text = String(formData.get("next_text_robot_text") ?? "").trim();
  if (!course && !text) {
    return { value: null, course: null, text: null };
  }
  if (!course || !text) {
    return {
      value: null,
      course: null,
      text: null,
      error:
        "ロボットの次回テキストは、コースとテキスト名の両方を選んでください。",
    };
  }
  const combined = buildRobotNextTextFromParts(course, text);
  if (!isRobotNextText(combined)) {
    return {
      value: null,
      course: null,
      text: null,
      error: "ロボット・次回テキストの選択が不正です。",
    };
  }
  return { value: combined, course, text };
}

function readNextTextProgramming(
  formData: FormData,
  subjects: CourseSubject[]
): {
  value: string | null;
  course: string | null;
  text: string | null;
  error?: string;
} {
  if (!subjects.includes("プログラミング")) {
    return { value: null, course: null, text: null };
  }
  const course = String(
    formData.get("next_text_programming_course") ?? ""
  ).trim();
  const text = String(
    formData.get("next_text_programming_text") ?? ""
  ).trim();
  if (!course && !text) {
    return { value: null, course: null, text: null };
  }
  if (!course || !text) {
    return {
      value: null,
      course: null,
      text: null,
      error:
        "プログラミングの次回テキストは、コースとテキスト名の両方を選んでください。",
    };
  }
  const combined = buildProgrammingNextTextFromParts(course, text);
  if (!isProgrammingNextText(combined)) {
    return {
      value: null,
      course: null,
      text: null,
      error: "プログラミング・次回テキストの選択が不正です。",
    };
  }
  return { value: combined, course, text };
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

  const nextRobot = readNextTextRobot(formData, subjects);
  if (nextRobot.error) {
    redirect(`/students/new?error=${encodeURIComponent(nextRobot.error)}`);
  }

  const nextProg = readNextTextProgramming(formData, subjects);
  if (nextProg.error) {
    redirect(`/students/new?error=${encodeURIComponent(nextProg.error)}`);
  }

  const robotCap = readEnrollmentCapacityId(
    formData,
    "enrollment_robot_capacity_id"
  );
  const progCap = readEnrollmentCapacityId(
    formData,
    "enrollment_prog_capacity_id"
  );
  if (robotCap.error) {
    redirect(`/students/new?error=${encodeURIComponent(robotCap.error)}`);
  }
  if (progCap.error) {
    redirect(`/students/new?error=${encodeURIComponent(progCap.error)}`);
  }

  const supabase = await createClient();
  const capErrRobot = await validateEnrollmentCapacity(
    supabase,
    classroomResult.value,
    subjects,
    robotCap.value,
    "ロボット"
  );
  if (capErrRobot) {
    redirect(`/students/new?error=${encodeURIComponent(capErrRobot)}`);
  }
  const capErrProg = await validateEnrollmentCapacity(
    supabase,
    classroomResult.value,
    subjects,
    progCap.value,
    "プログラミング"
  );
  if (capErrProg) {
    redirect(`/students/new?error=${encodeURIComponent(capErrProg)}`);
  }

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
      next_text_robot: nextRobot.value,
      next_text_robot_course: nextRobot.course,
      next_text_robot_text: nextRobot.text,
      next_text_programming: nextProg.value,
      next_text_programming_course: nextProg.course,
      next_text_programming_text: nextProg.text,
      enrollment_robot_capacity_id: robotCap.value,
      enrollment_prog_capacity_id: progCap.value,
      note: note || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/students/new?error=${encodeURIComponent(error.message)}`);
  }

  const sync = await syncEnrollmentLessons(supabase, {
    studentId: data!.id,
    teacherId: user.id,
    classroom: classroomResult.value,
    subjects,
    robotCapacityId: robotCap.value,
    progCapacityId: progCap.value,
  });
  if (sync.error) {
    redirect(
      `/students/${data!.id}?error=${encodeURIComponent(
        `生徒は登録できましたが、出席予定の自動作成に失敗しました: ${sync.error}`
      )}`
    );
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

  const nextRobot = readNextTextRobot(formData, subjects);
  if (nextRobot.error) {
    redirect(`${editPath}?error=${encodeURIComponent(nextRobot.error)}`);
  }

  const nextProg = readNextTextProgramming(formData, subjects);
  if (nextProg.error) {
    redirect(`${editPath}?error=${encodeURIComponent(nextProg.error)}`);
  }

  const robotCap = readEnrollmentCapacityId(
    formData,
    "enrollment_robot_capacity_id"
  );
  const progCap = readEnrollmentCapacityId(
    formData,
    "enrollment_prog_capacity_id"
  );
  if (robotCap.error) {
    redirect(`${editPath}?error=${encodeURIComponent(robotCap.error)}`);
  }
  if (progCap.error) {
    redirect(`${editPath}?error=${encodeURIComponent(progCap.error)}`);
  }

  const supabase = await createClient();

  const capErrRobot = await validateEnrollmentCapacity(
    supabase,
    classroomResult.value,
    subjects,
    robotCap.value,
    "ロボット"
  );
  if (capErrRobot) {
    redirect(`${editPath}?error=${encodeURIComponent(capErrRobot)}`);
  }
  const capErrProg = await validateEnrollmentCapacity(
    supabase,
    classroomResult.value,
    subjects,
    progCap.value,
    "プログラミング"
  );
  if (capErrProg) {
    redirect(`${editPath}?error=${encodeURIComponent(capErrProg)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("students")
    .update({
      name,
      grade: gradeRaw,
      classroom: classroomResult.value,
      subjects,
      next_text_robot: nextRobot.value,
      next_text_robot_course: nextRobot.course,
      next_text_robot_text: nextRobot.text,
      next_text_programming: nextProg.value,
      next_text_programming_course: nextProg.course,
      next_text_programming_text: nextProg.text,
      enrollment_robot_capacity_id: robotCap.value,
      enrollment_prog_capacity_id: progCap.value,
      note: note || null,
    })
    .eq("id", id);

  if (error) {
    redirect(`${editPath}?error=${encodeURIComponent(error.message)}`);
  }

  const sync = await syncEnrollmentLessons(supabase, {
    studentId: id,
    teacherId: user.id,
    classroom: classroomResult.value,
    subjects,
    robotCapacityId: robotCap.value,
    progCapacityId: progCap.value,
  });
  if (sync.error) {
    redirect(
      `/students/${id}?error=${encodeURIComponent(
        `生徒情報は保存できましたが、出席予定の自動同期に失敗しました: ${sync.error}`
      )}`
    );
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
