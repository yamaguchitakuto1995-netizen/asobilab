"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/requireRole";
import { fetchClassrooms, isKnownClassroom } from "@/lib/classrooms";
import { isValidDate } from "@/lib/date";
import { fetchClassroomPeriodTimes, resolveClassroomPeriodTime } from "@/lib/periodTimes";
import {
  isSameMakeupSourceAndTarget,
  isStudentSlotOccupied,
  sameMakeupSourceAndTargetMessage,
  studentSlotOccupiedMessage,
} from "@/lib/registrationDeadlines";
import { createClient } from "@/lib/supabase/server";
import {
  notifyLineAbsenceRegistered,
  notifyLineMakeupRegistered,
} from "@/lib/appLineNotifications";
import {
  listAttendanceSourceLessonsForStaff,
  listPendingAbsenceLessonsForStaff,
  type StaffLessonOption,
  validateMakeupTargetDateForStaff,
} from "@/lib/staffMakeupLessons";
import {
  COURSE_SUBJECTS,
  MAX_PERIOD,
  studentEnrollsInSubject,
  studentEnrolledSubjects,
} from "@/lib/types";

export type StaffLessonListResult =
  | {
      ok: true;
      attendanceSources: StaffLessonOption[];
      pendingAbsences: StaffLessonOption[];
      subjects: string[];
    }
  | { ok: false; error: string };

export type StaffMarkAbsentResult =
  | { ok: true; lessonId: string }
  | { ok: false; error: string };

export type StaffBookMakeupResult =
  | { ok: true; lessonId: string }
  | { ok: false; error: string };

async function requireStaff() {
  const auth = await requireAdminUser();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  return { ok: true as const, user: auth.user };
}

async function loadStudentForStaff(studentId: string) {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { data: student, error } = await supabase
    .from("students")
    .select("id, name, classroom, subjects")
    .eq("id", studentId)
    .maybeSingle<{
      id: string;
      name: string;
      classroom: string | null;
      subjects: string[] | null;
    }>();

  if (error) return { ok: false as const, error: error.message };
  if (!student) return { ok: false as const, error: "生徒が見つかりません。" };
  if (!student.classroom) {
    return {
      ok: false as const,
      error: "所属教室が未設定のため、欠席・振替を登録できません。",
    };
  }

  return {
    ok: true as const,
    supabase,
    student,
    subjects: studentEnrolledSubjects(student.subjects),
  };
}

function revalidateStudentPaths(studentId: string) {
  revalidatePath("/");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/apply");
  revalidatePath("/schedule");
  revalidatePath("/parent");
}

/** 講師向け: 欠席・振替の元になる予定一覧 */
export async function listStaffMakeupLessons(input: {
  studentId: string;
  fromDate?: string;
}): Promise<StaffLessonListResult> {
  const loaded = await loadStudentForStaff(input.studentId);
  if (!loaded.ok) return loaded;

  const fromDate = input.fromDate ?? new Date().toISOString().slice(0, 10);

  try {
    const [attendanceSources, pendingAbsences] = await Promise.all([
      listAttendanceSourceLessonsForStaff(
        loaded.supabase,
        loaded.student.id,
        fromDate
      ),
      listPendingAbsenceLessonsForStaff(loaded.supabase, loaded.student.id),
    ]);

    const filterBySubject = (rows: StaffLessonOption[]) =>
      rows.filter((row) =>
        studentEnrollsInSubject(loaded.subjects, row.subject)
      );

    return {
      ok: true,
      attendanceSources: filterBySubject(attendanceSources),
      pendingAbsences: filterBySubject(pendingAbsences),
      subjects: loaded.subjects,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "予定の取得に失敗しました。",
    };
  }
}

/** 講師向け: 欠席のみ登録（口頭連絡用・保護者の締切は適用しない） */
export async function markLessonAbsentForStaff(input: {
  studentId: string;
  lessonDate: string;
  period: number;
  subject: string;
}): Promise<StaffMarkAbsentResult> {
  const loaded = await loadStudentForStaff(input.studentId);
  if (!loaded.ok) return loaded;

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
  if (!studentEnrollsInSubject(loaded.subjects, input.subject)) {
    return {
      ok: false,
      error: "受講教科以外のコマは欠席登録できません。",
    };
  }

  const sources = await listAttendanceSourceLessonsForStaff(
    loaded.supabase,
    input.studentId,
    input.lessonDate
  );
  const allowed = sources.some(
    (l) =>
      l.lesson_date === input.lessonDate &&
      l.period === input.period &&
      l.subject === input.subject
  );
  if (!allowed) {
    return {
      ok: false,
      error:
        "欠席にできるのは「出席予定」または「振替予定」のコマのみです。",
    };
  }

  const { data, error } = await loaded.supabase
    .from("lessons")
    .update({
      attendance: "absent",
      updated_at: new Date().toISOString(),
    })
    .eq("student_id", input.studentId)
    .eq("lesson_date", input.lessonDate)
    .eq("period", input.period)
    .eq("subject", input.subject)
    .eq("status", "scheduled")
    .in("attendance", ["present", "makeup"])
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data?.id) {
    return {
      ok: false,
      error: "欠席登録に失敗しました。対象の予定を確認してください。",
    };
  }

  revalidateStudentPaths(input.studentId);
  notifyLineAbsenceRegistered({
    studentName: loaded.student.name,
    slot: {
      lessonDate: input.lessonDate,
      period: input.period,
      subject: input.subject,
    },
    source: "職員登録",
  });
  return { ok: true, lessonId: data.id };
}

/** 講師向け: 振替登録（口頭連絡用・保護者の締切は適用しない） */
export async function bookMakeupLessonForStaff(input: {
  studentId: string;
  lessonDate: string;
  period: number;
  subject: string;
  sourceLessonDate: string;
  sourcePeriod: number;
  sourceSubject: string;
  lessonClassroom?: string | null;
  textMemo?: string;
}): Promise<StaffBookMakeupResult> {
  const loaded = await loadStudentForStaff(input.studentId);
  if (!loaded.ok) return loaded;

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

  const targetDateCheck = validateMakeupTargetDateForStaff(
    input.sourceLessonDate,
    input.lessonDate
  );
  if (!targetDateCheck.ok) return targetDateCheck;

  if (
    isSameMakeupSourceAndTarget(
      {
        lessonDate: input.sourceLessonDate,
        period: input.sourcePeriod,
        subject: input.sourceSubject,
      },
      {
        lessonDate: input.lessonDate,
        period: input.period,
        subject: input.subject,
      }
    )
  ) {
    return { ok: false, error: sameMakeupSourceAndTargetMessage() };
  }

  if (
    !studentEnrollsInSubject(loaded.subjects, input.subject) ||
    !studentEnrollsInSubject(loaded.subjects, input.sourceSubject)
  ) {
    return {
      ok: false,
      error: "受講教科以外のコマは振替先に選べません。",
    };
  }

  const [attendanceSources, pendingAbsences] = await Promise.all([
    listAttendanceSourceLessonsForStaff(
      loaded.supabase,
      input.studentId,
      input.sourceLessonDate
    ),
    listPendingAbsenceLessonsForStaff(loaded.supabase, input.studentId),
  ]);

  const allSources = [...attendanceSources, ...pendingAbsences];
  const sourceAllowed = allSources.some(
    (l) =>
      l.lesson_date === input.sourceLessonDate &&
      l.period === input.sourcePeriod &&
      l.subject === input.sourceSubject
  );
  if (!sourceAllowed) {
    return {
      ok: false,
      error: "振替の元に指定できる授業が見つかりません。",
    };
  }

  const targetTaken = isStudentSlotOccupied(allSources, {
    lessonDate: input.lessonDate,
    period: input.period,
    subject: input.subject,
    excludeSource: {
      lessonDate: input.sourceLessonDate,
      period: input.sourcePeriod,
      subject: input.sourceSubject,
    },
  });
  if (targetTaken) {
    return { ok: false, error: studentSlotOccupiedMessage() };
  }

  const lessonVenue = (input.lessonClassroom ?? "").trim();
  const classrooms = await fetchClassrooms(loaded.supabase);
  if (lessonVenue && !isKnownClassroom(lessonVenue, classrooms)) {
    return { ok: false, error: "実施会場の指定が不正です。" };
  }

  const periodTimes = await fetchClassroomPeriodTimes(loaded.supabase);
  const targetTimeRow = resolveClassroomPeriodTime(periodTimes, {
    classroom: lessonVenue || loaded.student.classroom,
    lessonDate: input.lessonDate,
    period: input.period,
    subject: input.subject,
  });
  if (
    input.lessonDate === new Date().toISOString().slice(0, 10) &&
    targetTimeRow
  ) {
    const startMs = new Date(
      `${input.lessonDate}T${targetTimeRow.start_time.slice(0, 8)}+09:00`
    ).getTime();
    if (Date.now() >= startMs) {
      return {
        ok: false,
        error: "振替先の授業はすでに開始しているため、登録できません。",
      };
    }
  }

  const memo =
    input.textMemo?.trim() ||
    "職員登録（振替）";

  const { data, error } = await loaded.supabase.rpc("book_makeup_lesson", {
    p_student_id: input.studentId,
    p_lesson_date: input.lessonDate,
    p_period: input.period,
    p_subject: input.subject,
    p_source_lesson_date: input.sourceLessonDate,
    p_source_period: input.sourcePeriod,
    p_source_subject: input.sourceSubject,
    p_text_memo: memo,
    p_lesson_classroom: lessonVenue || null,
    p_allow_over_capacity: true,
  });

  if (error) return { ok: false, error: error.message };

  revalidateStudentPaths(input.studentId);
  notifyLineMakeupRegistered({
    studentName: loaded.student.name,
    sourceSlot: {
      lessonDate: input.sourceLessonDate,
      period: input.sourcePeriod,
      subject: input.sourceSubject,
    },
    targetSlot: {
      lessonDate: input.lessonDate,
      period: input.period,
      subject: input.subject,
    },
    source: "職員登録",
  });
  return { ok: true, lessonId: String(data) };
}
