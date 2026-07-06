import Link from "next/link";
import { AttendanceBadge } from "@/components/AttendanceBadge";
import { ClassroomBadge } from "@/components/ClassroomBadge";
import { DailyLessonBoard } from "@/components/DailyLessonBoard";
import type { DailyLessonItem } from "@/components/DailyLessonCarousel";
import { classroomNames, fetchClassrooms } from "@/lib/classrooms";
import { DailyDateNav } from "@/components/DailyDateNav";
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
import { fetchPreviousLessonMemos } from "@/lib/previousLessonMemos";
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
    withdrawal_until_ym?: string | null;
    promotion_scheduled_ym?: string | null;
    promotion_type?: "normal" | "skip_grade";
    course_start_robot_ym?: string | null;
    course_start_programming_ym?: string | null;
  } | null;
};

type SearchParams = Promise<{ date?: string }>;

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const today = todayIso();
  const selectedDate = isValidDate(sp.date) ? sp.date : today;
  const isToday = selectedDate === today;

  const supabase = await createClient();

  const [
    { count: studentCount },
    { data: dayLessonsRaw },
    { data: recentMemoRecords },
    periodTimes,
    classrooms,
  ] = await Promise.all([
    supabase.from("students").select("*", { count: "exact", head: true }),
    supabase
      .from("lessons")
      .select(
        "*, students ( id, name, name_kana, grade, classroom, next_text_robot, next_text_robot_course, next_text_robot_text, next_text_programming, next_text_programming_course, next_text_programming_text, persistent_memo, withdrawal_until_ym, scratch_login_id, scratch_login_pass, minecraft_login, promotion_scheduled_ym, promotion_type, course_start_robot_ym, course_start_programming_ym, leave_from_ym, leave_until_ym )"
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

  const dayPresent =
    dayLessons?.filter((l) => l.status === "recorded" && l.attendance === "present").length ?? 0;
  const dayAbsent =
    dayLessons?.filter((l) => l.status === "recorded" && l.attendance === "absent").length ?? 0;
  const dayScheduled =
    dayLessons?.filter((l) => l.status === "scheduled").length ?? 0;

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

  return (
    <div className="space-y-8">
      <PageHeader
        title="ホーム"
        description="日毎のコマ表と、備考入力ありの最近の記録を確認できます。"
        actions={
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <Link
              href="/capacities"
              className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2"
            >
              教室・振替の設定
            </Link>
            <Link
              href="/students"
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2"
            >
              生徒を見る
            </Link>
          </div>
        }
      />

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="登録生徒数" value={studentCount ?? 0} unit="人" />
        <StatCard
          label={isToday ? "本日の予定" : `${formatDateShort(selectedDate)} 予定`}
          value={dayScheduled}
          unit="件"
        />
        <StatCard
          label={isToday ? "本日(出席)" : `${formatDateShort(selectedDate)} 出席`}
          value={dayPresent}
          unit="件"
        />
        <StatCard
          label={isToday ? "本日(欠席)" : `${formatDateShort(selectedDate)} 欠席`}
          value={dayAbsent}
          unit="件"
        />
      </section>

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
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

function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold mt-1">
        {value}
        <span className="text-sm font-normal text-slate-500 ml-1">{unit}</span>
      </p>
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
