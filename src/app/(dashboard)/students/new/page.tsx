import Link from "next/link";
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
import { fetchStudentsForSiblingPicker } from "@/lib/siblings";
import { createClient } from "@/lib/supabase/server";
import { GRADE_LEVELS, type LessonCapacity } from "@/lib/types";
import { createStudent } from "../actions";

type SearchParams = Promise<{ error?: string }>;

export default async function NewStudentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);
  const siblingCandidates = await fetchStudentsForSiblingPicker(supabase);
  const { data: capRows } = await supabase
    .from("lesson_capacities")
    .select("*")
    .order("classroom", { ascending: true })
    .order("day_of_week", { ascending: true })
    .order("period", { ascending: true })
    .returns<LessonCapacity[]>();

  return (
    <div className="max-w-lg">
      <PageHeader title="新規生徒の登録" />

      <form
        action={createStudent}
        className="space-y-4 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6"
      >
        <Field label="名前" htmlFor="name" required>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={80}
            className={inputClass}
            placeholder="例: 山田 太郎"
          />
        </Field>

        <Field label="ふりがな" htmlFor="name_kana" hint="コマ表などに表示します（任意）">
          <input
            id="name_kana"
            name="name_kana"
            type="text"
            maxLength={80}
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
            className={inputClass}
            placeholder="例: 10001"
            autoComplete="off"
          />
        </Field>

        <BirthdayMmddField />

        <Field label="学年" htmlFor="grade" required>
          <select id="grade" name="grade" required className={inputClass} defaultValue="">
            <option value="" disabled>
              選択してください
            </option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>

        <StudentSiblingField candidates={siblingCandidates} />

        <p className="text-xs text-slate-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 leading-relaxed">
          <span className="font-semibold text-amber-950">入力欄の場所</span>
          ：学年の下に
          <a href="#student-siblings" className="text-violet-800 font-semibold underline underline-offset-2 mx-0.5">
            兄弟・姉妹（紫）
          </a>
          、その下に
          <a href="#student-next-text-curriculum" className="text-emerald-800 font-semibold underline underline-offset-2">
            次回テキスト（緑）
          </a>
          、さらに下に所属教室があります。
        </p>

        <StudentNextTextFormSection />

        <ClassroomSubjectsField
          classrooms={classrooms}
          capacityRows={capRows ?? []}
        />

        <StudentProgrammingLoginField />

        <StudentCourseStartField />
        <StudentLeaveField />
        <StudentWithdrawalField />

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
            href="/students"
            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium px-4 py-2.5"
          >
            キャンセル
          </Link>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium px-4 py-2.5"
          >
            登録する
          </button>
        </div>
      </form>
    </div>
  );
}
