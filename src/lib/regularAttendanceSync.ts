import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIso } from "@/lib/date";
import { dowOf } from "@/lib/days";
import { weekdayOccurrenceInMonth } from "@/lib/enrollmentSchedule";
import type { ClassroomPeriodTime, LessonCapacity } from "@/lib/types";

export type PeriodTimeSlot = Pick<
  ClassroomPeriodTime,
  "classroom" | "lesson_date" | "period" | "subject"
>;

type StudentEnrollment = {
  id: string;
  created_by: string;
  classroom: string | null;
  subjects: string[];
  enrollment_robot_capacity_id: string | null;
  enrollment_prog_capacity_id: string | null;
};

type LessonInsert = {
  student_id: string;
  teacher_id: string;
  lesson_date: string;
  period: number;
  attendance: "present";
  subject: string;
  status: "scheduled";
  created_from_enrollment: true;
  textbook: null;
  text_memo: null;
  lesson_classroom: null;
};

/** コマ時刻1行が、生徒のレギュラー出席コマ（振替枠マスタ）と一致するか */
export function periodTimeMatchesCapacity(
  pt: PeriodTimeSlot,
  cap: Pick<
    LessonCapacity,
    "classroom" | "day_of_week" | "week_ordinals" | "period" | "subject"
  >
): boolean {
  if (pt.classroom !== cap.classroom) return false;
  if (pt.period !== cap.period) return false;
  if (dowOf(pt.lesson_date) !== cap.day_of_week) return false;
  if (!cap.week_ordinals.includes(weekdayOccurrenceInMonth(pt.lesson_date))) {
    return false;
  }
  if (pt.subject !== null && pt.subject !== cap.subject) return false;
  return true;
}

function matchingEnrollmentsForPeriodTime(
  pt: PeriodTimeSlot,
  student: StudentEnrollment,
  capsById: Map<string, LessonCapacity>
): { subject: string; capacity: LessonCapacity }[] {
  if (!student.classroom || student.classroom !== pt.classroom) return [];

  const out: { subject: string; capacity: LessonCapacity }[] = [];
  const subj = new Set(student.subjects);

  if (
    student.enrollment_robot_capacity_id &&
    subj.has("ロボット")
  ) {
    const cap = capsById.get(student.enrollment_robot_capacity_id);
    if (cap && periodTimeMatchesCapacity(pt, cap)) {
      out.push({ subject: "ロボット", capacity: cap });
    }
  }

  if (
    student.enrollment_prog_capacity_id &&
    subj.has("プログラミング")
  ) {
    const cap = capsById.get(student.enrollment_prog_capacity_id);
    if (cap && periodTimeMatchesCapacity(pt, cap)) {
      out.push({ subject: "プログラミング", capacity: cap });
    }
  }

  return out;
}

function lessonKey(
  studentId: string,
  lessonDate: string,
  period: number,
  subject: string
): string {
  return `${studentId}|${lessonDate}|${period}|${subject}`;
}

async function loadStudentsForClassrooms(
  supabase: SupabaseClient,
  classrooms: string[]
): Promise<StudentEnrollment[]> {
  if (classrooms.length === 0) return [];

  const { data, error } = await supabase
    .from("students")
    .select(
      "id, created_by, classroom, subjects, enrollment_robot_capacity_id, enrollment_prog_capacity_id"
    )
    .in("classroom", classrooms)
    .or(
      "enrollment_robot_capacity_id.not.is.null,enrollment_prog_capacity_id.not.is.null"
    );

  if (error) throw new Error(error.message);
  return (data ?? []) as StudentEnrollment[];
}

async function loadCapacitiesForStudents(
  supabase: SupabaseClient,
  students: StudentEnrollment[]
): Promise<Map<string, LessonCapacity>> {
  const ids = [
    ...new Set(
      students.flatMap((s) =>
        [s.enrollment_robot_capacity_id, s.enrollment_prog_capacity_id].filter(
          (x): x is string => typeof x === "string" && x.length > 0
        )
      )
    ),
  ];
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("lesson_capacities")
    .select("id, classroom, day_of_week, week_ordinals, period, subject")
    .in("id", ids);

  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((c) => [c.id, c as LessonCapacity]));
}

async function loadOccupiedLessonKeys(
  supabase: SupabaseClient,
  studentIds: string[],
  fromDate: string
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("lessons")
    .select("student_id, lesson_date, period, subject")
    .in("student_id", studentIds)
    .eq("status", "scheduled")
    .gte("lesson_date", fromDate);

  if (error) throw new Error(error.message);

  return new Set(
    (data ?? []).map((r) =>
      lessonKey(
        r.student_id,
        r.lesson_date,
        r.period ?? 0,
        r.subject ?? ""
      )
    )
  );
}

async function insertLessonRows(
  supabase: SupabaseClient,
  rows: LessonInsert[]
): Promise<void> {
  const chunk = 50;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await supabase.from("lessons").insert(slice);
    if (error) throw new Error(error.message);
  }
}

/**
 * コマ時刻が追加・更新されたとき、該当するレギュラー出席コマの生徒に出席予定を作成する。
 */
export async function createScheduledLessonsForPeriodTimes(
  supabase: SupabaseClient,
  periodTimes: PeriodTimeSlot[],
  teacherIdFallback: string
): Promise<{ created: number; error: string | null }> {
  const today = todayIso();
  const futureSlots = periodTimes.filter((pt) => pt.lesson_date >= today);
  if (futureSlots.length === 0) {
    return { created: 0, error: null };
  }

  try {
    const classrooms = [...new Set(futureSlots.map((pt) => pt.classroom))];
    const students = await loadStudentsForClassrooms(supabase, classrooms);
    if (students.length === 0) {
      return { created: 0, error: null };
    }

    const capsById = await loadCapacitiesForStudents(supabase, students);
    const studentIds = students.map((s) => s.id);
    const occupied = await loadOccupiedLessonKeys(supabase, studentIds, today);

    const rows: LessonInsert[] = [];

    for (const pt of futureSlots) {
      for (const student of students) {
        const matches = matchingEnrollmentsForPeriodTime(pt, student, capsById);
        for (const { subject, capacity } of matches) {
          const key = lessonKey(student.id, pt.lesson_date, capacity.period, subject);
          if (occupied.has(key)) continue;
          occupied.add(key);
          rows.push({
            student_id: student.id,
            teacher_id: student.created_by || teacherIdFallback,
            lesson_date: pt.lesson_date,
            period: capacity.period,
            attendance: "present",
            subject,
            status: "scheduled",
            created_from_enrollment: true,
            textbook: null,
            text_memo: null,
            lesson_classroom: null,
          });
        }
      }
    }

    await insertLessonRows(supabase, rows);
    return { created: rows.length, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "出席予定の作成に失敗しました。";
    return { created: 0, error: msg };
  }
}

export type SyncStudentRegularAttendanceParams = {
  studentId: string;
  teacherId: string;
  classroom: string | null;
  subjects: string[];
  robotCapacityId: string | null;
  progCapacityId: string | null;
};

/**
 * 生徒のレギュラー出席コマ設定に合わせ、登録済みコマ時刻から出席予定を再作成する。
 */
export async function syncStudentRegularAttendance(
  supabase: SupabaseClient,
  p: SyncStudentRegularAttendanceParams
): Promise<{ created: number; error: string | null }> {
  const today = todayIso();

  const { error: delErr } = await supabase
    .from("lessons")
    .delete()
    .eq("student_id", p.studentId)
    .eq("created_from_enrollment", true)
    .eq("status", "scheduled")
    .gte("lesson_date", today);

  if (delErr) {
    return { created: 0, error: delErr.message };
  }

  if (!p.classroom) {
    return { created: 0, error: null };
  }

  const ids = [p.robotCapacityId, p.progCapacityId].filter(
    (x): x is string => typeof x === "string" && x.length > 0
  );
  if (ids.length === 0) {
    return { created: 0, error: null };
  }

  const { data: caps, error: capErr } = await supabase
    .from("lesson_capacities")
    .select("id, classroom, day_of_week, week_ordinals, period, subject")
    .in("id", ids);

  if (capErr) {
    return { created: 0, error: capErr.message };
  }

  const byId = new Map((caps ?? []).map((c) => [c.id, c as LessonCapacity]));
  const subj = new Set(p.subjects);
  const activeCaps: LessonCapacity[] = [];

  if (p.robotCapacityId && subj.has("ロボット")) {
    const c = byId.get(p.robotCapacityId);
    if (c && c.classroom === p.classroom && c.subject === "ロボット") {
      activeCaps.push(c);
    }
  }
  if (p.progCapacityId && subj.has("プログラミング")) {
    const c = byId.get(p.progCapacityId);
    if (c && c.classroom === p.classroom && c.subject === "プログラミング") {
      activeCaps.push(c);
    }
  }

  if (activeCaps.length === 0) {
    return { created: 0, error: null };
  }

  const { data: periodTimes, error: ptErr } = await supabase
    .from("classroom_period_times")
    .select("classroom, lesson_date, period, subject")
    .eq("classroom", p.classroom)
    .gte("lesson_date", today);

  if (ptErr) {
    return { created: 0, error: ptErr.message };
  }

  const student: StudentEnrollment = {
    id: p.studentId,
    created_by: p.teacherId,
    classroom: p.classroom,
    subjects: p.subjects,
    enrollment_robot_capacity_id: p.robotCapacityId,
    enrollment_prog_capacity_id: p.progCapacityId,
  };
  const capsById = byId;

  const { data: existing } = await supabase
    .from("lessons")
    .select("lesson_date, period, subject")
    .eq("student_id", p.studentId)
    .eq("status", "scheduled")
    .gte("lesson_date", today);

  const occupied = new Set(
    (existing ?? []).map(
      (r) => `${r.lesson_date}|${r.period}|${r.subject ?? ""}`
    )
  );

  const rows: LessonInsert[] = [];

  for (const pt of (periodTimes ?? []) as PeriodTimeSlot[]) {
    const matches = matchingEnrollmentsForPeriodTime(pt, student, capsById);
    for (const { subject, capacity } of matches) {
      const key = `${pt.lesson_date}|${capacity.period}|${subject}`;
      if (occupied.has(key)) continue;
      occupied.add(key);
      rows.push({
        student_id: p.studentId,
        teacher_id: p.teacherId,
        lesson_date: pt.lesson_date,
        period: capacity.period,
        attendance: "present",
        subject,
        status: "scheduled",
        created_from_enrollment: true,
        textbook: null,
        text_memo: null,
        lesson_classroom: null,
      });
    }
  }

  try {
    await insertLessonRows(supabase, rows);
    return { created: rows.length, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "出席予定の作成に失敗しました。";
    return { created: 0, error: msg };
  }
}

/**
 * コマ時刻を削除したとき、自動作成した出席予定も削除する。
 */
export async function removeEnrollmentLessonsForPeriodTime(
  supabase: SupabaseClient,
  pt: PeriodTimeSlot
): Promise<{ removed: number; error: string | null }> {
  const today = todayIso();
  if (pt.lesson_date < today) {
    return { removed: 0, error: null };
  }

  const { data: students, error: stErr } = await supabase
    .from("students")
    .select("id")
    .eq("classroom", pt.classroom);

  if (stErr) {
    return { removed: 0, error: stErr.message };
  }

  const studentIds = (students ?? []).map((s) => s.id);
  if (studentIds.length === 0) {
    return { removed: 0, error: null };
  }

  let query = supabase
    .from("lessons")
    .delete()
    .in("student_id", studentIds)
    .eq("lesson_date", pt.lesson_date)
    .eq("period", pt.period)
    .eq("status", "scheduled")
    .eq("created_from_enrollment", true);

  if (pt.subject) {
    query = query.eq("subject", pt.subject);
  }

  const { data, error } = await query.select("id");
  if (error) {
    return { removed: 0, error: error.message };
  }

  return { removed: (data ?? []).length, error: null };
}

/** 登録済みの将来コマ時刻すべてから、出席予定を一括再作成する（管理者向け） */
export async function resyncAllRegularAttendance(
  supabase: SupabaseClient,
  teacherIdFallback: string
): Promise<{ created: number; error: string | null }> {
  const today = todayIso();

  const { data: periodTimes, error: ptErr } = await supabase
    .from("classroom_period_times")
    .select("classroom, lesson_date, period, subject")
    .gte("lesson_date", today);

  if (ptErr) {
    return { created: 0, error: ptErr.message };
  }

  const { data: students, error: stErr } = await supabase
    .from("students")
    .select("id")
    .or(
      "enrollment_robot_capacity_id.not.is.null,enrollment_prog_capacity_id.not.is.null"
    );

  if (stErr) {
    return { created: 0, error: stErr.message };
  }

  const studentIds = (students ?? []).map((s) => s.id);
  if (studentIds.length > 0) {
    const { error: delErr } = await supabase
      .from("lessons")
      .delete()
      .in("student_id", studentIds)
      .eq("created_from_enrollment", true)
      .eq("status", "scheduled")
      .gte("lesson_date", today);

    if (delErr) {
      return { created: 0, error: delErr.message };
    }
  }

  return createScheduledLessonsForPeriodTimes(
    supabase,
    (periodTimes ?? []) as PeriodTimeSlot[],
    teacherIdFallback
  );
}
