"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  fetchClassrooms,
  isKnownClassroom,
  validateClassroomSubjects,
} from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";
import {
  COURSE_SUBJECTS,
  GRADE_LEVELS,
  type ClassroomName,
  type ClassroomRecord,
  type CourseSubject,
  type GradeLevel,
} from "@/lib/types";
import {
  buildProgrammingNextTextFromParts,
  buildRobotNextTextFromParts,
  isProgrammingNextText,
  isRobotNextText,
} from "@/lib/courseNextText";
import { schoolYearStartYm } from "@/lib/annualGradePromotion";
import {
  applySiblingGroup,
  readSiblingFormInput,
} from "@/lib/siblings";
import {
  parseRegularSlotCells,
  regularSlotLabel,
  resolveEnrollmentCapacityId,
} from "@/lib/regularSlot";
import {
  parseStudentsCsv,
  resolveStudentCsvSlots,
  studentCsvRowToPayload,
} from "@/lib/studentCsvImport";
import {
  readBirthdayFromForm,
  readPortalIdFromForm,
} from "@/lib/studentPortal";
import { syncEnrollmentLessons } from "@/lib/syncEnrollmentLessons";
import { applyStudentLeaveEffects } from "@/lib/applyStudentLeave";
import { applyWithdrawalToScheduledLessons } from "@/lib/applyStudentWithdrawal";
import { readLeavePeriodFromForm } from "@/lib/studentLeave";
import { readProgrammingLoginFromForm } from "@/lib/studentProgrammingLogin";
import { readPromotionFromForm } from "@/lib/studentPromotion";
import { readCourseStartFromForm } from "@/lib/studentCourseStart";
import { applyDueSkipPromotionIfNeeded } from "@/lib/applyStudentPromotion";
import { readWithdrawalUntilFromForm } from "@/lib/studentWithdrawal";
import type { LessonCapacity } from "@/lib/types";

const STUDENTS_BASE = "/students";

function readEnrollmentSlotFromForm(
  formData: FormData,
  prefix: "enrollment_robot" | "enrollment_prog",
  subject: "ロボット" | "プログラミング",
  classroom: ClassroomName | null,
  subjects: CourseSubject[],
  capacities: LessonCapacity[]
): { value: string | null; error?: string } {
  if (!subjects.includes(subject)) {
    return { value: null };
  }

  const weekGroup = String(formData.get(`${prefix}_week_group`) ?? "").trim();
  const dayRaw = String(formData.get(`${prefix}_day_of_week`) ?? "").trim();
  const periodRaw = String(formData.get(`${prefix}_period`) ?? "").trim();

  if (!weekGroup && !dayRaw && !periodRaw) {
    return {
      value: null,
      error: `${subject}受講の場合、レギュラー出席コマ（週グループ・曜日・コマ）を設定してください。`,
    };
  }

  const parsed = parseRegularSlotCells(weekGroup, dayRaw, periodRaw);
  if (!parsed.ok) {
    return {
      value: null,
      error: `${subject}のレギュラー出席コマ: ${parsed.error}`,
    };
  }

  if (!classroom) {
    return {
      value: null,
      error: `${subject}のレギュラー出席コマを選ぶ場合は所属教室も指定してください。`,
    };
  }

  const id = resolveEnrollmentCapacityId(capacities, {
    classroom,
    subject,
    weekGroupId: parsed.parts.weekGroupId,
    dayOfWeek: parsed.parts.dayOfWeek,
    period: parsed.parts.period,
  });

  if (!id) {
    return {
      value: null,
      error: `${subject}のレギュラー出席コマ（${regularSlotLabel(parsed.parts)}）が「教室・振替の設定」にありません。先に第1・3週または第2・4週の枠を登録してください。`,
    };
  }

  return { value: id };
}

async function loadLessonCapacities(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<LessonCapacity[]> {
  const { data, error } = await supabase
    .from("lesson_capacities")
    .select("id, classroom, day_of_week, week_ordinals, period, subject");
  if (error) throw new Error(error.message);
  return (data ?? []) as LessonCapacity[];
}

function readSubjects(formData: FormData): CourseSubject[] {
  const raw = formData.getAll("subjects").map(String);
  return raw.filter((s): s is CourseSubject =>
    (COURSE_SUBJECTS as readonly string[]).includes(s)
  );
}

function readClassroom(
  formData: FormData,
  classrooms: readonly ClassroomRecord[]
): {
  value: ClassroomName | null;
  error?: string;
} {
  const raw = String(formData.get("classroom") ?? "").trim();
  if (!raw) return { value: null };
  if (!isKnownClassroom(raw, classrooms)) {
    return { value: null, error: "所属教室の選択が不正です。" };
  }
  return { value: raw };
}

/** 受講教科が、選択した教室で開講しているものだけかを検証 */
function validateSubjectsAgainstClassroom(
  classroom: ClassroomName | null,
  subjects: CourseSubject[],
  classrooms: readonly ClassroomRecord[]
): string | null {
  if (!classroom) return null;
  return validateClassroomSubjects(classroom, subjects, classrooms);
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
  const nameKana = String(formData.get("name_kana") ?? "").trim();
  const gradeRaw = String(formData.get("grade") ?? "");
  const persistent_memo = String(formData.get("persistent_memo") ?? "").trim();
  const subjects = readSubjects(formData);
  const portalIdResult = readPortalIdFromForm(formData);
  const birthdayResult = readBirthdayFromForm(formData);

  const supabase = await createClient();
  let classrooms: ClassroomRecord[];
  try {
    classrooms = await fetchClassrooms(supabase);
  } catch (e) {
    redirect(
      `/students/new?error=${encodeURIComponent(
        e instanceof Error ? e.message : "教室一覧の読み込みに失敗しました。"
      )}`
    );
  }
  const gradePromotedThroughYm = schoolYearStartYm(
    new Date().toISOString().slice(0, 10)
  );
  const classroomResult = readClassroom(formData, classrooms);

  if (!name) {
    redirect(
      `/students/new?error=${encodeURIComponent("名前を入力してください。")}`
    );
  }
  if (portalIdResult.error) {
    redirect(
      `/students/new?error=${encodeURIComponent(portalIdResult.error)}`
    );
  }
  if (birthdayResult.error) {
    redirect(
      `/students/new?error=${encodeURIComponent(birthdayResult.error)}`
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
    subjects,
    classrooms
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

  let capacities: LessonCapacity[];
  try {
    capacities = await loadLessonCapacities(supabase);
  } catch (e) {
    redirect(
      `/students/new?error=${encodeURIComponent(
        e instanceof Error ? e.message : "振替枠の読み込みに失敗しました。"
      )}`
    );
  }

  const robotCap = readEnrollmentSlotFromForm(
    formData,
    "enrollment_robot",
    "ロボット",
    classroomResult.value,
    subjects,
    capacities
  );
  const progCap = readEnrollmentSlotFromForm(
    formData,
    "enrollment_prog",
    "プログラミング",
    classroomResult.value,
    subjects,
    capacities
  );
  if (robotCap.error) {
    redirect(`/students/new?error=${encodeURIComponent(robotCap.error)}`);
  }
  if (progCap.error) {
    redirect(`/students/new?error=${encodeURIComponent(progCap.error)}`);
  }

  const leavePeriod = readLeavePeriodFromForm(formData);
  if (leavePeriod.error) {
    redirect(`/students/new?error=${encodeURIComponent(leavePeriod.error)}`);
  }

  const withdrawalPeriod = readWithdrawalUntilFromForm(formData);
  if (withdrawalPeriod.error) {
    redirect(
      `/students/new?error=${encodeURIComponent(withdrawalPeriod.error)}`
    );
  }

  const promotion = readPromotionFromForm(formData);
  if (promotion.error) {
    redirect(`/students/new?error=${encodeURIComponent(promotion.error)}`);
  }

  const courseStart = readCourseStartFromForm(formData, subjects);
  if (courseStart.error) {
    redirect(`/students/new?error=${encodeURIComponent(courseStart.error)}`);
  }

  const progLogin = readProgrammingLoginFromForm(formData, subjects);
  if (progLogin.error) {
    redirect(`/students/new?error=${encodeURIComponent(progLogin.error)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("students")
    .insert({
      name,
      name_kana: nameKana || null,
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
      portal_id: portalIdResult.value,
      birthday: birthdayResult.value,
      leave_from_ym: leavePeriod.leave_from_ym,
      leave_until_ym: leavePeriod.leave_until_ym,
      withdrawal_until_ym: withdrawalPeriod.withdrawal_until_ym,
      scratch_login_id: progLogin.value.scratch_login_id,
      scratch_login_pass: progLogin.value.scratch_login_pass,
      minecraft_login: progLogin.value.minecraft_login,
      promotion_scheduled_ym: promotion.promotion_scheduled_ym,
      promotion_type: promotion.promotion_type,
      course_start_robot_ym: courseStart.course_start_robot_ym,
      course_start_programming_ym: courseStart.course_start_programming_ym,
      persistent_memo: persistent_memo || null,
      note: null,
      grade_promoted_through_ym: gradePromotedThroughYm,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/students/new?error=${encodeURIComponent(error.message)}`);
  }

  const siblingInput = readSiblingFormInput(formData);
  const siblingResult = await applySiblingGroup(
    supabase,
    data!.id,
    siblingInput.hasSiblings,
    siblingInput.siblingIds
  );
  if (siblingResult.error) {
    redirect(
      `/students/${data!.id}?error=${encodeURIComponent(
        `生徒は登録できましたが、兄弟姉妹の設定に失敗しました: ${siblingResult.error}`
      )}`
    );
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

  const leaveEffects = await applyStudentLeaveEffects(supabase, {
    id: data!.id,
    subjects,
    leave_from_ym: leavePeriod.leave_from_ym,
    leave_until_ym: leavePeriod.leave_until_ym,
    next_text_robot: nextRobot.value,
    next_text_robot_course: nextRobot.course,
    next_text_robot_text: nextRobot.text,
    next_text_programming: nextProg.value,
    next_text_programming_course: nextProg.course,
    next_text_programming_text: nextProg.text,
  });
  if (leaveEffects.error) {
    redirect(
      `/students/${data!.id}?error=${encodeURIComponent(
        `生徒は登録できましたが、休会設定の反映に失敗しました: ${leaveEffects.error}`
      )}`
    );
  }

  const withdrawalEffects = await applyWithdrawalToScheduledLessons(
    supabase,
    data!.id,
    withdrawalPeriod.withdrawal_until_ym
  );
  if (withdrawalEffects.error) {
    redirect(
      `/students/${data!.id}?error=${encodeURIComponent(
        `生徒は登録できましたが、退会予定の反映に失敗しました: ${withdrawalEffects.error}`
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
  const nameKana = String(formData.get("name_kana") ?? "").trim();
  const gradeRaw = String(formData.get("grade") ?? "");
  const persistent_memo = String(formData.get("persistent_memo") ?? "").trim();
  const subjects = readSubjects(formData);
  const portalIdResult = readPortalIdFromForm(formData);
  const birthdayResult = readBirthdayFromForm(formData);

  if (!id) redirect("/students");

  const editPath = `/students/${id}/edit`;

  const supabase = await createClient();
  let classrooms: ClassroomRecord[];
  try {
    classrooms = await fetchClassrooms(supabase);
  } catch (e) {
    redirect(
      `${editPath}?error=${encodeURIComponent(
        e instanceof Error ? e.message : "教室一覧の読み込みに失敗しました。"
      )}`
    );
  }
  const classroomResult = readClassroom(formData, classrooms);

  if (!name) {
    redirect(`${editPath}?error=${encodeURIComponent("名前を入力してください。")}`);
  }
  if (portalIdResult.error) {
    redirect(`${editPath}?error=${encodeURIComponent(portalIdResult.error)}`);
  }
  if (birthdayResult.error) {
    redirect(`${editPath}?error=${encodeURIComponent(birthdayResult.error)}`);
  }
  if (!GRADE_LEVELS.includes(gradeRaw as GradeLevel)) {
    redirect(`${editPath}?error=${encodeURIComponent("学年を選択してください。")}`);
  }
  if (classroomResult.error) {
    redirect(`${editPath}?error=${encodeURIComponent(classroomResult.error)}`);
  }
  const subjectMismatch = validateSubjectsAgainstClassroom(
    classroomResult.value,
    subjects,
    classrooms
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

  let capacities: LessonCapacity[];
  try {
    capacities = await loadLessonCapacities(supabase);
  } catch (e) {
    redirect(
      `${editPath}?error=${encodeURIComponent(
        e instanceof Error ? e.message : "振替枠の読み込みに失敗しました。"
      )}`
    );
  }

  const robotCap = readEnrollmentSlotFromForm(
    formData,
    "enrollment_robot",
    "ロボット",
    classroomResult.value,
    subjects,
    capacities
  );
  const progCap = readEnrollmentSlotFromForm(
    formData,
    "enrollment_prog",
    "プログラミング",
    classroomResult.value,
    subjects,
    capacities
  );
  if (robotCap.error) {
    redirect(`${editPath}?error=${encodeURIComponent(robotCap.error)}`);
  }
  if (progCap.error) {
    redirect(`${editPath}?error=${encodeURIComponent(progCap.error)}`);
  }

  const leavePeriod = readLeavePeriodFromForm(formData);
  if (leavePeriod.error) {
    redirect(`${editPath}?error=${encodeURIComponent(leavePeriod.error)}`);
  }

  const withdrawalPeriod = readWithdrawalUntilFromForm(formData);
  if (withdrawalPeriod.error) {
    redirect(`${editPath}?error=${encodeURIComponent(withdrawalPeriod.error)}`);
  }

  const promotion = readPromotionFromForm(formData);
  if (promotion.error) {
    redirect(`${editPath}?error=${encodeURIComponent(promotion.error)}`);
  }

  const courseStart = readCourseStartFromForm(formData, subjects);
  if (courseStart.error) {
    redirect(`${editPath}?error=${encodeURIComponent(courseStart.error)}`);
  }

  const progLogin = readProgrammingLoginFromForm(formData, subjects);
  if (progLogin.error) {
    redirect(`${editPath}?error=${encodeURIComponent(progLogin.error)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("students")
    .update({
      name,
      name_kana: nameKana || null,
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
      portal_id: portalIdResult.value,
      birthday: birthdayResult.value,
      leave_from_ym: leavePeriod.leave_from_ym,
      leave_until_ym: leavePeriod.leave_until_ym,
      withdrawal_until_ym: withdrawalPeriod.withdrawal_until_ym,
      scratch_login_id: progLogin.value.scratch_login_id,
      scratch_login_pass: progLogin.value.scratch_login_pass,
      minecraft_login: progLogin.value.minecraft_login,
      promotion_scheduled_ym: promotion.promotion_scheduled_ym,
      promotion_type: promotion.promotion_type,
      course_start_robot_ym: courseStart.course_start_robot_ym,
      course_start_programming_ym: courseStart.course_start_programming_ym,
      persistent_memo: persistent_memo || null,
      note: null,
    })
    .eq("id", id);

  if (error) {
    redirect(`${editPath}?error=${encodeURIComponent(error.message)}`);
  }

  const skipPromotion = await applyDueSkipPromotionIfNeeded(supabase, id);
  if (skipPromotion.error) {
    redirect(
      `/students/${id}?error=${encodeURIComponent(
        `生徒情報は保存できましたが、飛び級の反映に失敗しました: ${skipPromotion.error}`
      )}`
    );
  }

  const siblingInput = readSiblingFormInput(formData);
  const siblingResult = await applySiblingGroup(
    supabase,
    id,
    siblingInput.hasSiblings,
    siblingInput.siblingIds
  );
  if (siblingResult.error) {
    redirect(`${editPath}?error=${encodeURIComponent(siblingResult.error)}`);
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

  const leaveEffects = await applyStudentLeaveEffects(supabase, {
    id,
    subjects,
    leave_from_ym: leavePeriod.leave_from_ym,
    leave_until_ym: leavePeriod.leave_until_ym,
    next_text_robot: nextRobot.value,
    next_text_robot_course: nextRobot.course,
    next_text_robot_text: nextRobot.text,
    next_text_programming: nextProg.value,
    next_text_programming_course: nextProg.course,
    next_text_programming_text: nextProg.text,
  });
  if (leaveEffects.error) {
    redirect(
      `/students/${id}?error=${encodeURIComponent(
        `生徒情報は保存できましたが、休会設定の反映に失敗しました: ${leaveEffects.error}`
      )}`
    );
  }

  const withdrawalEffects = await applyWithdrawalToScheduledLessons(
    supabase,
    id,
    withdrawalPeriod.withdrawal_until_ym
  );
  if (withdrawalEffects.error) {
    redirect(
      `/students/${id}?error=${encodeURIComponent(
        `生徒情報は保存できましたが、退会予定の反映に失敗しました: ${withdrawalEffects.error}`
      )}`
    );
  }

  revalidatePath(`/students/${id}`);
  revalidatePath("/students");
  revalidatePath("/");
  redirect(`/students/${id}`);
}

export async function deleteStudent(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.accountRole !== "staff") {
    redirect("/login");
  }

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 一覧で選択した生徒を一括削除 */
export async function deleteStudentsBulk(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.accountRole !== "staff") {
    redirect("/login");
  }

  const ids = formData
    .getAll("ids")
    .map((v) => String(v).trim())
    .filter((id) => UUID_RE.test(id));

  if (ids.length === 0) {
    redirect(
      `${STUDENTS_BASE}?error=${encodeURIComponent("削除する生徒を選択してください。")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("students").delete().in("id", ids);

  if (error) {
    redirect(
      `${STUDENTS_BASE}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(STUDENTS_BASE);
  revalidatePath("/");
  redirect(
    `${STUDENTS_BASE}?bulk_deleted=${encodeURIComponent(String(ids.length))}`
  );
}

function importFail(msg: string): never {
  redirect(`${STUDENTS_BASE}?error=${encodeURIComponent(msg)}`);
}

function formatImportDbError(
  line: number,
  message: string,
  payload: { next_text_robot?: string | null }
): string {
  let msg = `${line}行目: ${message}`;
  if (message.includes("students_next_text_robot_check")) {
    const robot = payload.next_text_robot ?? "（未設定）";
    msg += ` ロボット_テキスト名「${robot}」がDBの許可リストにありません。Supabaseで supabase/patches/students_next_text_robot.sql を実行してから再インポートしてください。`;
  }
  return msg;
}

/** CSV 一括取り込み（新規・更新）。レギュラー出席コマは第1/3・第2/4 週グループ */
export async function importStudentsCsv(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.accountRole !== "staff") {
    redirect("/login");
  }

  const raw = String(formData.get("csv") ?? "");
  const supabase = await createClient();

  let classrooms: ClassroomRecord[];
  try {
    classrooms = await fetchClassrooms(supabase);
  } catch (e) {
    importFail(
      e instanceof Error ? e.message : "教室一覧の読み込みに失敗しました。"
    );
  }

  const parsedResult = parseStudentsCsv(raw, classrooms);
  if (!parsedResult.ok) importFail(parsedResult.error);

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  let capacities: LessonCapacity[];
  try {
    capacities = await loadLessonCapacities(supabase);
  } catch (e) {
    importFail(
      e instanceof Error ? e.message : "振替枠の読み込みに失敗しました。"
    );
  }

  let created = 0;
  let updated = 0;

  for (const row of parsedResult.parsed) {
    const slots = resolveStudentCsvSlots(row, capacities);
    if (slots.error) importFail(`${row.line}行目: ${slots.error}`);

    const payload = studentCsvRowToPayload(row, slots);

    if (row.student_id) {
      const { data: existing } = await supabase
        .from("students")
        .select("id")
        .eq("id", row.student_id)
        .maybeSingle();

      if (!existing) {
        importFail(`${row.line}行目: student_id ${row.student_id} が見つかりません。`);
      }

      const { error } = await supabase
        .from("students")
        .update(payload)
        .eq("id", row.student_id);

      if (error) importFail(formatImportDbError(row.line, error.message, payload));

      const sync = await syncEnrollmentLessons(supabase, {
        studentId: row.student_id,
        teacherId: authUser.id,
        classroom: row.classroom,
        subjects: row.subjects,
        robotCapacityId: slots.robotCapacityId,
        progCapacityId: slots.progCapacityId,
      });
      if (sync.error) {
        importFail(`${row.line}行目: 出席予定の同期に失敗: ${sync.error}`);
      }
      updated++;
    } else {
      const { data, error } = await supabase
        .from("students")
        .insert({ ...payload, created_by: authUser.id })
        .select("id")
        .single();

      if (error) importFail(formatImportDbError(row.line, error.message, payload));

      const sync = await syncEnrollmentLessons(supabase, {
        studentId: data!.id,
        teacherId: authUser.id,
        classroom: row.classroom,
        subjects: row.subjects,
        robotCapacityId: slots.robotCapacityId,
        progCapacityId: slots.progCapacityId,
      });
      if (sync.error) {
        importFail(`${row.line}行目: 出席予定の同期に失敗: ${sync.error}`);
      }
      created++;
    }
  }

  revalidatePath(STUDENTS_BASE);
  revalidatePath("/");

  const params = new URLSearchParams();
  if (created > 0) params.set("imported", String(created));
  if (updated > 0) params.set("csv_updated", String(updated));
  const qs = params.toString();
  redirect(qs ? `${STUDENTS_BASE}?${qs}` : STUDENTS_BASE);
}

export async function updateStudentPersistentMemo(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.accountRole !== "staff") {
    redirect("/login");
  }

  const studentId = String(formData.get("student_id") ?? "").trim();
  const persistent_memo = String(formData.get("persistent_memo") ?? "").trim();

  if (!studentId) redirect("/students");

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({
      persistent_memo: persistent_memo || null,
      note: null,
    })
    .eq("id", studentId);

  const base = `/students/${studentId}`;
  if (error) {
    redirect(
      `${base}?error=${encodeURIComponent(`備考（継続）の保存に失敗: ${error.message}`)}`
    );
  }

  revalidatePath(base);
  revalidatePath("/", "layout");
  redirect(`${base}?memo_saved=1`);
}
