import Link from "next/link";
import { AttendanceBadge } from "@/components/AttendanceBadge";
import { ClassroomBadge } from "@/components/ClassroomBadge";
import { DailyLessonBoard } from "@/components/DailyLessonBoard";
import type { DailyLessonItem } from "@/components/DailyLessonCarousel";
import { classroomNames, fetchClassrooms } from "@/lib/classrooms";
import { DailyDateNav } from "@/components/DailyDateNav";
import { DashboardDateCalendar } from "@/components/DashboardDateCalendar";
import { PageHeader } from "@/components/PageHeader";
import { SubjectChip } from "@/components/SubjectChip";
import {
  formatDateLong,
  formatDateShort,
  isValidDate,
  todayIso,
} from "@/lib/date";
import {
  fetchClassroomPeriodTimes,
  formatTimeRange,
  resolveClassroomPeriodTime,
} from "@/lib/periodTimes";
import { applyAnnualGradePromotionIfNeeded } from "@/lib/applyAnnualGradePromotion";
import { getCurrentUser } from "@/lib/auth";
import { fetchPreviousLessonMemos } from "@/lib/previousLessonMemos";
import { ensureScheduledLessonsForDate } from "@/lib/regularAttendanceSync";
import { isLessonAfterWithdrawal } from "@/lib/studentWithdrawal";
import { createClient } from "@/lib/supabase/server";
import {
  SCHEDULED_ATTENDANCE_LABEL,
  effectiveLessonClassroom,
  periodLabel,
  type ClassroomPeriodTime,
  type Lesson,
} from "@/lib/types";

type LessonWithStudent = Lesson & {
  students: {
    id: string;
    name: string;
    grade: string;
    classroom: string | null;
    next_text_robot: string | null;
    next_text_programming: string | null;
    next_text_robot_course?: string | null;
    next_text_robot_text?: string | null;
    next_text_programming_course?: string | null;
    next_text_programming_text?: string | null;
    persistent_memo?: string | null;
    note?: string | null;
    withdrawal_until_ym?: string | null;
    promotion_scheduled_ym?: string | null;
    promotion_type?: "normal" | "skip_grade";
    course_start_robot_ym?: string | null;
    course_start_programming_ym?: string | null;
  } | null;
};

type SearchParams = Promise<{ date?: string; cal_ym?: string }>;

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const today = todayIso();
  const selectedDate = isValidDate(sp.date) ? sp.date : today;
  const isToday = selectedDate === today;
  const calYm =
    sp.cal_ym && /^\d{4}-\d{2}$/.test(sp.cal_ym)
      ? sp.cal_ym
      : selectedDate.slice(0, 7);

  const supabase = await createClient();
  const user = await getCurrentUser();

  await applyAnnualGradePromotionIfNeeded(supabase);

  if (user?.accountRole === "staff") {
    await ensureScheduledLessonsForDate(supabase, selectedDate, user.id);
  }

  const monthStart = `${calYm}-01`;
  const monthEnd = `${calYm}-31`;

  const [
    { data: dayLessonsRaw },
    { data: recentMemoRecords },
    { data: monthLessonRows },
    periodTimes,
    classrooms,
  ] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        "*, students ( id, name, name_kana, grade, classroom, next_text_robot, next_text_robot_course, next_text_robot_text, next_text_programming, next_text_programming_course, next_text_programming_text, persistent_memo, note, withdrawal_until_ym, scratch_login_id, scratch_login_pass, minecraft_login, promotion_scheduled_ym, promotion_type, course_start_robot_ym, course_start_programming_ym, leave_from_ym, leave_until_ym )"
      )
      .eq("lesson_date", selectedDate)
      .order("period", { ascending: true, nullsFirst: false })
      .order("status", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<LessonWithStudent[]>(),
    supabase
      .from("lessons")
      .select(
        "*, students ( id, name, grade, classroom, next_text_robot, next_text_robot_course, next_text_robot_text, next_text_programming, next_text_programming_course, next_text_programming_text )"
      )
      .eq("status", "recorded")
      .eq("registered_via_detail", true)
      .not("text_memo", "is", null)
      .order("lesson_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(15)
      .returns<LessonWithStudent[]>(),
    supabase
      .from("lessons")
      .select("lesson_date")
      .gte("lesson_date", monthStart)
      .lte("lesson_date", monthEnd),
    fetchClassroomPeriodTimes(supabase),
    fetchClassrooms(supabase),
  ]);

  const dayLessons = (dayLessonsRaw ?? []).filter((lesson) => {
    const withdrawalYm = lesson.students?.withdrawal_until_ym ?? null;
    return !isLessonAfterWithdrawal(lesson.lesson_date, withdrawalYm);
  });

  const memoRecords = (recentMemoRecords ?? []).filter(
    (lesson) => lesson.text_memo?.trim()
  );

  const previousMemos = await fetchPreviousLessonMemos(
    supabase,
    (dayLessons ?? []).map((l) => ({
      id: l.id,
      student_id: l.student_id,
      subject: l.subject,
      lesson_date: l.lesson_date,
      period: l.period,
    })),
    selectedDate
  );

  const datesWithLessons = new Set(
    (monthLessonRows ?? []).map((r) => r.lesson_date as string)
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="ホーム"
        description="日毎のコマ表と、備考入力ありの最近の記録を確認できます。"
      />

      <section className="grid lg:grid-cols-[minmax(0,280px)_1fr] gap-4 items-start">
        <DashboardDateCalendar
          selectedDate={selectedDate}
          calYm={calYm}
          datesWithLessons={datesWithLessons}
        />
        <div className="min-w-0 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-base font-semibold">
              {isToday ? "本日のコマ表" : `${formatDateLong(selectedDate)} のコマ表`}
            </h2>
            <DailyDateNav date={selectedDate} />
          </div>
          <DailyLessonBoard
            date={selectedDate}
            lessons={(dayLessons ?? []) as DailyLessonItem[]}
            classroomPeriodTimes={periodTimes}
            previousMemos={previousMemos}
            classroomOrderNames={classroomNames(classrooms)}
          />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-3">最近の備考有り記録</h2>
        {memoRecords.length > 0 ? (
          <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {memoRecords.map((l) => (
              <LessonRow
                key={l.id}
                lesson={l}
                showDate
                classroomPeriodTimes={periodTimes}
              />
            ))}
          </ul>
        ) : (
          <EmptyCard message="備考入力ありの記録はまだありません。" />
        )}
      </section>
    </div>
  );
}

function LessonRow({
  lesson,
  showDate,
  classroomPeriodTimes = [],
}: {
  lesson: LessonWithStudent;
  showDate?: boolean;
  classroomPeriodTimes?: ClassroomPeriodTime[];
}) {
  const isScheduled = lesson.status === "scheduled";
  const slotRow =
    lesson.period && classroomPeriodTimes.length
      ? resolveClassroomPeriodTime(classroomPeriodTimes, {
          classroom: effectiveLessonClassroom(
            lesson,
            lesson.students?.classroom ?? null
          ),
          lessonDate: lesson.lesson_date,
          period: lesson.period,
          subject: lesson.subject,
        })
      : null;
  return (
    <li>
      <Link
        href={lesson.students ? `/students/${lesson.students.id}` : "#"}
        className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-slate-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">
              {lesson.students?.name ?? "(削除済み)"}
            </span>
            {lesson.students ? (
              <span className="text-xs text-slate-500 shrink-0">
                {lesson.students.grade}
              </span>
            ) : null}
            <ClassroomBadge
              classroom={effectiveLessonClassroom(
                lesson,
                lesson.students?.classroom ?? null
              )}
            />
            <SubjectChip subject={lesson.subject} />
            {lesson.period ? (
              <span className="text-xs text-slate-500">
                {periodLabel(lesson.period)}
                {slotRow
                  ? ` · ${formatTimeRange(slotRow.start_time, slotRow.end_time)}`
                  : ""}
              </span>
            ) : null}
            {showDate ? (
              <span className="text-xs text-slate-400 ml-auto shrink-0">
                {formatDateShort(lesson.lesson_date)}
              </span>
            ) : null}
          </div>
          {lesson.text_memo ? (
            <p className="text-sm text-slate-600 mt-1 line-clamp-2">
              {lesson.text_memo}
            </p>
          ) : null}
        </div>
        {isScheduled ? (
          <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-brand-100 text-brand-800 ring-brand-600/20">
            {SCHEDULED_ATTENDANCE_LABEL[lesson.attendance]}
          </span>
        ) : (
          <AttendanceBadge status={lesson.attendance} size="sm" />
        )}
      </Link>
    </li>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}
