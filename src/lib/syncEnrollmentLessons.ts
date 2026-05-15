import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIso } from "@/lib/date";
import {
  ENROLLMENT_SCHEDULE_HORIZON_DAYS,
  lessonDatesMatchingCapacity,
} from "@/lib/enrollmentSchedule";
import type { LessonCapacity } from "@/lib/types";

export type SyncEnrollmentLessonsParams = {
  studentId: string;
  teacherId: string;
  classroom: string | null;
  subjects: string[];
  robotCapacityId: string | null;
  progCapacityId: string | null;
};

/**
 * 将来の「登録から作成した出席予定」を消し、現在の定例コマ設定に基づき再作成する。
 * 手動で追加した scheduled は、日付・コマ・教科が重なる場合のみスキップする。
 */
export async function syncEnrollmentLessons(
  supabase: SupabaseClient,
  p: SyncEnrollmentLessonsParams
): Promise<{ error: string | null }> {
  const today = todayIso();

  const { error: delErr } = await supabase
    .from("lessons")
    .delete()
    .eq("student_id", p.studentId)
    .eq("created_from_enrollment", true)
    .eq("status", "scheduled")
    .gte("lesson_date", today);

  if (delErr) {
    return { error: delErr.message };
  }

  if (!p.classroom) {
    return { error: null };
  }

  const ids = [p.robotCapacityId, p.progCapacityId].filter(
    (x): x is string => typeof x === "string" && x.length > 0
  );
  if (ids.length === 0) {
    return { error: null };
  }

  const { data: caps, error: capErr } = await supabase
    .from("lesson_capacities")
    .select("id, classroom, day_of_week, week_ordinals, period, subject")
    .in("id", ids);

  if (capErr) {
    return { error: capErr.message };
  }

  const byId = new Map((caps ?? []).map((c) => [c.id, c as LessonCapacity]));

  const toSchedule: LessonCapacity[] = [];
  const subj = new Set(p.subjects);

  if (p.robotCapacityId && subj.has("ロボット")) {
    const c = byId.get(p.robotCapacityId);
    if (c && c.classroom === p.classroom && c.subject === "ロボット") {
      toSchedule.push(c);
    }
  }
  if (p.progCapacityId && subj.has("プログラミング")) {
    const c = byId.get(p.progCapacityId);
    if (c && c.classroom === p.classroom && c.subject === "プログラミング") {
      toSchedule.push(c);
    }
  }

  if (toSchedule.length === 0) {
    return { error: null };
  }

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

  const rows: Record<string, unknown>[] = [];

  for (const cap of toSchedule) {
    const dates = lessonDatesMatchingCapacity(
      cap,
      today,
      ENROLLMENT_SCHEDULE_HORIZON_DAYS
    );
    for (const lesson_date of dates) {
      const key = `${lesson_date}|${cap.period}|${cap.subject}`;
      if (occupied.has(key)) continue;
      occupied.add(key);
      rows.push({
        student_id: p.studentId,
        teacher_id: p.teacherId,
        lesson_date,
        period: cap.period,
        attendance: "present",
        subject: cap.subject,
        status: "scheduled",
        created_from_enrollment: true,
        textbook: null,
        text_memo: null,
        lesson_classroom: null,
      });
    }
  }

  const chunk = 50;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error: insErr } = await supabase.from("lessons").insert(slice);
    if (insErr) {
      return { error: insErr.message };
    }
  }

  return { error: null };
}
