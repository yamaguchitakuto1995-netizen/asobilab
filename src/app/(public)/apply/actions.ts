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
  | { ok: true; student: FoundStudent }
  | { ok: false; error: string };

export type BookResult =
  | { ok: true; lessonId: string }
  | { ok: false; error: string };

export type ScheduledLessonOption = {
  id: string;
  lesson_date: string;
  period: number;
  subject: string;
};

export type ListScheduledResult =
  | { ok: true; lessons: ScheduledLessonOption[] }
  | { ok: false; error: string };

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

  return { ok: true, student: list[0] };
}

/** 振替元に選べる「出席予定」(RPC: list_scheduled_lessons_for_makeup) */
export async function listScheduledLessonsForMakeup(input: {
  studentId: string;
  name: string;
  classroom: string;
  grade: string;
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

  const lessons = (data ?? []) as ScheduledLessonOption[];
  return { ok: true, lessons };
}

/** 振替予約 (RPC: book_makeup_lesson) */
export async function bookMakeupLesson(input: {
  studentId: string;
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

  const lessonVenue = (input.lessonClassroom ?? "").trim();
  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);

  if (
    lessonVenue &&
    !isKnownClassroom(lessonVenue, classrooms)
  ) {
    return { ok: false, error: "実施会場の指定が不正です。" };
  }

  const { data: studentRow } = await supabase
    .from("students")
    .select("name, classroom, grade")
    .eq("id", input.studentId)
    .maybeSingle<{ name: string; classroom: string | null; grade: string }>();

  if (!studentRow?.classroom) {
    return {
      ok: false,
      error: "生徒情報を確認できませんでした。教室にお問い合わせください。",
    };
  }

  const scheduled = await listScheduledLessonsForMakeup({
    studentId: input.studentId,
    name: studentRow.name,
    classroom: studentRow.classroom,
    grade: studentRow.grade,
  });

  if (!scheduled.ok) {
    return { ok: false, error: scheduled.error };
  }

  const sourceAllowed = scheduled.lessons.some(
    (l) =>
      l.lesson_date === input.sourceLessonDate &&
      l.period === input.sourcePeriod &&
      l.subject === input.sourceSubject
  );

  if (!sourceAllowed) {
    return {
      ok: false,
      error:
        "欠席に指定できるのは、振替フォームに表示されている「出席予定」のコマのみです。一覧にない場合は教室までお問い合わせください。",
    };
  }

  const { data, error } = await supabase.rpc("book_makeup_lesson", {
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
