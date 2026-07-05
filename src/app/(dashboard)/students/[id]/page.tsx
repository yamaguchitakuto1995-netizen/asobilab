import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceBadge } from "@/components/AttendanceBadge";
import { AttendanceCalendar } from "@/components/AttendanceCalendar";
import { ClassroomBadge } from "@/components/ClassroomBadge";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { PageHeader } from "@/components/PageHeader";
import { StudentTextInfoSection } from "@/components/StudentTextInfo";
import { SubjectChip } from "@/components/SubjectChip";
import { getCurrentUser } from "@/lib/auth";
import { currentYm, formatDateLong, todayIso } from "@/lib/date";
import { fetchSiblingSummaries } from "@/lib/siblings";
import {
  fetchClassroomPeriodTimes,
  formatTimeRange,
  resolveClassroomPeriodTime,
} from "@/lib/periodTimes";
import { createClient } from "@/lib/supabase/server";
import {
  resolveProgrammingNextTextPartsForStudent,
  resolveRobotNextTextPartsForStudent,
} from "@/lib/courseNextText";
import { isLessonAfterWithdrawal } from "@/lib/studentWithdrawal";
import { hasProgrammingLoginDisplay } from "@/lib/studentProgrammingLogin";
import { ProgrammingLoginDisplay } from "@/components/ProgrammingLoginDisplay";
import { StudentPromotionScheduleNotices } from "@/components/PromotionScheduleNotice";
import { StudentCourseStartDisplay } from "@/components/StudentCourseStartDisplay";
import { StudentLeavePeriodDisplay } from "@/components/StudentLeavePeriodDisplay";
import { applyDueSkipPromotionIfNeeded } from "@/lib/applyStudentPromotion";
import {
  SCHEDULED_ATTENDANCE_LABEL,
  effectiveLessonClassroom,
  periodLabel,
  type Lesson,
  type Student,
} from "@/lib/types";
import { deleteStudent } from "../actions";
import { deleteLesson, markLessonRecorded } from "./lessons/actions";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  q?: string;
  subject?: string;
  ym?: string;
  error?: string;
}>;

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const {
    q = "",
    subject = "",
    ym = currentYm(),
    error: errorMsg,
  } = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser();

  await applyDueSkipPromotionIfNeeded(supabase, id);

  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("id", id)
    .maybeSingle<Student>();

  if (!student) notFound();

  const today = todayIso();

  // 履歴側のクエリ (記録済みのみ)
  let listQuery = supabase
    .from("lessons")
    .select("*")
    .eq("student_id", id)
    .eq("status", "recorded")
    .order("lesson_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (q.trim()) {
    listQuery = listQuery.ilike("text_memo", `%${q.trim()}%`);
  }
  if (subject) {
    listQuery = listQuery.eq("subject", subject);
  }

  const [
    { data: allLessons },
    { data: filteredHistory },
    { data: upcoming },
    periodTimes,
    siblingSummaries,
  ] = await Promise.all([
    supabase
      .from("lessons")
      .select("lesson_date, attendance, subject, status")
      .eq("student_id", id)
      .returns<Pick<Lesson, "lesson_date" | "attendance" | "subject" | "status">[]>(),
    listQuery.returns<Lesson[]>(),
    supabase
      .from("lessons")
      .select("*")
      .eq("student_id", id)
      .eq("status", "scheduled")
      .gte("lesson_date", today)
      .order("lesson_date", { ascending: true })
      .returns<Lesson[]>(),
    fetchClassroomPeriodTimes(supabase),
    fetchSiblingSummaries(supabase, id, student.sibling_group_id),
  ]);

  const upcomingVisible = (upcoming ?? []).filter(
    (l) => !isLessonAfterWithdrawal(l.lesson_date, student.withdrawal_until_ym)
  );

  // 出席率は記録済みのみで集計
  const recorded =
    (allLessons ?? []).filter((l) => l.status === "recorded");
  const total = recorded.length;
  const presentCount = recorded.filter((l) => l.attendance === "present").length;
  const lateCount    = recorded.filter((l) => l.attendance === "late").length;
  const absentCount  = recorded.filter((l) => l.attendance === "absent").length;
  const attendedTotal = presentCount + lateCount;
  const denom = attendedTotal + absentCount;
  const rate = denom > 0 ? Math.round((attendedTotal / denom) * 100) : null;

  const subjectStats = new Map<string, number>();
  for (const l of recorded) {
    if (!l.subject) continue;
    subjectStats.set(l.subject, (subjectStats.get(l.subject) ?? 0) + 1);
  }
  const subjectsAvailable = Array.from(subjectStats.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  const recent = (filteredHistory ?? []).slice(0, 3);
  const previousLesson = (filteredHistory ?? [])[0] ?? null;
  const isAdmin = user?.isAdmin ?? false;
  const baseHref = `/students/${student.id}`;
  const filterParams = new URLSearchParams();
  if (q) filterParams.set("q", q);
  if (subject) filterParams.set("subject", subject);
  const calendarBase =
    filterParams.toString().length > 0
      ? `${baseHref}?${filterParams.toString()}`
      : baseHref;

  const robotTextParts = resolveRobotNextTextPartsForStudent({
    next_text_robot: student.next_text_robot,
    next_text_robot_course: student.next_text_robot_course ?? null,
    next_text_robot_text: student.next_text_robot_text ?? null,
  });
  const programmingTextParts = resolveProgrammingNextTextPartsForStudent({
    next_text_programming: student.next_text_programming,
    next_text_programming_course:
      student.next_text_programming_course ?? null,
    next_text_programming_text:
      student.next_text_programming_text ?? null,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/students"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← 生徒一覧
        </Link>
      </div>

      <PageHeader
        title={student.name}
        description={`学年: ${student.grade}`}
        actions={
          <>
            <Link
              href={`/students/${student.id}/edit`}
              className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2"
            >
              生徒を編集
            </Link>
            <Link
              href={`/students/${student.id}/lessons/new`}
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2"
            >
              ＋ 授業を追加
            </Link>
          </>
        }
      />

      {errorMsg ? (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {decodeURIComponent(errorMsg)}
        </p>
      ) : null}

      <section className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-sm text-sky-950">
        <h2 className="font-semibold text-sky-950 mb-2">保護者向け振替申請のログイン情報</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-sky-800">生徒ID</dt>
          <dd className="font-mono font-medium">
            {student.portal_id?.trim() ? student.portal_id : (
              <span className="text-rose-700 font-sans font-normal">未設定（編集画面で登録）</span>
            )}
          </dd>
          <dt className="text-sky-800">誕生日</dt>
          <dd className="font-medium">
            {student.birthday ? student.birthday : (
              <span className="text-rose-700 font-normal">未設定（編集画面で登録）</span>
            )}
          </dd>
        </dl>
        <p className="text-xs text-sky-800/80 mt-2">
          保護者は <code className="text-xs">/apply</code> で上記2つを入力して振替申請できます。
        </p>
      </section>

      {student.subjects?.includes("プログラミング") &&
      hasProgrammingLoginDisplay(student) ? (
        <ProgrammingLoginDisplay student={student} />
      ) : student.subjects?.includes("プログラミング") ? (
        <section className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 px-4 py-3 text-sm text-violet-900">
          スクラッチログイン情報が未設定です。
          <Link
            href={`/students/${student.id}/edit`}
            className="ml-1 font-medium text-brand-700 hover:underline"
          >
            編集画面で登録
          </Link>
        </section>
      ) : null}

      <StudentLeavePeriodDisplay
        student={student}
        editHref={`/students/${student.id}/edit`}
      />

      <StudentCourseStartDisplay
        subjects={student.subjects}
        student={student}
        editHref={`/students/${student.id}/edit`}
      />

      <StudentPromotionScheduleNotices
        subjects={student.subjects}
        student={student}
      />

      {student.classroom || (student.subjects && student.subjects.length > 0) ? (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          {student.classroom ? (
            <div>
              <h2 className="text-sm font-semibold text-slate-700 mb-2">
                所属教室
              </h2>
              <ClassroomBadge classroom={student.classroom} size="md" />
            </div>
          ) : (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              所属教室が未設定です。「生徒を編集」から教室を登録してください。
            </div>
          )}
          {student.subjects && student.subjects.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold text-slate-700 mb-2">
                受講教科
              </h2>
              <div className="flex flex-wrap gap-2">
                {student.subjects.map((s) => (
                  <SubjectChip key={s} subject={s} size="md" />
                ))}
              </div>
            </div>
          ) : null}
          {siblingSummaries.length > 0 ? (
            <div className="pt-3 border-t border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">
                兄弟・姉妹
              </h2>
              <p className="text-sm text-violet-900 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                <span className="font-semibold">兄弟あり</span>
                {" — "}
                {siblingSummaries.map((s) => s.name).join("、")}
              </p>
            </div>
          ) : null}
          {(student.subjects ?? []).some((s) => s === "ロボット" || s === "プログラミング") ? (
            <div className="pt-3 border-t border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">
                教材コース（次回テキスト）
              </h2>
              <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
                ロボット・プログラミングでは、ここにコース名と単元の位置を示します。詳細は下の「テキスト情報」でも同じ内容を確認できます。
              </p>
              <dl className="space-y-2 text-sm">
                {(student.subjects ?? []).includes("ロボット") ? (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">ロボット</dt>
                    <dd className="mt-0.5 text-slate-800">
                      {robotTextParts ? (
                        <>
                          <span className="text-slate-500 text-xs">コース</span>{" "}
                          {robotTextParts.course}
                          <span className="text-slate-400 mx-1.5">·</span>
                          <span className="text-slate-500 text-xs">テキスト名</span>{" "}
                          {robotTextParts.text}
                        </>
                      ) : (
                        <span className="text-slate-400">
                          未設定（生徒を編集でコース・テキスト名を登録してください）
                        </span>
                      )}
                    </dd>
                  </div>
                ) : null}
                {(student.subjects ?? []).includes("プログラミング") ? (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">
                      プログラミング
                    </dt>
                    <dd className="mt-0.5 text-slate-800">
                      {programmingTextParts ? (
                        <>
                          <span className="text-slate-500 text-xs">コース</span>{" "}
                          {programmingTextParts.course}
                          <span className="text-slate-400 mx-1.5">·</span>
                          <span className="text-slate-500 text-xs">テキスト名</span>{" "}
                          {programmingTextParts.text}
                        </>
                      ) : (
                        <span className="text-slate-400">
                          未設定（生徒を編集でコース・テキスト名を登録してください）
                        </span>
                      )}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}
        </section>
      ) : null}

      <StudentTextInfoSection
        subjects={student.subjects}
        next_text_robot={student.next_text_robot}
        next_text_robot_course={student.next_text_robot_course ?? null}
        next_text_robot_text={student.next_text_robot_text ?? null}
        next_text_programming={student.next_text_programming}
        next_text_programming_course={
          student.next_text_programming_course ?? null
        }
        next_text_programming_text={
          student.next_text_programming_text ?? null
        }
        editHref={`${baseHref}/edit`}
      />

      {student.note ? (
        <section className="bg-white border border-slate-200 rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">メモ</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{student.note}</p>
        </section>
      ) : null}

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="授業数" value={`${total}`} unit="件" />
        <Stat label="出席率" value={rate === null ? "—" : `${rate}%`} unit="" />
        <Stat label="出席" value={`${presentCount}`} unit="回" />
        <Stat label="欠席" value={`${absentCount}`} unit="回" />
      </section>

      {/* 今後の予定 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            今後の予定
            {upcomingVisible.length > 0 ? (
              <span className="text-xs font-normal rounded-full bg-brand-100 text-brand-800 px-2 py-0.5">
                {upcomingVisible.length}件
              </span>
            ) : null}
          </h2>
          <Link
            href={`/students/${student.id}/lessons/new`}
            className="text-xs text-brand-600 hover:underline"
          >
            ＋ 予定を追加
          </Link>
        </div>
        {upcomingVisible.length > 0 ? (
          <ul className="bg-white border border-brand-200 rounded-2xl divide-y divide-brand-100 overflow-hidden">
            {upcomingVisible.map((l) => {
              const canEdit =
                user !== null && (l.teacher_id === user.id || isAdmin);
              const slotRow =
                l.period && periodTimes.length
                  ? resolveClassroomPeriodTime(periodTimes, {
                      classroom: effectiveLessonClassroom(l, student.classroom),
                      lessonDate: l.lesson_date,
                      period: l.period,
                      subject: l.subject,
                    })
                  : null;
              return (
                <li key={l.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">
                          {formatDateLong(l.lesson_date)}
                        </p>
                        <span className="text-xs text-slate-600 font-medium">
                          {periodLabel(l.period)}
                          {slotRow
                            ? ` · ${formatTimeRange(slotRow.start_time, slotRow.end_time)}`
                            : ""}
                        </span>
                        <SubjectChip subject={l.subject} />
                        <ClassroomBadge
                          classroom={effectiveLessonClassroom(l, student.classroom)}
                          size="sm"
                        />
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-brand-100 text-brand-800 ring-brand-600/20">
                          {SCHEDULED_ATTENDANCE_LABEL[l.attendance]}
                        </span>
                      </div>
                      {l.attendance === "makeup" &&
                      l.source_lesson_date &&
                      l.source_period != null &&
                      l.source_subject ? (
                        <p className="text-xs text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-2 py-1.5 mt-2">
                          振替:{" "}
                          <span className="font-medium">
                            {formatDateLong(l.source_lesson_date)}{" "}
                            {periodLabel(l.source_period)} {l.source_subject}
                          </span>
                          {" → この日へ受講"}
                        </p>
                      ) : null}
                      {l.text_memo ? (
                        <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">
                          {l.text_memo}
                        </p>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <form action={markLessonRecorded}>
                          <input type="hidden" name="student_id" value={student.id} />
                          <input type="hidden" name="lesson_id" value={l.id} />
                          <button
                            type="submit"
                            className="text-xs rounded-md bg-brand-600 hover:bg-brand-700 text-white px-2 py-1"
                            title="この予定を記録済みに切り替え"
                          >
                            記録済みに
                          </button>
                        </form>
                        <Link
                          href={`/students/${student.id}/lessons/${l.id}/edit`}
                          className="text-xs text-brand-600 hover:text-brand-700 hover:underline"
                        >
                          編集
                        </Link>
                        <ConfirmDeleteForm
                          action={deleteLesson}
                          message={`${formatDateLong(l.lesson_date)} の予定を削除します。よろしいですか？`}
                        >
                          <input type="hidden" name="student_id" value={student.id} />
                          <input type="hidden" name="lesson_id" value={l.id} />
                        </ConfirmDeleteForm>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-sm text-slate-500">
            まだ今後の予定はありません。
          </div>
        )}
      </section>

      {subjectsAvailable.length > 0 ? (
        <section className="bg-white border border-slate-200 rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">
            記録済み授業の科目別件数
          </h2>
          <div className="flex flex-wrap gap-2">
            {subjectsAvailable.map(([s, count]) => (
              <Link
                key={s}
                href={`${baseHref}?subject=${encodeURIComponent(s)}`}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
                  subject === s
                    ? "bg-brand-600 text-white ring-brand-700"
                    : "bg-slate-50 text-slate-700 ring-slate-300 hover:bg-slate-100"
                }`}
              >
                <span>{s}</span>
                <span
                  className={`text-[10px] ${
                    subject === s ? "text-brand-100" : "text-slate-500"
                  }`}
                >
                  {count}
                </span>
              </Link>
            ))}
            {subject ? (
              <Link
                href={baseHref}
                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"
              >
                ＋ すべて表示
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {previousLesson ? (
        <section className="bg-gradient-to-br from-brand-50 to-white border border-brand-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-brand-900">
              {q || subject ? "直近の該当授業" : "前回の授業"}
            </h2>
            <div className="flex items-center gap-2">
              <SubjectChip subject={previousLesson.subject} />
              <AttendanceBadge status={previousLesson.attendance} size="sm" />
            </div>
          </div>
          <p className="text-sm text-brand-800/80 mb-1">
            {formatDateLong(previousLesson.lesson_date)}
          </p>
          {previousLesson.text_memo ? (
            <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
              {previousLesson.text_memo}
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              （テキスト内容の記録なし）
            </p>
          )}
          {recent.length > 1 ? (
            <details className="mt-3">
              <summary className="text-xs text-brand-700 cursor-pointer select-none hover:underline">
                直近 3 件の進捗を見る
              </summary>
              <ul className="mt-2 space-y-2">
                {recent.slice(1).map((l) => (
                  <li
                    key={l.id}
                    className="text-xs text-slate-700 border-t border-brand-100 pt-2"
                  >
                    <div className="flex items-center gap-2 mb-0.5 text-slate-500 flex-wrap">
                      {formatDateLong(l.lesson_date)}
                      <SubjectChip subject={l.subject} />
                      <AttendanceBadge status={l.attendance} size="sm" />
                    </div>
                    <p className="whitespace-pre-wrap text-slate-700">
                      {l.text_memo ?? "（記録なし）"}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      <AttendanceCalendar
        ym={ym}
        lessons={(allLessons ?? []).filter(
          (l) =>
            l.status !== "scheduled" ||
            !isLessonAfterWithdrawal(l.lesson_date, student.withdrawal_until_ym)
        )}
        baseHref={calendarBase}
      />

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <h2 className="text-base font-semibold">授業履歴（記録済み）</h2>
          <form action={baseHref} className="flex gap-2 flex-wrap">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="進捗メモを検索"
              className="w-full sm:w-52 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            {subjectsAvailable.length > 0 ? (
              <select
                name="subject"
                defaultValue={subject}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              >
                <option value="">すべての科目</option>
                {subjectsAvailable.map(([s]) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : null}
            {ym !== currentYm() ? (
              <input type="hidden" name="ym" value={ym} />
            ) : null}
            <button
              type="submit"
              className="shrink-0 text-sm rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5"
            >
              絞り込み
            </button>
            {q || subject ? (
              <Link
                href={baseHref}
                className="shrink-0 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5"
              >
                クリア
              </Link>
            ) : null}
          </form>
        </div>

        {filteredHistory && filteredHistory.length > 0 ? (
          <ol className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {filteredHistory.map((l) => {
              const canEdit = user !== null && (l.teacher_id === user.id || isAdmin);
              const slotRow =
                l.period && periodTimes.length
                  ? resolveClassroomPeriodTime(periodTimes, {
                      classroom: effectiveLessonClassroom(l, student.classroom),
                      lessonDate: l.lesson_date,
                      period: l.period,
                      subject: l.subject,
                    })
                  : null;
              return (
                <li key={l.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">
                          {formatDateLong(l.lesson_date)}
                        </p>
                        <span className="text-xs text-slate-600 font-medium">
                          {periodLabel(l.period)}
                          {slotRow
                            ? ` · ${formatTimeRange(slotRow.start_time, slotRow.end_time)}`
                            : ""}
                        </span>
                        <SubjectChip subject={l.subject} />
                        <ClassroomBadge
                          classroom={effectiveLessonClassroom(l, student.classroom)}
                          size="sm"
                        />
                        <AttendanceBadge status={l.attendance} size="sm" />
                      </div>
                      {l.text_memo ? (
                        <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">
                          {l.text_memo}
                        </p>
                      ) : (
                        <p className="text-sm text-slate-400 mt-1">
                          （テキスト内容の記録なし）
                        </p>
                      )}
                    </div>
                    {canEdit ? (
                      <div className="flex flex-col gap-1 shrink-0">
                        <Link
                          href={`/students/${student.id}/lessons/${l.id}/edit`}
                          className="text-xs text-brand-600 hover:text-brand-700 hover:underline"
                        >
                          編集
                        </Link>
                        <ConfirmDeleteForm
                          action={deleteLesson}
                          message={`${formatDateLong(l.lesson_date)} の授業記録を削除します。\n出欠やテキスト内容のメモも全て失われます。よろしいですか？`}
                        >
                          <input type="hidden" name="student_id" value={student.id} />
                          <input type="hidden" name="lesson_id" value={l.id} />
                        </ConfirmDeleteForm>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center">
            <p className="text-sm text-slate-500">
              {q || subject
                ? "該当する授業記録が見つかりませんでした。"
                : "まだ記録済みの授業がありません。"}
            </p>
            {!q && !subject ? (
              <Link
                href={`/students/${student.id}/lessons/new`}
                className="inline-block mt-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2"
              >
                最初の授業を追加
              </Link>
            ) : null}
          </div>
        )}
      </section>

      <section className="pt-4 border-t border-slate-200">
        <ConfirmDeleteForm
          action={deleteStudent}
          buttonLabel="この生徒を削除"
          buttonClassName="text-sm text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          message={`${student.name} さんを削除します。\n紐付く授業履歴・予定も全て削除されます。\nこの操作は取り消せません。本当によろしいですか？`}
        >
          <input type="hidden" name="id" value={student.id} />
        </ConfirmDeleteForm>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold mt-0.5">
        {value}
        {unit ? (
          <span className="text-xs font-normal text-slate-500 ml-1">{unit}</span>
        ) : null}
      </p>
    </div>
  );
}
