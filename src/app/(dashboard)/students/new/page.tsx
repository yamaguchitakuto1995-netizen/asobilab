import Link from "next/link";
import { ClassroomSubjectsField } from "@/components/ClassroomSubjectsField";
import { Field, inputClass } from "@/components/Field";
import { PageHeader } from "@/components/PageHeader";
import { StudentNextTextFormSection } from "@/components/StudentNextTextFormSection";
import { fetchClassrooms } from "@/lib/classrooms";
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

        <p className="text-xs text-slate-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 leading-relaxed">
          <span className="font-semibold text-amber-950">プルダウン</span>
          は学年の下・
          <a
            href="#student-next-text-curriculum"
            className="text-emerald-800 font-semibold underline underline-offset-2"
          >
            緑の「次回テキスト」枠
          </a>
          にあります（所属教室より<strong>上</strong>）。見えないときは
          <strong>⌘+Shift+R</strong>。
        </p>

        <StudentNextTextFormSection />

        <ClassroomSubjectsField
          classrooms={classrooms}
          capacityRows={capRows ?? []}
        />

        <Field
          label="メモ"
          htmlFor="note"
          hint="連絡先や担当科目など、任意のメモ"
        >
          <textarea
            id="note"
            name="note"
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
