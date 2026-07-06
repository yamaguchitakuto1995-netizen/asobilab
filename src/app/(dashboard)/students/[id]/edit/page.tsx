import Link from "next/link";
import { notFound } from "next/navigation";
import { ClassroomSubjectsField } from "@/components/ClassroomSubjectsField";
import { BirthdayMmddField } from "@/components/BirthdayMmddField";
import { Field, inputClass } from "@/components/Field";
import { PageHeader } from "@/components/PageHeader";
import { StudentLeaveField } from "@/components/StudentLeaveField";
import { StudentWithdrawalField } from "@/components/StudentWithdrawalField";
import { StudentProgrammingLoginField } from "@/components/StudentProgrammingLoginField";
import { StudentCourseStartField } from "@/components/StudentCourseStartField";
import { StudentSkipPromotionField } from "@/components/StudentSkipPromotionField";
import { StudentNextTextFormSection } from "@/components/StudentNextTextFormSection";
import { StudentSiblingField } from "@/components/StudentSiblingField";
import { fetchClassrooms } from "@/lib/classrooms";
import { fetchSiblingSummaries, fetchStudentsForSiblingPicker } from "@/lib/siblings";
import { createClient } from "@/lib/supabase/server";
import { GRADE_LEVELS, type LessonCapacity, type Student } from "@/lib/types";
import { updateStudent } from "../../actions";
import {
  linkParentToStudent,
  unlinkParentFromStudent,
} from "../../parent-link-actions";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string; parentError?: string; parentMsg?: string }>;

export default async function EditStudentPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { error, parentError, parentMsg } = await searchParams;
  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);

  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("id", id)
    .maybeSingle<Student>();

  if (!student) notFound();

  const [siblingCandidates, currentSiblings] = await Promise.all([
    fetchStudentsForSiblingPicker(supabase, id),
    fetchSiblingSummaries(supabase, id, student.sibling_group_id),
  ]);

  const { data: capacityRows } = await supabase
    .from("lesson_capacities")
    .select("*")
    .order("classroom", { ascending: true })
    .order("day_of_week", { ascending: true })
    .order("period", { ascending: true })
    .returns<LessonCapacity[]>();

  const { data: linkRows } = await supabase
    .from("parent_student_links")
    .select("parent_user_id, created_at")
    .eq("student_id", id);

  const parentIds = (linkRows ?? []).map((r) => r.parent_user_id);

  let parentProfiles: {
    id: string;
    email: string | null;
    display_name: string | null;
  }[] = [];
  if (parentIds.length > 0) {
    const { data: profs } = await supabase
      .from("teacher_profiles")
      .select("id, email, display_name")
      .in("id", parentIds);
    parentProfiles = profs ?? [];
  }

  const profileById = new Map(
    parentProfiles.map((p) => [p.id, p] as const)
  );

  return (
    <div className="max-w-lg">
      <div className="mb-2">
        <Link
          href={`/students/${student.id}`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← {student.name} さんへ戻る
        </Link>
      </div>

      <PageHeader title="生徒情報の編集" />

      <form
        action={updateStudent}
        className="space-y-4 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6"
      >
        <input type="hidden" name="id" value={student.id} />

        <p className="text-xs text-slate-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 leading-relaxed">
          <span className="font-semibold text-amber-950">プルダウンが見えないとき</span>
          ：名前・学年の下に
          <a
            href="#student-siblings"
            className="text-violet-800 font-semibold underline underline-offset-2 mx-0.5"
          >
            兄弟・姉妹（紫の枠）
          </a>
          、その下に
          <a
            href="#student-next-text-curriculum"
            className="text-emerald-800 font-semibold underline underline-offset-2"
          >
            次回テキスト（緑の枠）
          </a>
          があります。表示されない場合は
          <strong>⌘+Shift+R</strong>
          で再読み込みするか、Vercel の本番 URL（最新デプロイ）を開いてください。
        </p>

        <Field label="名前" htmlFor="name" required>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={80}
            defaultValue={student.name}
            className={inputClass}
          />
        </Field>

        <Field label="ふりがな" htmlFor="name_kana" hint="コマ表などに表示します（任意）">
          <input
            id="name_kana"
            name="name_kana"
            type="text"
            maxLength={80}
            defaultValue={student.name_kana ?? ""}
            className={inputClass}
            placeholder="例: やまだ たろう"
          />
        </Field>

        <Field
          label="生徒ID"
          htmlFor="portal_id"
          required
          hint="保護者の振替申請フォームで使う番号（教室が発行・英数字20文字以内）"
        >
          <input
            id="portal_id"
            name="portal_id"
            type="text"
            required
            maxLength={20}
            pattern="[0-9A-Za-z\-]{1,20}"
            defaultValue={student.portal_id ?? ""}
            className={inputClass}
            placeholder="例: 10001"
            autoComplete="off"
          />
        </Field>

        <BirthdayMmddField defaultValue={student.birthday} />

        <Field label="学年" htmlFor="grade" required>
          <select
            id="grade"
            name="grade"
            required
            className={inputClass}
            defaultValue={student.grade}
          >
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>

        <StudentSiblingField
          candidates={siblingCandidates}
          defaultHasSiblings={
            Boolean(student.sibling_group_id) || currentSiblings.length > 0
          }
          defaultSiblingIds={currentSiblings.map((s) => s.id)}
          linkedSiblings={currentSiblings}
        />

        <StudentNextTextFormSection
          defaultNextTextRobot={student.next_text_robot}
          defaultNextTextRobotCourse={student.next_text_robot_course ?? null}
          defaultNextTextRobotText={student.next_text_robot_text ?? null}
          defaultNextTextProgramming={student.next_text_programming}
          defaultNextTextProgrammingCourse={
            student.next_text_programming_course ?? null
          }
          defaultNextTextProgrammingText={
            student.next_text_programming_text ?? null
          }
        />

        <ClassroomSubjectsField
          classrooms={classrooms}
          defaultClassroom={student.classroom}
          defaultSubjects={student.subjects ?? []}
          capacityRows={capacityRows ?? []}
          defaultEnrollmentRobotCapacityId={
            student.enrollment_robot_capacity_id ?? null
          }
          defaultEnrollmentProgCapacityId={
            student.enrollment_prog_capacity_id ?? null
          }
        />

        <StudentProgrammingLoginField
          defaultScratchId={student.scratch_login_id}
          defaultScratchPass={student.scratch_login_pass}
          defaultMinecraftLogin={student.minecraft_login}
        />
        <StudentCourseStartField
          defaultCourseStartRobotYm={student.course_start_robot_ym}
          defaultCourseStartProgrammingYm={student.course_start_programming_ym}
        />
        <StudentSkipPromotionField
          defaultSkipPromotionYm={
            student.promotion_type === "skip_grade"
              ? student.promotion_scheduled_ym
              : null
          }
        />

        <StudentLeaveField
          defaultLeaveFromYm={student.leave_from_ym}
          defaultLeaveUntilYm={student.leave_until_ym}
        />
        <StudentWithdrawalField defaultValue={student.withdrawal_until_ym} />

        <Field
          label="備考（継続）"
          htmlFor="persistent_memo"
          hint="トップの当日ボードにも表示されます（例: タブレット有り）"
        >
          <textarea
            id="persistent_memo"
            name="persistent_memo"
            rows={3}
            maxLength={500}
            defaultValue={
              student.persistent_memo?.trim() || student.note?.trim() || ""
            }
            className={inputClass}
          />
        </Field>

        {error ? (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {decodeURIComponent(error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Link
            href={`/students/${student.id}`}
            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium px-4 py-2.5"
          >
            キャンセル
          </Link>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium px-4 py-2.5"
          >
            保存する
          </button>
        </div>
      </form>

      <section className="mt-8 space-y-4 bg-sky-50/80 border border-sky-200 rounded-2xl p-5 sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-sky-950">保護者ログインとの紐付け</h2>
          <p className="text-xs text-sky-900/80 mt-1 leading-relaxed">
            振替申請（<code className="text-xs">/apply</code>）は上記の<strong>生徒IDと誕生日</strong>でログインできます。予定確認（<code className="text-xs">/parent</code>）は、保護者のメールアドレスを紐付けると表示されます。
          </p>
        </div>

        {parentMsg ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {decodeURIComponent(parentMsg)}
          </p>
        ) : null}
        {parentError ? (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {decodeURIComponent(parentError)}
          </p>
        ) : null}

        {(linkRows ?? []).length > 0 ? (
          <ul className="space-y-2">
            {(linkRows ?? []).map((row) => {
              const prof = profileById.get(row.parent_user_id);
              const label =
                prof?.email ??
                prof?.display_name ??
                row.parent_user_id.slice(0, 8) + "…";
              return (
                <li
                  key={row.parent_user_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white border border-sky-100 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{label}</p>
                    {prof?.display_name?.trim() ? (
                      <p className="text-xs text-slate-500 truncate">
                        {prof.display_name}
                      </p>
                    ) : null}
                  </div>
                  <form action={unlinkParentFromStudent}>
                    <input type="hidden" name="studentId" value={student.id} />
                    <input
                      type="hidden"
                      name="parentUserId"
                      value={row.parent_user_id}
                    />
                    <button
                      type="submit"
                      className="text-xs font-medium text-rose-700 hover:underline"
                    >
                      紐付け解除
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">まだ紐付けがありません。</p>
        )}

        <form action={linkParentToStudent} className="space-y-2 pt-1 border-t border-sky-200">
          <input type="hidden" name="studentId" value={student.id} />
          <Field
            label="保護者メールアドレス"
            htmlFor="parentEmail"
            hint="Supabase に登録済みのメールと一致させてください。"
          >
            <input
              id="parentEmail"
              name="parentEmail"
              type="email"
              autoComplete="off"
              placeholder="parent@example.com"
              className={inputClass}
            />
          </Field>
          <button
            type="submit"
            className="rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium px-4 py-2.5"
          >
            紐付けを追加
          </button>
        </form>
      </section>
    </div>
  );
}
