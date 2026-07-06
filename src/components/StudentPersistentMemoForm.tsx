import { Field, inputClass } from "@/components/Field";
import { updateStudentPersistentMemo } from "@/app/(dashboard)/students/actions";

type Props = {
  studentId: string;
  defaultValue: string;
  saved?: boolean;
  error?: string;
};

export function StudentPersistentMemoForm({
  studentId,
  defaultValue,
  saved,
  error,
}: Props) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">備考（継続）</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          トップの当日ボードにも表示されます（例: タブレット有り）
        </p>
      </div>

      {saved ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          備考（継続）を保存しました。
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {decodeURIComponent(error)}
        </p>
      ) : null}

      <form action={updateStudentPersistentMemo} className="space-y-3">
        <input type="hidden" name="student_id" value={studentId} />
        <Field label="" htmlFor="persistent_memo">
          <textarea
            id="persistent_memo"
            name="persistent_memo"
            rows={3}
            maxLength={500}
            defaultValue={defaultValue}
            placeholder="タブレット有り、兄弟同席 など"
            className={inputClass}
          />
        </Field>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2"
          >
            保存する
          </button>
        </div>
      </form>
    </section>
  );
}
