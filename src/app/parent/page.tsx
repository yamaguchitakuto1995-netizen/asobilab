import Link from "next/link";
import { redirect } from "next/navigation";
import { ClassroomBadge } from "@/components/ClassroomBadge";
import { PageHeader } from "@/components/PageHeader";
import { StudentTextInfoSection } from "@/components/StudentTextInfo";
import { SubjectChip } from "@/components/SubjectChip";
import {
  formatDateLong,
  formatDateShort,
  shiftDate,
  todayIso,
} from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import {
  fetchClassroomPeriodTimes,
  formatTimeRange,
  resolveClassroomPeriodTime,
} from "@/lib/periodTimes";
import { fetchSiblingSummaries } from "@/lib/siblings";
import {
  MAKEUP_TARGET_MAX_DAYS_AHEAD,
  SCHEDULED_ATTENDANCE_LABEL,
  effectiveLessonClassroom,
  type Lesson,
  type Student,
} from "@/lib/types";
import {
  formatMakeupSourceLine,
  hideAbsencesWithMakeupRegistered,
} from "@/lib/portalScheduleLessons";
import { isLessonAfterWithdrawal } from "@/lib/studentWithdrawal";

type LessonRow = Lesson & {
  students: Pick<Student, "id" | "name" | "grade" | "classroom"> | null;
};

function applyUrlForStudent(s: Pick<Student, "portal_id" | "birthday">) {
  if (!s.portal_id?.trim() || !s.birthday) return "/apply";
  const params = new URLSearchParams({
    portal_id: s.portal_id.trim(),
    birthday: s.birthday,
  });
  return `/apply?${params.toString()}`;
}

export default async function ParentHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: links } = await supabase
    .from("parent_student_links")
    .select("student_id")
    .eq("parent_user_id", user.id);

  const studentIds = [...new Set((links ?? []).map((l) => l.student_id))];

  if (studentIds.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="お子様の予定"
          description="教室からアカウントとお子様の紐付けが完了すると、ここに今後の授業予定が表示されます。"
        />
        <div className="bg-white border border-dashed border-sky-300 rounded-2xl p-8 text-center text-sm text-slate-600 leading-relaxed">
          <p>まだ紐付けられたお子様がいません。</p>
          <p className="mt-2">ご不明な点は教室までお問い合わせください。</p>
          <Link
            href="/apply"
            className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline"
          >
            振替のお申し込みはこちら（ログイン不要）→
          </Link>
        </div>
      </div>
    );
  }

  const { data: students } = await supabase
    .from("students")
    .select(
      "id, name, grade, classroom, portal_id, birthday, subjects, sibling_group_id, withdrawal_until_ym, next_text_robot, next_text_robot_course, next_text_robot_text, next_text_programming, next_text_programming_course, next_text_programming_text"
    )
    .in("id", studentIds)
    .returns<
      Pick<
        Student,
        | "id"
        | "name"
        | "grade"
        | "classroom"
        | "portal_id"
        | "birthday"
        | "subjects"
        | "sibling_group_id"
        | "withdrawal_until_ym"
        | "next_text_robot"
        | "next_text_robot_course"
        | "next_text_robot_text"
        | "next_text_programming"
        | "next_text_programming_course"
        | "next_text_programming_text"
      >[]
    >();

  const today = todayIso();
  const end = shiftDate(today, MAKEUP_TARGET_MAX_DAYS_AHEAD);

  const [{ data: lessons }, periodTimes, siblingLists] = await Promise.all([
    supabase
      .from("lessons")
      .select("*, students ( id, name, grade, classroom )")
      .in("student_id", studentIds)
      .eq("status", "scheduled")
      .gte("lesson_date", today)
      .lte("lesson_date", end)
      .order("lesson_date", { ascending: true })
      .order("period", { ascending: true, nullsFirst: false })
      .returns<LessonRow[]>(),
    fetchClassroomPeriodTimes(supabase),
    Promise.all(
      (students ?? []).map(async (s) => ({
        id: s.id,
        siblings: await fetchSiblingSummaries(supabase, s.id, s.sibling_group_id),
      }))
    ),
  ]);

  const byStudent = new Map((students ?? []).map((s) => [s.id, s] as const));
  const siblingsByStudent = new Map(
    siblingLists.map((x) => [x.id, x.siblings] as const)
  );

  const lessonsByStudent = new Map<string, LessonRow[]>();
  for (const id of studentIds) lessonsByStudent.set(id, []);
  for (const lesson of lessons ?? []) {
    const student = byStudent.get(lesson.student_id);
    if (
      student &&
      isLessonAfterWithdrawal(lesson.lesson_date, student.withdrawal_until_ym)
    ) {
      continue;
    }
    const arr = lessonsByStudent.get(lesson.student_id);
    if (arr) arr.push(lesson);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="お子様の予定"
        description={`今日（${formatDateShort(today)}）から約${MAKEUP_TARGET_MAX_DAYS_AHEAD}日先（${formatDateShort(end)}）までの授業予定です。振替申し込み済みのコマも表示されます。`}
      />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">お子様一覧</h2>
        <div className="grid gap-4">
          {studentIds.map((id) => {
            const s = byStudent.get(id);
            if (!s) return null;
            const siblings = siblingsByStudent.get(id) ?? [];
            return (
              <div
                key={id}
                className="rounded-2xl border border-sky-200 bg-white p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {s.grade}
                      {s.classroom ? ` · ${s.classroom}` : ""}
                    </p>
                    {siblings.length > 0 ? (
                      <p className="text-xs text-violet-700 mt-1">
                        兄弟・姉妹: {siblings.map((x) => x.name).join("、")}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={applyUrlForStudent(s)}
                    className="text-xs font-medium text-brand-700 hover:underline shrink-0"
                  >
                    振替を申請 →
                  </Link>
                </div>
                <StudentTextInfoSection
                  subjects={s.subjects}
                  next_text_robot={s.next_text_robot}
                  next_text_robot_course={s.next_text_robot_course ?? null}
                  next_text_robot_text={s.next_text_robot_text ?? null}
                  next_text_programming={s.next_text_programming}
                  next_text_programming_course={
                    s.next_text_programming_course ?? null
                  }
                  next_text_programming_text={
                    s.next_text_programming_text ?? null
                  }
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">授業予定</h2>
        {studentIds.map((id) => {
          const s = byStudent.get(id);
          const rows = hideAbsencesWithMakeupRegistered(
            lessonsByStudent.get(id) ?? []
          );
          return (
            <div key={`schedule-${id}`} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  {s?.name ?? "お子様"}
                  <span className="text-xs font-normal text-slate-500 ml-2">
                    {rows.length}件
                  </span>
                </h3>
                {s ? (
                  <Link
                    href={applyUrlForStudent(s)}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    振替申請
                  </Link>
                ) : null}
              </div>
              {rows.length > 0 ? (
                <ul className="bg-white border border-sky-200 rounded-2xl divide-y divide-sky-100 overflow-hidden">
                  {rows.map((lesson) => {
                    const lessonVenue = effectiveLessonClassroom(
                      lesson,
                      lesson.students?.classroom ?? null
                    );
                    const slotRow =
                      lesson.period && periodTimes.length && lessonVenue
                        ? resolveClassroomPeriodTime(periodTimes, {
                            classroom: lessonVenue,
                            lessonDate: lesson.lesson_date,
                            period: lesson.period,
                            subject: lesson.subject,
                          })
                        : null;
                    return (
                      <li
                        key={lesson.id}
                        className="px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-500">
                              {formatDateLong(lesson.lesson_date)}
                            </span>
                            <SubjectChip subject={lesson.subject} />
                            <span className="text-xs text-slate-500">
                              {lesson.period ? `${lesson.period}コマ目` : "コマ未設定"}
                              {slotRow
                                ? ` · ${formatTimeRange(slotRow.start_time, slotRow.end_time)}`
                                : ""}
                            </span>
                            <ClassroomBadge classroom={lessonVenue} />
                          </div>
                          {lesson.attendance === "makeup" ? (
                            (() => {
                              const line = formatMakeupSourceLine(lesson);
                              return line ? (
                                <p className="text-sm text-sky-900">{line}</p>
                              ) : null;
                            })()
                          ) : null}
                        </div>
                        <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-brand-100 text-brand-800 ring-brand-600/20">
                          {SCHEDULED_ATTENDANCE_LABEL[lesson.attendance]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="bg-white border border-dashed border-sky-200 rounded-xl p-4 text-center text-xs text-slate-500">
                  この期間の予定はありません。
                </div>
              )}
            </div>
          );
        })}
      </section>

      <p className="text-xs text-slate-500 leading-relaxed">
        兄弟・姉妹が登録されている場合、振替申請フォームで複数名を1回の入力で申請できます。
        <Link href="/apply" className="text-brand-700 hover:underline mx-0.5">
          振替申請フォーム
        </Link>
        からお申し込みください。
      </p>
    </div>
  );
}
