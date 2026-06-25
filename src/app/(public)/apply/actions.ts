"use server";

import { revalidatePath } from "next/cache";
import { fetchClassrooms, isKnownClassroom } from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";
import { isValidDate, shiftDate, todayIso } from "@/lib/date";
import {
  COURSE_SUBJECTS,
  GRADE_LEVELS,
  MAKEUP_TARGET_MAX_DAYS_AHEAD,
  MAX_PERIOD,
  studentEnrollsInSubject,
  type GradeLevel,
} from "@/lib/types";

export type FoundStudent = {
  id: string;
  name: string;
  classroom: string;
  grade: string;
  subjects: string[];
};

export type LookupResult =
  | { ok: true; student: FoundStudent; siblings: FoundStudent[] }
  | { ok: false; error: string };

export type BookResult =
  | { ok: true; lessonId: string }
  | { ok: false; error: string };

export type BatchBookResult =
  | { ok: true; lessonIds: string[] }
  | { ok: false; error: string };

export type ScheduledLessonOption = {
  id: string;
  lesson_date: string;
  period: number;
  subject: string;
  attendance?: string;
  lesson_classroom?: string | null;
};

export type ListScheduledResult =
  | { ok: true; lessons: ScheduledLessonOption[] }
  | { ok: false; error: string };

export type MarkAbsentResult =
  | { ok: true; lessonId: string }
  | { ok: false; error: string };

export type MarkAbsentBatchResult =
  | { ok: true; lessonIds: string[] }
  | { ok: false; error: string };

export type MarkAbsentInput = {
  studentId: string;
  name: string;
  classroom: string;
  grade: string;
  subjects?: string[];
  lessonDate: string;
  period: number;
  subject: string;
};

type MakeupStudentIdentity = {
  studentId: string;
  name: string;
  classroom: string;
  grade: string;
};

function filterLessonsBySubjects(
  lessons: ScheduledLessonOption[],
  subjects: readonly string[] | null | undefined
): ScheduledLessonOption[] {
  if (!subjects?.length) return lessons;
  return lessons.filter((l) => studentEnrollsInSubject(subjects, l.subject));
}

/** 匿名の振替フォーム向け: students 直読みではなく RPC で本人確認 */
async function verifyStudentForMakeup(
  input: MakeupStudentIdentity
): Promise<
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      row: {
        name: string;
        classroom: string;
        grade: string;
        subjects: string[];
      };
    }
  | { ok: false; error: string }
> {
  const name = input.name.trim();
  const classroom = input.classroom.trim();
  const grade = input.grade.trim();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("find_student_for_makeup", {
    p_name: name,
    p_classroom: classroom,
    p_grade: grade,
  });

  if (error) return { ok: false, error: error.message };

  const list = (data ?? []) as FoundStudent[];
  const found = list.find((s) => s.id === input.studentId);
  if (!found) {
    return {
      ok: false,
      error: "生徒情報を確認できませんでした。教室までお問い合わせください。",
    };
  }

  const student = normalizeFoundStudent(found);
  return {
    ok: true,
    supabase,
    row: {
      name: student.name,
      classroom: student.classroom,
      grade: student.grade,
      subjects: student.subjects,
    },
  };
}

/** 保護者がお子様を本人確認 (RPC: find_student_for_makeup) */
export async function lookupStudent(input: {
  name: string;
  classroom: string;
  grade: string;
}): Promise<LookupResult> {
  const name = input.name.trim();
  const classroom = input.classroom.trim();
  const grade = input.grade.trim();

  if (!name) return { ok: false, error: "お名前を入力してください。" };

  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);
  if (!isKnownClassroom(classroom, classrooms)) {
    return { ok: false, error: "所属教室を選択してください。" };
  }
  if (!GRADE_LEVELS.includes(grade as GradeLevel)) {
    return { ok: false, error: "学年を選択してください。" };
  }

  const { data, error } = await supabase.rpc("find_student_for_makeup", {
    p_name: name,
    p_classroom: classroom,
    p_grade: grade,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  const list = (data ?? []) as FoundStudent[];
  if (list.length === 0) {
    return {
      ok: false,
      error:
        "お名前と教室・学年に一致する生徒が見つかりませんでした。表記が登録と異なる可能性があります。教室までお問い合わせください。",
    };
  }
  if (list.length > 1) {
    // 同名・同教室・同学年が複数いる場合 (まれだが安全側で却下)
    return {
      ok: false,
      error:
        "同姓同名の生徒が複数登録されています。教室までお問い合わせください。",
    };
  }

  const student = normalizeFoundStudent(list[0]!);

  let siblings: FoundStudent[] = [];
  const { data: sibRows, error: sibError } = await supabase.rpc(
    "list_siblings_for_makeup",
    {
      p_student_id: student.id,
      p_name: name,
      p_classroom: classroom,
      p_grade: grade,
    }
  );

  if (sibError) {
    console.error("[lookupStudent] list_siblings_for_makeup:", sibError.message);
  } else {
    siblings = ((sibRows ?? []) as FoundStudent[]).map((s) =>
      normalizeFoundStudent({
        id: s.id,
        name: s.name,
        classroom: s.classroom,
        grade: s.grade as string,
        subjects: s.subjects,
      })
    );
  }

  return { ok: true, student, siblings };
}

function normalizeFoundStudent(row: {
  id: string;
  name: string;
  classroom: string;
  grade: string;
  subjects?: string[] | null;
}): FoundStudent {
  return {
    id: row.id,
    name: row.name,
    classroom: row.classroom,
    grade: row.grade,
    subjects: Array.isArray(row.subjects) ? row.subjects : [],
  };
}

function normalizeScheduledLessons(
  rows: ScheduledLessonOption[]
): ScheduledLessonOption[] {
  return rows.map((row) => ({
    id: row.id,
    lesson_date: String(row.lesson_date).slice(0, 10),
    period: Number(row.period),
    subject: row.subject,
    attendance: row.attendance,
    lesson_classroom: row.lesson_classroom ?? null,
  }));
}

/** 振替元に選べる「出席予定・振替予定」(RPC: list_scheduled_lessons_for_makeup) */
export async function listScheduledLessonsForMakeup(input: {
  studentId: string;
  name: string;
  classroom: string;
  grade: string;
  /** lookupStudent で取得済みの受講教科（匿名ユーザー向け） */
  subjects?: string[];
}): Promise<ListScheduledResult> {
  if (!input.studentId) return { ok: false, error: "生徒情報が不正です。" };
  const name = input.name.trim();
  const classroom = input.classroom.trim();
  const grade = input.grade.trim();
  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);

  if (!isKnownClassroom(classroom, classrooms)) {
    return { ok: false, error: "教室が不正です。" };
  }
  if (!GRADE_LEVELS.includes(grade as GradeLevel)) {
    return { ok: false, error: "学年が不正です。" };
  }

  const { data, error } = await supabase.rpc("list_scheduled_lessons_for_makeup", {
    p_student_id: input.studentId,
    p_name: name,
    p_classroom: classroom,
    p_grade: grade,
  });

  if (error) return { ok: false, error: error.message };

  const lessons = filterLessonsBySubjects(
    normalizeScheduledLessons((data ?? []) as ScheduledLessonOption[]),
    input.subjects
  );
  return { ok: true, lessons };
}

/** 欠席済みで振替未登録の授業 (RPC: list_pending_absences_for_makeup) */
export async function listPendingAbsencesForMakeup(input: {
  studentId: string;
  name: string;
  classroom: string;
  grade: string;
  subjects?: string[];
}): Promise<ListScheduledResult> {
  if (!input.studentId) return { ok: false, error: "生徒情報が不正です。" };
  const name = input.name.trim();
  const classroom = input.classroom.trim();
  const grade = input.grade.trim();
  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);

  if (!isKnownClassroom(classroom, classrooms)) {
    return { ok: false, error: "教室が不正です。" };
  }
  if (!GRADE_LEVELS.includes(grade as GradeLevel)) {
    return { ok: false, error: "学年が不正です。" };
  }

  const { data, error } = await supabase.rpc("list_pending_absences_for_makeup", {
    p_student_id: input.studentId,
    p_name: name,
    p_classroom: classroom,
    p_grade: grade,
  });

  if (error) return { ok: false, error: error.message };

  const lessons = filterLessonsBySubjects(
    normalizeScheduledLessons((data ?? []) as ScheduledLessonOption[]),
    input.subjects
  );
  return { ok: true, lessons };
}

async function isAllowedAttendanceSource(input: {
  studentId: string;
  name: string;
  classroom: string;
  grade: string;
  subjects?: string[];
  lessonDate: string;
  period: number;
  subject: string;
}): Promise<boolean> {
  const scheduled = await listScheduledLessonsForMakeup({
    studentId: input.studentId,
    name: input.name,
    classroom: input.classroom,
    grade: input.grade,
    subjects: input.subjects,
  });

  if (!scheduled.ok) return false;

  return scheduled.lessons.some(
    (l) =>
      l.lesson_date === input.lessonDate &&
      l.period === input.period &&
      l.subject === input.subject
  );
}

async function isAllowedMakeupSource(input: {
  studentId: string;
  name: string;
  classroom: string;
  grade: string;
  subjects?: string[];
  lessonDate: string;
  period: number;
  subject: string;
}): Promise<boolean> {
  const [scheduled, pending] = await Promise.all([
    listScheduledLessonsForMakeup({
      studentId: input.studentId,
      name: input.name,
      classroom: input.classroom,
      grade: input.grade,
      subjects: input.subjects,
    }),
    listPendingAbsencesForMakeup({
      studentId: input.studentId,
      name: input.name,
      classroom: input.classroom,
      grade: input.grade,
      subjects: input.subjects,
    }),
  ]);

  const match = (lessons: ScheduledLessonOption[]) =>
    lessons.some(
      (l) =>
        l.lesson_date === input.lessonDate &&
        l.period === input.period &&
        l.subject === input.subject
    );

  return (
    (scheduled.ok && match(scheduled.lessons)) ||
    (pending.ok && match(pending.lessons))
  );
}

/** 欠席のみ登録 (RPC: mark_scheduled_lesson_absent) */
export async function markLessonAbsentForMakeup(
  input: MarkAbsentInput
): Promise<MarkAbsentResult> {
  if (!input.studentId) return { ok: false, error: "生徒情報が不正です。" };
  if (!isValidDate(input.lessonDate)) {
    return { ok: false, error: "欠席する授業の日付が不正です。" };
  }
  if (
    !Number.isInteger(input.period) ||
    input.period < 1 ||
    input.period > MAX_PERIOD
  ) {
    return { ok: false, error: "欠席コマの指定が不正です。" };
  }
  if (!(COURSE_SUBJECTS as readonly string[]).includes(input.subject)) {
    return { ok: false, error: "教科の指定が不正です。" };
  }

  const verified = await verifyStudentForMakeup(input);
  if (!verified.ok) return verified;

  if (!studentEnrollsInSubject(verified.row.subjects, input.subject)) {
    return {
      ok: false,
      error: "お子様の受講教科以外のコマは欠席登録できません。",
    };
  }

  const sourceAllowed = await isAllowedAttendanceSource({
    studentId: input.studentId,
    name: verified.row.name,
    classroom: verified.row.classroom,
    grade: verified.row.grade,
    subjects: verified.row.subjects,
    lessonDate: input.lessonDate,
    period: input.period,
    subject: input.subject,
  });

  if (!sourceAllowed) {
    return {
      ok: false,
      error:
        "欠席に指定できるのは、振替フォームに表示されている「出席予定」または「振替予定」のコマのみです。",
    };
  }

  const { data, error } = await verified.supabase.rpc(
    "mark_scheduled_lesson_absent",
    {
      p_student_id: input.studentId,
      p_name: verified.row.name,
      p_classroom: verified.row.classroom,
      p_grade: verified.row.grade,
      p_lesson_date: input.lessonDate,
      p_period: input.period,
      p_subject: input.subject,
    }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/apply");
  revalidatePath("/parent");

  return { ok: true, lessonId: String(data) };
}

/** 複数生徒の欠席のみを一括登録 */
export async function markLessonsAbsentBatch(
  inputs: MarkAbsentInput[]
): Promise<MarkAbsentBatchResult> {
  if (inputs.length === 0) {
    return { ok: false, error: "欠席内容がありません。" };
  }

  const lessonIds: string[] = [];
  for (const input of inputs) {
    const result = await markLessonAbsentForMakeup(input);
    if (!result.ok) return result;
    lessonIds.push(result.lessonId);
  }

  return { ok: true, lessonIds };
}

/** 振替予約 (RPC: book_makeup_lesson) */
export async function bookMakeupLesson(input: {
  studentId: string;
  name: string;
  classroom: string;
  grade: string;
  lessonDate: string;
  period: number;
  subject: string;
  sourceLessonDate: string;
  sourcePeriod: number;
  sourceSubject: string;
  textMemo?: string;
  /** 振替先の実施会場。省略時はお子様の所属教室 */
  lessonClassroom?: string | null;
}): Promise<BookResult> {
  if (!input.studentId) return { ok: false, error: "生徒情報が不正です。" };
  if (!isValidDate(input.lessonDate)) {
    return { ok: false, error: "振替先の日付が不正です。" };
  }
  if (!isValidDate(input.sourceLessonDate)) {
    return { ok: false, error: "欠席する授業の日付が不正です。" };
  }
  if (
    !Number.isInteger(input.period) ||
    input.period < 1 ||
    input.period > MAX_PERIOD
  ) {
    return { ok: false, error: "コマが不正です。" };
  }
  if (
    !Number.isInteger(input.sourcePeriod) ||
    input.sourcePeriod < 1 ||
    input.sourcePeriod > MAX_PERIOD
  ) {
    return { ok: false, error: "欠席コマの指定が不正です。" };
  }
  if (!(COURSE_SUBJECTS as readonly string[]).includes(input.subject)) {
    return { ok: false, error: "教科が不正です。" };
  }
  if (!(COURSE_SUBJECTS as readonly string[]).includes(input.sourceSubject)) {
    return { ok: false, error: "欠席の教科の指定が不正です。" };
  }

  const today = todayIso();
  const maxLesson = shiftDate(today, MAKEUP_TARGET_MAX_DAYS_AHEAD);
  if (input.lessonDate < today || input.lessonDate > maxLesson) {
    return {
      ok: false,
      error: `振替先の日付は今日から ${MAKEUP_TARGET_MAX_DAYS_AHEAD} 日以内で選んでください。`,
    };
  }

  const verified = await verifyStudentForMakeup(input);
  if (!verified.ok) return verified;

  if (
    !studentEnrollsInSubject(verified.row.subjects, input.subject) ||
    !studentEnrollsInSubject(verified.row.subjects, input.sourceSubject)
  ) {
    return {
      ok: false,
      error: "お子様の受講教科以外のコマは振替先に選べません。",
    };
  }

  const sourceAllowed = await isAllowedMakeupSource({
    studentId: input.studentId,
    name: verified.row.name,
    classroom: verified.row.classroom,
    grade: verified.row.grade,
    subjects: verified.row.subjects,
    lessonDate: input.sourceLessonDate,
    period: input.sourcePeriod,
    subject: input.sourceSubject,
  });

  if (!sourceAllowed) {
    return {
      ok: false,
      error:
        "振替の元に指定できる授業が見つかりません。一覧にない場合は教室までお問い合わせください。",
    };
  }

  const lessonVenue = (input.lessonClassroom ?? "").trim();
  const classrooms = await fetchClassrooms(verified.supabase);
  if (lessonVenue && !isKnownClassroom(lessonVenue, classrooms)) {
    return { ok: false, error: "実施会場の指定が不正です。" };
  }

  const { data, error } = await verified.supabase.rpc("book_makeup_lesson", {
    p_student_id: input.studentId,
    p_lesson_date: input.lessonDate,
    p_period: input.period,
    p_subject: input.subject,
    p_source_lesson_date: input.sourceLessonDate,
    p_source_period: input.sourcePeriod,
    p_source_subject: input.sourceSubject,
    p_text_memo: input.textMemo?.trim() || null,
    p_lesson_classroom: lessonVenue || null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // 予約変更があったので、講師側ダッシュボードのキャッシュを破棄
  revalidatePath("/");
  revalidatePath("/apply");

  return { ok: true, lessonId: String(data) };
}

export type MakeupBookingInput = {
  studentId: string;
  name: string;
  classroom: string;
  grade: string;
  lessonDate: string;
  period: number;
  subject: string;
  sourceLessonDate: string;
  sourcePeriod: number;
  sourceSubject: string;
  textMemo?: string;
  lessonClassroom?: string | null;
};

async function validateMakeupBooking(
  input: MakeupBookingInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.studentId) return { ok: false, error: "生徒情報が不正です。" };
  if (!isValidDate(input.lessonDate)) {
    return { ok: false, error: "振替先の日付が不正です。" };
  }
  if (!isValidDate(input.sourceLessonDate)) {
    return { ok: false, error: "欠席する授業の日付が不正です。" };
  }
  if (
    !Number.isInteger(input.period) ||
    input.period < 1 ||
    input.period > MAX_PERIOD
  ) {
    return { ok: false, error: "コマが不正です。" };
  }
  if (
    !Number.isInteger(input.sourcePeriod) ||
    input.sourcePeriod < 1 ||
    input.sourcePeriod > MAX_PERIOD
  ) {
    return { ok: false, error: "欠席コマの指定が不正です。" };
  }
  if (!(COURSE_SUBJECTS as readonly string[]).includes(input.subject)) {
    return { ok: false, error: "教科が不正です。" };
  }
  if (!(COURSE_SUBJECTS as readonly string[]).includes(input.sourceSubject)) {
    return { ok: false, error: "欠席の教科の指定が不正です。" };
  }

  const today = todayIso();
  const maxLesson = shiftDate(today, MAKEUP_TARGET_MAX_DAYS_AHEAD);
  if (input.lessonDate < today || input.lessonDate > maxLesson) {
    return {
      ok: false,
      error: `振替先の日付は今日から ${MAKEUP_TARGET_MAX_DAYS_AHEAD} 日以内で選んでください。`,
    };
  }

  const lessonVenue = (input.lessonClassroom ?? "").trim();
  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);

  if (lessonVenue && !isKnownClassroom(lessonVenue, classrooms)) {
    return { ok: false, error: "実施会場の指定が不正です。" };
  }

  const verified = await verifyStudentForMakeup(input);
  if (!verified.ok) return verified;

  if (
    !studentEnrollsInSubject(verified.row.subjects, input.subject) ||
    !studentEnrollsInSubject(verified.row.subjects, input.sourceSubject)
  ) {
    return {
      ok: false,
      error: "お子様の受講教科以外のコマは振替先に選べません。",
    };
  }

  const sourceAllowed = await isAllowedMakeupSource({
    studentId: input.studentId,
    name: verified.row.name,
    classroom: verified.row.classroom,
    grade: verified.row.grade,
    subjects: verified.row.subjects,
    lessonDate: input.sourceLessonDate,
    period: input.sourcePeriod,
    subject: input.sourceSubject,
  });

  if (!sourceAllowed) {
    return {
      ok: false,
      error:
        "振替の元に指定できる授業が見つかりません。一覧にない場合は教室までお問い合わせください。",
    };
  }

  return { ok: true };
}

/** 複数生徒の振替を一括登録（兄弟など） */
export async function bookMakeupLessonsBatch(
  bookings: MakeupBookingInput[]
): Promise<BatchBookResult> {
  if (bookings.length === 0) {
    return { ok: false, error: "振替内容がありません。" };
  }

  for (const b of bookings) {
    const v = await validateMakeupBooking(b);
    if (!v.ok) return v;
  }

  const payload = bookings.map((b) => ({
    student_id: b.studentId,
    lesson_date: b.lessonDate,
    period: b.period,
    subject: b.subject,
    source_lesson_date: b.sourceLessonDate,
    source_period: b.sourcePeriod,
    source_subject: b.sourceSubject,
    text_memo: b.textMemo?.trim() || null,
    lesson_classroom: (b.lessonClassroom ?? "").trim() || null,
  }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_makeup_lessons_batch", {
    p_bookings: payload,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/apply");
  revalidatePath("/parent");

  return { ok: true, lessonIds: (data ?? []) as string[] };
}
