import Link from "next/link";
import { redirect } from "next/navigation";
import { ClassroomBadge } from "@/components/ClassroomBadge";
import { PageHeader } from "@/components/PageHeader";
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
import {
  MAKEUP_TARGET_MAX_DAYS_AHEAD,
  SCHEDULED_ATTENDANCE_LABEL,
  type Lesson,
  type Student,
} from "@/lib/types";

type LessonRow = Lesson & {
  students: Pick<Student, "id" | "name" | "grade" | "classroom"> | null;
};

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
          <p className="mt-2">
            ご不明な点は教室までお問い合わせください。
          </p>
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
    .select("id, name, grade, classroom")
    .in("id", studentIds)
    .returns<Pick<Student, "id" | "name" | "grade" | "classroom">[]>();

  const today = todayIso();
  const end = shiftDate(today, MAKEUP_TARGET_MAX_DAYS_AHEAD);

  const [{ data: lessons }, periodTimes] = await Promise.all([
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
  ]);

  const byStudent = new Map(
    (students ?? []).map((s) => [s.id, s] as const)
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="お子様の予定"
        description={`今日（${formatDateShort(today)}）から約${MAKEUP_TARGET_MAX_DAYS_AHEAD}日先（${formatDateShort(end)}）までの予定です。振替申し込み済みのコマもここに表示されます。`}
      />

      <section>
        <h2 className="text-base font-semibold mb-3">紐付け中のお子様</h2>
        <ul className="flex flex-wrap gap-2">
          {studentIds.map((id) => {
            const s = byStudent.get(id);
            return (
              <li
                key={id}
                className="inline-flex items-center gap-2 rounded-full bg-white border border-sky-200 px-3 py-1.5 text-sm"
              >
                <span className="font-medium">{s?.name ?? "お子様"}</span>
                {s?.grade ? (
                  <span className="text-xs text-slate-500">{s.grade}</span>
                ) : null}
                <ClassroomBadge classroom={s?.classroom ?? null} />
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-3">今後の授業予定</h2>
        {lessons && lessons.length > 0 ? (
          <ul className="bg-white border border-sky-200 rounded-2xl divide-y divide-sky-100 overflow-hidden">
            {lessons.map((lesson) => {
              const slotRow =
                lesson.period &&
                periodTimes.length &&
                lesson.students?.classroom
                  ? resolveClassroomPeriodTime(periodTimes, {
                      classroom: lesson.students.classroom,
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
                    <span className="font-medium">
                      {lesson.students?.name ?? "お子様"}
                    </span>
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
                    <ClassroomBadge classroom={lesson.students?.classroom ?? null} />
                  </div>
                  {lesson.attendance === "makeup" &&
                  lesson.source_lesson_date ? (
                    <p className="text-sm text-sky-900">
                      <span className="font-medium">振替</span>
                      <span className="text-slate-600">
                        {" "}
                        — 元の欠席予定:{" "}
                        {formatDateShort(lesson.source_lesson_date)}
                        {lesson.source_period != null
                          ? ` ${lesson.source_period}コマ目`
                          : ""}
                        {lesson.source_subject
                          ? `（${lesson.source_subject}）`
                          : ""}
                      </span>
                    </p>
                  ) : null}
                  {lesson.text_memo ? (
                    <p className="text-sm text-slate-600 line-clamp-2">
                      {lesson.text_memo}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-brand-100 text-brand-800 ring-brand-600/20">
                    {SCHEDULED_ATTENDANCE_LABEL[lesson.attendance]}
                  </span>
                </div>
              </li>
            );
            })}
          </ul>
        ) : (
          <div className="bg-white border border-dashed border-sky-300 rounded-2xl p-8 text-center text-sm text-slate-600">
            この期間に登録されている予定はありません。
          </div>
        )}
      </section>

      <p className="text-xs text-slate-500 leading-relaxed">
        表示は予定（未実施）のコマのみです。振替のお申し込みは
        <Link href="/apply" className="text-brand-700 hover:underline mx-0.5">
          振替申請フォーム
        </Link>
        から行えます（ログイン不要）。
      </p>
    </div>
  );
}
